import 'server-only';
import { createHash } from 'crypto';
import { db } from './supabase';
import { routeMatrix, searchText } from './google';
import { driveMinutesForKm, estMinutes, findMidpoint, haversineKm, timingFor } from './geo';
import { toLatLng, type Loaded, type ParticipantRow } from './data';
import { categoriesFor, travelModeOf } from '../categories';
import type { LatLng, PersonEstimate, Plan, RankedVenue, TravelMode, Venue } from '../types';

/** The expensive part (Google calls), cached per event until its inputs change. */
interface Core {
  midpoint: LatLng | null;
  midpointMaxMin: number | null;
  venues: Venue[];
  times: Record<string, Record<string, number>>; // placeId -> participantId -> minutes
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_VENUES = 20;

function located(l: Loaded) {
  return l.people
    .filter((p) => l.locations.has(p.id))
    .map((p) => ({ p, loc: toLatLng(l.locations.get(p.id)!), mode: travelModeOf(p.role) as TravelMode }));
}

function inputHash(l: Loaded): string {
  const people = located(l).map(({ p, loc }) => [p.id, p.role, [...p.likes].sort(), +loc.lat.toFixed(4), +loc.lng.toFixed(4)]);
  return createHash('sha256')
    .update(JSON.stringify([l.event.kind, l.event.midpoint_mode, l.event.starts_at, people]))
    .digest('hex');
}

export async function getCore(l: Loaded): Promise<Core> {
  const hash = inputHash(l);
  const { data: cached } = await db()
    .from('plan_cache')
    .select('input_hash, plan, updated_at')
    .eq('event_id', l.event.id)
    .maybeSingle<{ input_hash: string; plan: Core; updated_at: string }>();

  const chosen = l.event.chosen_place_id;
  if (cached && cached.input_hash === hash && Date.now() - new Date(cached.updated_at).getTime() < CACHE_TTL_MS) {
    if (!chosen || cached.plan.venues.some((v) => v.placeId === chosen)) return cached.plan;
  }
  const core = await buildCore(l);
  const { error } = await db()
    .from('plan_cache')
    .upsert({ event_id: l.event.id, input_hash: hash, plan: core, updated_at: new Date().toISOString() });
  if (error) console.error('plan_cache upsert failed', error);
  return core;
}

async function buildCore(l: Loaded): Promise<Core> {
  const ppl = located(l);
  if (!ppl.length) return { midpoint: null, midpointMaxMin: null, venues: [], times: {} };

  const mid = findMidpoint(ppl.map(({ loc, mode }) => ({ loc, mode })), l.event.midpoint_mode)!;
  const spreadKm = Math.max(...ppl.map(({ loc }) => haversineKm(loc, mid.point)));
  const radiusM = Math.round(Math.min(10_000, Math.max(1_500, spreadKm * 1000 * 0.35)));

  // Search the categories people actually want (most-wanted first); pad to at least 3.
  const cats = categoriesFor(l.event.kind);
  const wanted = cats
    .map((c) => ({ c, n: ppl.filter(({ p }) => p.likes.includes(c.key)).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 6)
    .map((x) => x.c);
  for (const c of cats) {
    if (wanted.length >= 3) break;
    if (!wanted.includes(c)) wanted.push(c);
  }

  const results = await Promise.all(
    wanted.map((c) =>
      searchText(c.query, mid.point, radiusM, 5)
        .then((list) => list.map((v) => ({ ...v, category: c.key })))
        .catch((err) => {
          console.error('searchText failed', c.key, err);
          return [] as Venue[];
        }),
    ),
  );

  const byId = new Map<string, Venue>();
  // Interleave categories so each one gets represented before we trim.
  for (let i = 0; i < 5; i++) for (const list of results) if (list[i] && !byId.has(list[i].placeId)) byId.set(list[i].placeId, list[i]);
  let venues = [...byId.values()].slice(0, MAX_VENUES);
  const snap = l.event.chosen_place;
  if (snap && !venues.some((v) => v.placeId === snap.placeId)) venues = [...venues, snap];

  // Start from estimates, then overwrite with real travel times per mode.
  const times: Core['times'] = {};
  for (const v of venues) {
    times[v.placeId] = {};
    for (const { p, loc, mode } of ppl) times[v.placeId][p.id] = Math.round(estMinutes(mode, loc, v.location));
  }
  const groups = new Map<TravelMode, typeof ppl>();
  for (const x of ppl) groups.set(x.mode, [...(groups.get(x.mode) ?? []), x]);
  const timing = timingFor(l.event.starts_at);

  await Promise.all(
    [...groups.entries()].map(async ([mode, g]) => {
      try {
        const m = await routeMatrix(g.map((x) => x.loc), venues.map((v) => v.location), mode, timing);
        g.forEach((x, i) =>
          venues.forEach((v, j) => {
            const t = m[i][j];
            if (Number.isFinite(t)) times[v.placeId][x.p.id] = Math.round(t + (mode === 'drive' ? 3 : 0)); // +3 min to park
          }),
        );
      } catch (err) {
        console.error('routeMatrix failed', mode, err);
      }
    }),
  );

  return { midpoint: mid.point, midpointMaxMin: Math.round(mid.maxMin), venues, times };
}

// ---------- carpools ----------

export interface CarpoolMatch {
  order: Map<string, ParticipantRow[]>; // driverId -> riders in pickup order
  riderDriver: Map<string, string>; // riderId -> driverId
  unmatched: ParticipantRow[];
}

/** Greedy: give each rider to the driver with the smallest detour, then order pickups nearest-first. */
export function matchCarpools(l: Loaded, venue: LatLng): CarpoolMatch {
  const loc = (id: string) => toLatLng(l.locations.get(id)!);
  const drivers = l.people.filter((p) => p.role === 'driver' && p.seats > 0 && l.locations.has(p.id));
  const riders = l.people.filter((p) => p.role === 'rider' && l.locations.has(p.id));
  const cap = new Map(drivers.map((d) => [d.id, d.seats]));
  const assigned = new Map<string, ParticipantRow[]>(drivers.map((d) => [d.id, []]));
  const riderDriver = new Map<string, string>();

  const pairs = riders.flatMap((r) =>
    drivers.map((d) => ({
      r,
      d,
      detour: haversineKm(loc(d.id), loc(r.id)) + haversineKm(loc(r.id), venue) - haversineKm(loc(d.id), venue),
    })),
  );
  pairs.sort((a, b) => a.detour - b.detour);
  for (const { r, d } of pairs) {
    if (riderDriver.has(r.id) || (cap.get(d.id) ?? 0) <= 0) continue;
    riderDriver.set(r.id, d.id);
    cap.set(d.id, (cap.get(d.id) ?? 0) - 1);
    assigned.get(d.id)!.push(r);
  }

  const order = new Map<string, ParticipantRow[]>();
  for (const d of drivers) {
    let cur = loc(d.id);
    const left = [...assigned.get(d.id)!];
    const seq: ParticipantRow[] = [];
    while (left.length) {
      left.sort((a, b) => haversineKm(cur, loc(a.id)) - haversineKm(cur, loc(b.id)));
      const next = left.shift()!;
      seq.push(next);
      cur = loc(next.id);
    }
    order.set(d.id, seq);
  }
  return { order, riderDriver, unmatched: riders.filter((r) => !riderDriver.has(r.id)) };
}

// ---------- ranking ----------

export function derivePlan(l: Loaded, core: Core): Plan {
  const ppl = located(l);
  const n = ppl.length;
  const fair = l.event.midpoint_mode === 'fair';

  const ranked: RankedVenue[] = core.venues
    .map((v) => {
      const ts = ppl.map(({ p, loc, mode }) => ({ id: p.id, t: core.times[v.placeId]?.[p.id] ?? estMinutes(mode, loc, v.location) }));
      const avg = n ? ts.reduce((a, b) => a + b.t, 0) / n : 0;
      const worst = n ? ts.reduce((a, b) => (b.t > a.t ? b : a)) : null;
      const max = worst ? worst.t : 0;
      const fanIds = ppl.filter(({ p }) => p.likes.includes(v.category)).map(({ p }) => p.id);
      const pref = n ? fanIds.length / n : 0;
      const ratingBonus = v.rating ? (v.rating - 4) * 4 : 0;
      // ~45 "minutes" of goodwill if everyone loves it; travel time counts against.
      const score = pref * 45 - (fair ? max : avg) - 0.25 * (max - avg) + ratingBonus;
      return {
        ...v,
        fanIds,
        avgMin: Math.round(avg),
        maxMin: Math.round(max),
        worstId: worst?.id ?? null,
        score,
        kmFromMidpoint: core.midpoint ? +haversineKm(core.midpoint, v.location).toFixed(1) : 0,
      };
    })
    .sort((a, b) => b.score - a.score);

  const selected = ranked.find((v) => v.placeId === l.event.chosen_place_id) ?? ranked[0] ?? null;
  const estimates: Record<string, PersonEstimate> = {};
  let carpools: Plan['carpools'] = [];
  let unmatchedRiderIds: string[] = [];

  if (selected) {
    const V = selected.location;
    const match = matchCarpools(l, V);
    carpools = [...match.order.entries()].map(([driverId, riders]) => {
      const d = l.people.find((p) => p.id === driverId)!;
      return { driverId, riderIds: riders.map((r) => r.id), openSeats: Math.max(0, d.seats - riders.length) };
    });
    unmatchedRiderIds = match.unmatched.map((r) => r.id);

    for (const { p, loc, mode } of ppl) {
      const base = core.times[selected.placeId]?.[p.id] ?? Math.round(estMinutes(mode, loc, V));
      if (p.role === 'driver') {
        const riders = match.order.get(p.id) ?? [];
        let km = 0;
        let cur = loc;
        for (const r of riders) {
          const rl = toLatLng(l.locations.get(r.id)!);
          km += haversineKm(cur, rl);
          cur = rl;
        }
        km += haversineKm(cur, V);
        const extra = riders.length ? Math.max(0, driveMinutesForKm(km) - driveMinutesForKm(haversineKm(loc, V))) + 2 * riders.length : 0;
        estimates[p.id] = { minutes: Math.round(base + extra), mode: 'drive' };
      } else if (p.role === 'rider') {
        const d = match.riderDriver.get(p.id);
        estimates[p.id] = d
          ? { minutes: base, mode: 'drive', driverId: d }
          : { minutes: Math.round(estMinutes('transit', loc, V)), mode: 'transit', unmatched: true };
      } else {
        estimates[p.id] = { minutes: base, mode };
      }
    }
  }

  return {
    midpoint: core.midpoint,
    midpointMaxMin: core.midpointMaxMin,
    venues: ranked,
    selectedPlaceId: selected?.placeId ?? null,
    carpools,
    unmatchedRiderIds,
    estimates,
  };
}

export function emptyPlan(error?: string): Plan {
  return { midpoint: null, midpointMaxMin: null, venues: [], selectedPlaceId: null, carpools: [], unmatchedRiderIds: [], estimates: {}, error };
}

export async function planFor(l: Loaded): Promise<Plan> {
  try {
    return derivePlan(l, await getCore(l));
  } catch (err) {
    console.error('plan failed', err);
    return emptyPlan('Places could not be loaded right now. Try again in a minute.');
  }
}
