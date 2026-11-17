import type { LatLng, MidpointMode, TravelMode } from '../types';

const R_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(h));
}

// Streets are not straight lines; this turns crow-flies distance into a rough road distance.
export const ROAD_FACTOR = 1.3;

// Rough speeds used for the midpoint search and as a fallback when Google can't route.
const SPEED: Record<TravelMode, { kmh: number; overheadMin: number }> = {
  drive: { kmh: 30, overheadMin: 5 },
  transit: { kmh: 17, overheadMin: 8 },
  bike: { kmh: 15, overheadMin: 1 },
  walk: { kmh: 4.8, overheadMin: 0 },
};

export function estMinutes(mode: TravelMode, a: LatLng, b: LatLng): number {
  const km = haversineKm(a, b) * ROAD_FACTOR;
  return (km / SPEED[mode].kmh) * 60 + SPEED[mode].overheadMin;
}

export function driveMinutesForKm(km: number): number {
  return ((km * ROAD_FACTOR) / SPEED.drive.kmh) * 60;
}

interface Traveller {
  loc: LatLng;
  mode: TravelMode;
}

/**
 * Finds the meeting point.
 * 'fair'  -> minimise the longest trip (with a small nudge toward lower average).
 * 'total' -> minimise the sum of everyone's travel time.
 * Uses estimated times, so it's free; real times are fetched only for actual venues.
 */
export function findMidpoint(people: Traveller[], mode: MidpointMode): { point: LatLng; maxMin: number } | null {
  if (!people.length) return null;
  const cost = (p: LatLng) => {
    let sum = 0;
    let max = 0;
    for (const t of people) {
      const m = estMinutes(t.mode, t.loc, p);
      sum += m;
      if (m > max) max = m;
    }
    return { c: mode === 'fair' ? max + (0.15 * sum) / people.length : sum, max };
  };

  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const t of people) {
    minLat = Math.min(minLat, t.loc.lat); maxLat = Math.max(maxLat, t.loc.lat);
    minLng = Math.min(minLng, t.loc.lng); maxLng = Math.max(maxLng, t.loc.lng);
  }
  const padLat = Math.max((maxLat - minLat) * 0.1, 0.005);
  const padLng = Math.max((maxLng - minLng) * 0.1, 0.005);
  let box = { s: minLat - padLat, n: maxLat + padLat, w: minLng - padLng, e: maxLng + padLng };

  let best = { p: { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 }, c: Infinity, max: 0 };
  // Coarse grid, then two rounds of refinement around the best cell.
  for (let round = 0; round < 3; round++) {
    const N = 30;
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        const p = { lat: box.s + ((box.n - box.s) * i) / N, lng: box.w + ((box.e - box.w) * j) / N };
        const r = cost(p);
        if (r.c < best.c) best = { p, c: r.c, max: r.max };
      }
    }
    const hLat = ((box.n - box.s) / N) * 2;
    const hLng = ((box.e - box.w) / N) * 2;
    box = { s: best.p.lat - hLat, n: best.p.lat + hLat, w: best.p.lng - hLng, e: best.p.lng + hLng };
  }
  return { point: best.p, maxMin: best.max };
}

/** Only ask Google for time-dependent routing when the outing is soon enough for it to be meaningful. */
export function timingFor(startsAtIso: string): { arrivalTime?: string; departureTime?: string } {
  const start = new Date(startsAtIso).getTime();
  const now = Date.now();
  const ok = (t: number) => t > now + 60_000 && t < now + 30 * 86_400_000;
  const dep = start - 30 * 60_000;
  return {
    arrivalTime: ok(start) ? new Date(start).toISOString() : undefined,
    departureTime: ok(dep) ? new Date(dep).toISOString() : undefined,
  };
}
