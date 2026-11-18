import 'server-only';
import type { LatLng, PlaceInfo, TravelMode, TripStep, Venue } from '../types';

// Thin wrappers around Google Places API (New) and Routes API.
// All calls use the server key, so addresses and coordinates never touch a browser key.

const PLACES = 'https://places.googleapis.com/v1';
const ROUTES = 'https://routes.googleapis.com';

function key(): string {
  const k = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!k) throw new Error('Missing GOOGLE_MAPS_SERVER_KEY');
  return k;
}

async function call<T>(url: string, opts: { method?: 'GET' | 'POST'; body?: unknown; fieldMask?: string }): Promise<T> {
  const headers: Record<string, string> = { 'X-Goog-Api-Key': key() };
  if (opts.fieldMask) headers['X-Goog-FieldMask'] = opts.fieldMask;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, {
    method: opts.method ?? 'POST',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google API ${res.status} on ${new URL(url).pathname}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

const latLng = (p: LatLng) => ({ latitude: p.lat, longitude: p.lng });

// ---------- Places ----------

export interface Suggestion {
  placeId: string;
  main: string;
  secondary: string;
}

export async function autocomplete(input: string, sessionToken?: string): Promise<Suggestion[]> {
  type Resp = {
    suggestions?: {
      placePrediction?: {
        placeId: string;
        text?: { text: string };
        structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } };
      };
    }[];
  };
  const body: Record<string, unknown> = { input };
  if (sessionToken) body.sessionToken = sessionToken;
  const r = await call<Resp>(`${PLACES}/places:autocomplete`, { body });
  return (r.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => !!p?.placeId)
    .map((p) => ({
      placeId: p.placeId,
      main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
      secondary: p.structuredFormat?.secondaryText?.text ?? '',
    }));
}

export async function placeLocation(placeId: string, sessionToken?: string): Promise<{ address: string; location: LatLng }> {
  type Resp = { formattedAddress?: string; location?: { latitude: number; longitude: number } };
  const qs = sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : '';
  const r = await call<Resp>(`${PLACES}/places/${encodeURIComponent(placeId)}${qs}`, {
    method: 'GET',
    fieldMask: 'formattedAddress,location',
  });
  if (!r.location) throw new Error('That address could not be located');
  return { address: r.formattedAddress ?? '', location: { lat: r.location.latitude, lng: r.location.longitude } };
}

export interface SearchOptions {
  /** Ask Google whether each place serves vegetarian food. */
  veg?: boolean;
  /** Ask Google whether each place has a wheelchair-accessible entrance. */
  stepFree?: boolean;
  /** Only these price levels (Google drops places with no price level when this is set). */
  priceLevels?: string[];
}

export async function searchText(
  query: string,
  center: LatLng,
  radiusM: number,
  pageSize: number,
  opts: SearchOptions = {},
): Promise<Omit<Venue, 'category'>[]> {
  type Place = {
    id: string;
    displayName?: { text: string };
    formattedAddress?: string;
    location?: { latitude: number; longitude: number };
    rating?: number;
    userRatingCount?: number;
    priceLevel?: string;
    googleMapsUri?: string;
    businessStatus?: string;
    servesVegetarianFood?: boolean;
    accessibilityOptions?: { wheelchairAccessibleEntrance?: boolean };
  };
  // The extra fields cost more, so only ask for them when someone needs them.
  const extra = [opts.veg ? 'places.servesVegetarianFood' : '', opts.stepFree ? 'places.accessibilityOptions' : ''].filter(Boolean);
  const r = await call<{ places?: Place[] }>(`${PLACES}/places:searchText`, {
    body: {
      textQuery: query,
      pageSize,
      locationBias: { circle: { center: latLng(center), radius: Math.min(50000, Math.max(100, radiusM)) } },
      ...(opts.priceLevels?.length ? { priceLevels: opts.priceLevels } : {}),
    },
    fieldMask: [
      'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.googleMapsUri,places.businessStatus',
      ...extra,
    ].join(','),
  });
  return (r.places ?? [])
    .filter((p) => p.location && (!p.businessStatus || p.businessStatus === 'OPERATIONAL'))
    .map((p) => ({
      placeId: p.id,
      name: p.displayName?.text ?? 'Unnamed place',
      address: p.formattedAddress ?? '',
      location: { lat: p.location!.latitude, lng: p.location!.longitude },
      rating: p.rating,
      ratingCount: p.userRatingCount,
      priceLevel: p.priceLevel,
      mapsUri: p.googleMapsUri,
      ...(opts.veg && typeof p.servesVegetarianFood === 'boolean' ? { veg: p.servesVegetarianFood } : {}),
      ...(opts.stepFree && typeof p.accessibilityOptions?.wheelchairAccessibleEntrance === 'boolean'
        ? { stepFree: p.accessibilityOptions.wheelchairAccessibleEntrance }
        : {}),
    }));
}

