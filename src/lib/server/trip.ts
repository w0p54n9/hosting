import 'server-only';
import { computeRoute, mapsLink, type RouteResult } from './google';
import { estMinutes, timingFor } from './geo';
import { matchCarpools } from './plan';
import { originLabel, originOf, startsAtOffice, type Loaded, type ParticipantRow } from './data';
import type { LatLng, MyTrip, Plan, TravelMode, TripStep } from '../types';

const PICKUP_MIN = 2; // time spent at each pickup
const PARK_MIN = 3;   // time to park at the venue

async function safeRoute(o: LatLng, d: LatLng, via: LatLng[], mode: TravelMode, timing: ReturnType<typeof timingFor>): Promise<RouteResult | null> {
  try {
    return await computeRoute(o, d, via, mode, timing);
  } catch (err) {
    console.error('computeRoute failed', mode, err);
    return null;
  }
}

/** Directions for one person, built on the server so other people's addresses stay private. */
export async function buildTrip(l: Loaded, plan: Plan, me: ParticipantRow): Promise<MyTrip | null> {
  const venue = plan.venues.find((v) => v.placeId === plan.selectedPlaceId);
  const origin = originOf(l, me);
  if (!venue || !origin) return null;

  // 'home' below means "where I'm setting off from": my home, or the office.
  const home = origin;
  const fromOffice = startsAtOffice(l, me);
  const V = venue.location;
  const start = new Date(l.event.starts_at).getTime();
  const iso = (t: number) => new Date(t).toISOString();
  const timing = timingFor(l.event.starts_at);
  const venueInfo = { name: venue.name, address: venue.address, location: V };
  const arrive: TripStep = { icon: '🏁', text: `Arrive at ${venue.name}`, highlight: true };
  const match = matchCarpools(l, V);
  const byId = new Map(l.people.map((p) => [p.id, p]));
  const locOf = (id: string) => originOf(l, byId.get(id)!)!;

  // ----- Driver: route through each pickup -----
  if (me.role === 'driver') {
    const riders = match.order.get(me.id) ?? [];
    const stops = riders.map((r) => locOf(r.id));
    const route = await safeRoute(home, V, stops, 'drive', timing);
    const legMins = route
      ? route.legs.map((lg) => lg.durationMin)
      : [home, ...stops].map((from, i) => estMinutes('drive', from, i < stops.length ? stops[i] : V));
    const total = legMins.reduce((a, b) => a + b, 0) + PICKUP_MIN * riders.length + PARK_MIN;
    const leave = start - total * 60_000;

    let t = leave;
    const pickups = riders.map((r, i) => {
      t += legMins[i] * 60_000;
      const at = t;
      t += PICKUP_MIN * 60_000;
      return { name: r.name, address: originLabel(l, r), at: iso(at), location: locOf(r.id) };
    });

    const steps: TripStep[] = [];
    if (route) {
      route.legs.forEach((leg, i) => {
        steps.push(...leg.steps);
        if (i < pickups.length) steps.push({ icon: '🙋', text: `Pick up ${pickups[i].name}`, detail: pickups[i].address, highlight: true });
      });
    } else {
      pickups.forEach((p) => steps.push({ icon: '🙋', text: `Pick up ${p.name}`, detail: p.address, highlight: true }));
    }
    steps.push(arrive);

    return {
      mode: 'drive',
      minutes: Math.round(total),
      km: route ? +route.km.toFixed(1) : null,
      leaveAt: iso(leave),
      arriveAt: iso(start),
      polyline: route?.polyline ?? null,
      steps,
      pickups,
      estimated: !route,
      mapsUrl: mapsLink(home, venue, 'drive', stops),
      home,
      fromOffice,
      venue: venueInfo,
    };
  }

  // ----- Rider with a driver: pickup time comes from the driver's route -----
  const driverId = me.role === 'rider' ? match.riderDriver.get(me.id) : undefined;
  if (driverId) {
    const driver = l.people.find((p) => p.id === driverId)!;
    const driverHome = locOf(driverId);
    const riders = match.order.get(driverId) ?? [];
    const stops = riders.map((r) => locOf(r.id));
    const [driverRoute, myRoute] = await Promise.all([
      safeRoute(driverHome, V, stops, 'drive', timing),
      safeRoute(home, V, [], 'drive', timing), // only for drawing my own line; never shows other riders' homes
    ]);
    const legMins = driverRoute
      ? driverRoute.legs.map((lg) => lg.durationMin)
      : [driverHome, ...stops].map((from, i) => estMinutes('drive', from, i < stops.length ? stops[i] : V));
    const total = legMins.reduce((a, b) => a + b, 0) + PICKUP_MIN * riders.length + PARK_MIN;
    const leave = start - total * 60_000;
    const idx = riders.findIndex((r) => r.id === me.id);
    const pickupAt = leave + (legMins.slice(0, idx + 1).reduce((a, b) => a + b, 0) + PICKUP_MIN * idx) * 60_000;
    const minutes = Math.round((start - pickupAt) / 60_000);

    return {
      mode: 'drive',
      minutes,
      km: myRoute ? +myRoute.km.toFixed(1) : null,
      leaveAt: iso(pickupAt),
      pickupAt: iso(pickupAt),
      arriveAt: iso(start),
      polyline: myRoute?.polyline ?? null,
      steps: [
        { icon: '🙋', text: `${driver.name} picks you up ${fromOffice ? 'at the office' : 'at home'}`, highlight: true },
        { icon: '🚗', text: 'Ride together', detail: `about ${minutes} min` },
        arrive,
      ],
      driverName: driver.name,
      estimated: !driverRoute,
      mapsUrl: mapsLink(home, venue, 'drive'),
      home,
      fromOffice,
      venue: venueInfo,
    };
  }

  // ----- Everyone else (and riders without a seat, who fall back to transit) -----
  const unmatched = me.role === 'rider';
  const mode: TravelMode = unmatched ? 'transit' : (me.role as TravelMode);
  const route = await safeRoute(home, V, [], mode, timing);
  const total = route ? route.durationMin + (mode === 'drive' ? PARK_MIN : 0) : estMinutes(mode, home, V);
  const leave = start - total * 60_000;
  return {
    mode,
    minutes: Math.round(total),
    km: route ? +route.km.toFixed(1) : null,
    leaveAt: iso(leave),
    arriveAt: iso(start),
    polyline: route?.polyline ?? null,
    steps: [...(route?.legs.flatMap((lg) => lg.steps) ?? []), arrive],
    unmatched,
    estimated: !route,
    mapsUrl: mapsLink(home, venue, mode),
    home,
    fromOffice,
    venue: venueInfo,
  };
}