// Booking details for the chosen place: cached in memory, since they rarely change.
const infoCache = new Map<string, { at: number; info: PlaceInfo }>();
const INFO_TTL_MS = 12 * 60 * 60 * 1000;

export async function placeInfo(placeId: string): Promise<PlaceInfo> {
  const hit = infoCache.get(placeId);
  if (hit && Date.now() - hit.at < INFO_TTL_MS) return hit.info;
  type Resp = {
    nationalPhoneNumber?: string;
    internationalPhoneNumber?: string;
    websiteUri?: string;
    reservable?: boolean;
    regularOpeningHours?: { weekdayDescriptions?: string[] };
  };
  const r = await call<Resp>(`${PLACES}/places/${encodeURIComponent(placeId)}`, {
    method: 'GET',
    fieldMask: 'nationalPhoneNumber,internationalPhoneNumber,websiteUri,reservable,regularOpeningHours.weekdayDescriptions',
  });
  const info: PlaceInfo = {
    phone: r.nationalPhoneNumber || r.internationalPhoneNumber,
    website: r.websiteUri,
    reservable: r.reservable,
    hours: r.regularOpeningHours?.weekdayDescriptions,
  };
  if (infoCache.size > 500) infoCache.clear();
  infoCache.set(placeId, { at: Date.now(), info });
  return info;
}

// ---------- Routes ----------

const GOOGLE_MODE: Record<TravelMode, string> = { drive: 'DRIVE', transit: 'TRANSIT', bike: 'BICYCLE', walk: 'WALK' };

interface Timing {
  arrivalTime?: string;
  departureTime?: string;
}

function timingFields(mode: TravelMode, t: Timing): Record<string, unknown> {
  if (mode === 'drive') {
    return t.departureTime ? { routingPreference: 'TRAFFIC_AWARE', departureTime: t.departureTime } : { routingPreference: 'TRAFFIC_UNAWARE' };
  }
  if (mode === 'transit' && t.arrivalTime) return { arrivalTime: t.arrivalTime };
  return {};
}

const secs = (d?: string) => (d ? parseInt(d, 10) || 0 : 0);

/** minutes[originIndex][destinationIndex]; NaN where no route was found. */
export async function routeMatrix(origins: LatLng[], destinations: LatLng[], mode: TravelMode, timing: Timing): Promise<number[][]> {
  const out = origins.map(() => destinations.map(() => NaN));
  if (!origins.length || !destinations.length) return out;
  // Element limits: 625 per request (100 for transit / traffic-aware). Keep chunks small and safe.
  const maxElements = mode === 'transit' || (mode === 'drive' && timing.departureTime) ? 100 : 625;
  const oChunk = Math.min(origins.length, 10);
  const dChunk = Math.max(1, Math.min(25, Math.floor(maxElements / oChunk)));
  type El = { originIndex?: number; destinationIndex?: number; duration?: string; condition?: string };

  const jobs: Promise<void>[] = [];
  for (let oi = 0; oi < origins.length; oi += oChunk) {
    for (let di = 0; di < destinations.length; di += dChunk) {
      const os = origins.slice(oi, oi + oChunk);
      const ds = destinations.slice(di, di + dChunk);
      jobs.push(
        call<El[]>(`${ROUTES}/distanceMatrix/v2:computeRouteMatrix`, {
          body: {
            origins: os.map((p) => ({ waypoint: { location: { latLng: latLng(p) } } })),
            destinations: ds.map((p) => ({ waypoint: { location: { latLng: latLng(p) } } })),
            travelMode: GOOGLE_MODE[mode],
            ...timingFields(mode, timing),
          },
          fieldMask: 'originIndex,destinationIndex,duration,condition',
        }).then((els) => {
          for (const e of els ?? []) {
            // proto3 JSON omits zero values, so a missing index means 0
            const o = oi + (e.originIndex ?? 0);
            const d = di + (e.destinationIndex ?? 0);
            if (e.condition === 'ROUTE_EXISTS' && e.duration) out[o][d] = secs(e.duration) / 60;
          }
        }),
      );
    }
  }
  await Promise.all(jobs);
  return out;
}

export interface RouteResult {
  durationMin: number;
  km: number;
  polyline: string | null;
  legs: { durationMin: number; steps: TripStep[] }[];
}

export async function computeRoute(
  origin: LatLng,
  destination: LatLng,
  intermediates: LatLng[],
  mode: TravelMode,
  timing: Timing,
): Promise<RouteResult | null> {
  type Step = {
    distanceMeters?: number;
    travelMode?: string;
    navigationInstruction?: { maneuver?: string; instructions?: string };
    transitDetails?: {
      headsign?: string;
      stopCount?: number;
      stopDetails?: { departureStop?: { name?: string }; arrivalStop?: { name?: string } };
      localizedValues?: { departureTime?: { time?: { text?: string } } };
      transitLine?: { name?: string; nameShort?: string; vehicle?: { name?: { text?: string } } };
    };
  };
  type Resp = {
    routes?: {
      duration?: string;
      distanceMeters?: number;
      polyline?: { encodedPolyline?: string };
      legs?: { duration?: string; steps?: Step[] }[];
    }[];
  };
  const r = await call<Resp>(`${ROUTES}/directions/v2:computeRoutes`, {
    body: {
      origin: { location: { latLng: latLng(origin) } },
      destination: { location: { latLng: latLng(destination) } },
      ...(intermediates.length && mode !== 'transit'
        ? { intermediates: intermediates.map((p) => ({ location: { latLng: latLng(p) } })) }
        : {}),
      travelMode: GOOGLE_MODE[mode],
      ...timingFields(mode, timing),
      computeAlternativeRoutes: false,
      languageCode: 'en',
    },
    fieldMask:
      'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.duration,routes.legs.steps.distanceMeters,routes.legs.steps.travelMode,routes.legs.steps.navigationInstruction,routes.legs.steps.transitDetails',
  });
  const route = r.routes?.[0];
  if (!route) return null;
  return {
    durationMin: secs(route.duration) / 60,
    km: (route.distanceMeters ?? 0) / 1000,
    polyline: route.polyline?.encodedPolyline ?? null,
    legs: (route.legs ?? []).map((leg) => ({
      durationMin: secs(leg.duration) / 60,
      steps: (leg.steps ?? []).map(stepView).filter((s): s is TripStep => !!s),
    })),
  };

  function stepView(s: Step): TripStep | null {
    const dist = s.distanceMeters ? fmtDist(s.distanceMeters) : undefined;
    const td = s.transitDetails;
    if (td) {
      const line = td.transitLine?.nameShort || td.transitLine?.name || '';
      const vehicle = td.transitLine?.vehicle?.name?.text || 'Transit';
      const from = td.stopDetails?.departureStop?.name;
      const to = td.stopDetails?.arrivalStop?.name;
      const when = td.localizedValues?.departureTime?.time?.text;
      return {
        icon: '🚌',
        text: `${vehicle} ${line}${td.headsign ? ` toward ${td.headsign}` : ''}`.replace(/\s+/g, ' ').trim(),
        detail: [from && to ? `${from} → ${to}` : '', td.stopCount ? `${td.stopCount} stops` : '', when ? `departs ${when}` : '']
          .filter(Boolean)
          .join(' · '),
        highlight: true,
      };
    }
    const text = s.navigationInstruction?.instructions?.replace(/\s*\n\s*/g, ' ');
    if (!text) return null;
    return { icon: s.travelMode === 'WALK' && mode === 'transit' ? '🚶' : maneuverIcon(s.navigationInstruction?.maneuver), text, detail: dist };
  }
}

function maneuverIcon(m?: string): string {
  if (!m) return '↑';
  if (m.includes('UTURN')) return '↶';
  if (m.includes('ROUNDABOUT')) return '⟳';
  if (m.includes('LEFT')) return '↰';
  if (m.includes('RIGHT')) return '↱';
  if (m.includes('MERGE') || m.includes('RAMP') || m.includes('FORK')) return '↗';
  if (m.includes('FERRY')) return '⛴';
  return '↑';
}

const fmtDist = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

// ---------- Google Maps links for handing off turn-by-turn ----------

const GMAPS_MODE: Record<TravelMode, string> = { drive: 'driving', transit: 'transit', bike: 'bicycling', walk: 'walking' };

export function mapsLink(origin: LatLng, venue: { name: string; placeId: string; location: LatLng }, mode: TravelMode, waypoints: LatLng[] = []) {
  const p = new URLSearchParams({
    api: '1',
    origin: `${origin.lat},${origin.lng}`,
    destination: venue.name,
    destination_place_id: venue.placeId,
    travelmode: GMAPS_MODE[mode],
  });
  if (waypoints.length) p.set('waypoints', waypoints.map((w) => `${w.lat},${w.lng}`).join('|'));
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}
