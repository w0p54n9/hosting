import 'server-only';
import { db } from './supabase';
import { hashToken } from './tokens';
import { PERSON_COLORS } from '../categories';
import { bestDay, dayIn, timeIn, todayIn, validTz } from '../dates';
import { NEEDS } from '../categories';
import type {
  Availability, DateStatus, EventKind, LatLng, Me, MidpointMode, Need, NeedsSummary, Plan, PriceCap, Progress, PublicEvent, PublicPerson, Role, Rsvp,
  StartFrom, Venue,
} from '../types';

export interface Office {
  address: string;
  lat: number;
  lng: number;
}

export interface EventRow {
  id: string;
  slug: string;
  title: string;
  starts_at: string;
  kind: EventKind;
  midpoint_mode: MidpointMode;
  chosen_place_id: string | null;
  chosen_place: Venue | null;
  organizer_token_hash: string;
  // Optional so a database without migration 0002 still works.
  date_status?: DateStatus;
  arrive_time?: string | null;
  timezone?: string | null;
  office?: Office | null;
  // Migration 0005.
  finalized_at?: string | null;
  reply_by?: string | null;
  max_price?: PriceCap | null;
  addresses_purged_at?: string | null;
  created_at: string;
}

export interface ParticipantRow {
  id: string;
  event_id: string;
  name: string;
  role: Role;
  seats: number;
  likes: string[];
  show_address?: boolean;
  start_from?: StartFrom;
  place_vote?: string | null;
  rsvp?: Rsvp;
  phone?: string | null;
  needs?: Need[] | null;
  alt_start?: Office | null; // private "somewhere else" start: never shown to anyone else
  token_hash: string;
  created_at: string;
}

export interface LocationRow {
  participant_id: string;
  address: string;
  lat: number;
  lng: number;
}

export interface AvailabilityRow {
  participant_id: string;
  day: string;
}

export interface Loaded {
  event: EventRow;
  people: ParticipantRow[];
  locations: Map<string, LocationRow>;
  availability: AvailabilityRow[];
}

export async function loadEvent(slug: string): Promise<Loaded | null> {
  const { data: event, error } = await db().from('events').select('*').eq('slug', slug).maybeSingle<EventRow>();
  if (error) throw error;
  if (!event) return null;

  const { data: people, error: e2 } = await db()
    .from('participants')
    .select('*')
    .eq('event_id', event.id)
    .order('created_at', { ascending: true })
    .returns<ParticipantRow[]>();
  if (e2) throw e2;

  const ids = (people ?? []).map((p) => p.id);
  let locs: LocationRow[] = [];
  let availability: AvailabilityRow[] = [];
  if (ids.length) {
    const { data, error: e3 } = await db().from('participant_locations').select('*').in('participant_id', ids).returns<LocationRow[]>();
    if (e3) throw e3;
    locs = data ?? [];
    const { data: av, error: e4 } = await db().from('availability').select('participant_id, day').in('participant_id', ids).returns<AvailabilityRow[]>();
    if (e4) console.error('availability unavailable (run migration 0002?)', e4.message);
    else availability = av ?? [];
  }
  return { event, people: people ?? [], locations: new Map(locs.map((l) => [l.participant_id, l])), availability };
}

export const toLatLng = (l: LocationRow): LatLng => ({ lat: l.lat, lng: l.lng });

/** Starting from the office only counts when the host has set one. */
export const startsAtOffice = (l: Loaded, p: ParticipantRow) => p.start_from === 'office' && !!l.event.office;
/** Starting "somewhere else" only counts when that address is still on file. */
export const startsElsewhere = (_l: Loaded, p: ParticipantRow) => p.start_from === 'other' && !!p.alt_start;

export const startFromOf = (l: Loaded, p: ParticipantRow): StartFrom =>
  startsAtOffice(l, p) ? 'office' : startsElsewhere(l, p) ? 'other' : 'home';

/** Where this person sets off from for this outing: the office, somewhere else, or their home. */
export function originOf(l: Loaded, p: ParticipantRow): LatLng | null {
  if (startsAtOffice(l, p)) return { lat: l.event.office!.lat, lng: l.event.office!.lng };
  if (startsElsewhere(l, p)) return { lat: p.alt_start!.lat, lng: p.alt_start!.lng };
  const loc = l.locations.get(p.id);
  return loc ? toLatLng(loc) : null;
}

/** Human-readable starting point, e.g. for a driver's pickup list. */
export function originLabel(l: Loaded, p: ParticipantRow): string {
  if (startsAtOffice(l, p)) return `the office (${l.event.office!.address})`;
  if (startsElsewhere(l, p)) return p.alt_start!.address;
  return l.locations.get(p.id)?.address ?? '';
}

export const rsvpOf = (p: ParticipantRow): Rsvp => (p.rsvp === 'maybe' || p.rsvp === 'no' ? p.rsvp : 'going');
export const needsOf = (p: ParticipantRow): Need[] => (Array.isArray(p.needs) ? p.needs : []);

/**
 * The same outing with "can't make it" people left out. Use this for everything that plans:
 * the meeting spot, places, votes, carpools and the best day.
 */
export function planning(l: Loaded): Loaded {
  const people = l.people.filter((p) => rsvpOf(p) !== 'no');
  if (people.length === l.people.length) return l;
  const ids = new Set(people.map((p) => p.id));
  return { ...l, people, availability: l.availability.filter((a) => ids.has(a.participant_id)) };
}

/** True when we know where this person is starting from. */
export const usesLocation = (l: Loaded, p: ParticipantRow) => originOf(l, p) !== null;

export function findParticipant(l: Loaded, token: string | null): ParticipantRow | null {
  if (!token) return null;
  const h = hashToken(token);
  return l.people.find((p) => p.token_hash === h) ?? null;
}

export function isOrganizer(l: Loaded, token: string | null): boolean {
  return !!token && hashToken(token) === l.event.organizer_token_hash;
}

export const tzOf = (e: EventRow) => validTz(e.timezone);
export const arriveTimeOf = (e: EventRow) => e.arrive_time || timeIn(e.starts_at, tzOf(e));

export function publicEvent(e: EventRow): PublicEvent {
  return {
    slug: e.slug,
    title: e.title,
    startsAt: e.starts_at,
    kind: e.kind,
    midpointMode: e.midpoint_mode,
    chosenPlaceId: e.chosen_place_id,
    dateStatus: e.date_status === 'voting' ? 'voting' : 'set',
    arriveTime: arriveTimeOf(e),
    timezone: tzOf(e),
    office: e.office ? { address: e.office.address, location: { lat: e.office.lat, lng: e.office.lng } } : null,
    finalized: !!e.finalized_at,
    replyBy: e.reply_by ?? null,
    maxPrice: e.max_price ?? null,
    addressesPurged: !!e.addresses_purged_at,
  };
}

export function availabilityView(full: Loaded): Availability {
  const l = planning(full); // "can't make it" people don't count towards the best day
  const byDay: Record<string, string[]> = {};
  for (const a of l.availability) (byDay[a.day] ??= []).push(a.participant_id);
  const today = todayIn(tzOf(l.event));
  return { byDay, bestDay: bestDay(byDay, today), today };
}

/** Day the outing is currently planned for (in its own time zone). */
export const plannedDay = (e: EventRow) => dayIn(e.starts_at, tzOf(e));

/**
 * Public view of everyone. Addresses and home locations are included ONLY for
 * people who switched on "Show my address to the group".
 */
export function publicPeople(l: Loaded): PublicPerson[] {
  return l.people.map((p, i) => {
    const loc = l.locations.get(p.id);
    const shown = p.show_address === true && loc;
    return {
      id: p.id,
      name: p.name,
      role: p.role,
      seats: p.seats,
      likes: p.likes,
      color: PERSON_COLORS[i % PERSON_COLORS.length],
      hasLocation: !!loc,
      startFrom: startFromOf(l, p),
      rsvp: rsvpOf(p),
      ...(shown ? { address: loc.address, home: toLatLng(loc) } : {}),
    };
  });
}

/** Your own details, including your own address. Only ever sent to you. */
export function meView(l: Loaded, p: ParticipantRow): Me {
  const loc = l.locations.get(p.id);
  return {
    id: p.id,
    name: p.name,
    role: p.role,
    seats: p.seats,
    likes: p.likes,
    showAddress: p.show_address === true,
    startFrom: startFromOf(l, p),
    placeVote: p.place_vote ?? null,
    rsvp: rsvpOf(p),
    phone: p.phone ?? null,
    needs: needsOf(p),
    altStartAddress: p.alt_start?.address ?? null,
    address: loc?.address ?? null,
    location: loc ? toLatLng(loc) : null,
  };
}

/** How many people (who are coming) have each need. Counts only, never who. */
export function needsSummary(l: Loaded): NeedsSummary {
  const out: NeedsSummary = {};
  for (const p of planning(l).people) for (const n of needsOf(p)) out[n] = (out[n] ?? 0) + 1;
  return out;
}

/** What the place search has to respect: only needs that Google can actually check. */
export function placeFilters(l: Loaded) {
  const ns = needsSummary(l);
  return {
    veg: !!(ns.vegetarian || ns.vegan),
    stepFree: !!ns.step_free,
    maxPrice: l.event.max_price ?? null,
  };
}
export const FILTERABLE = new Set(NEEDS.filter((n) => n.filters).map((n) => n.key));

/** Who still has something to do (names are public anyway; nothing private here). */
export function progressView(l: Loaded, plan: Plan): Progress {
  const live = planning(l).people;
  const days = new Set(l.availability.map((a) => a.participant_id));
  const count = (r: Rsvp) => l.people.filter((p) => rsvpOf(p) === r).length;
  return {
    noDays: l.event.date_status === 'voting' ? live.filter((p) => !days.has(p.id)).map((p) => p.id) : [],
    noVote:
      plan.vote.open && !l.event.chosen_place_id
        ? live.filter((p) => !p.place_vote || !plan.vote.placeIds.includes(p.place_vote)).map((p) => p.id)
        : [],
    going: count('going'),
    maybe: count('maybe'),
    no: count('no'),
  };
}

export const PURGE_AFTER_DAYS = 3;

/**
 * Privacy clean-up: 3 days after the outing, delete everyone's address, phone number and
 * custom starting point. pg_cron does this nightly; this catches it whenever an old outing
 * is opened, in case pg_cron isn't running. Updates `l` in place.
 */
export async function purgeIfPast(l: Loaded): Promise<void> {
  if (l.event.addresses_purged_at) return;
  if (Date.now() - new Date(l.event.starts_at).getTime() < PURGE_AFTER_DAYS * 86_400_000) return;
  const ids = l.people.map((p) => p.id);
  if (ids.length) {
    const { error } = await db().from('participant_locations').delete().in('participant_id', ids);
    if (error) throw error;
    const { error: e2 } = await db().from('participants').update({ phone: null, alt_start: null }).in('id', ids);
    if (e2) throw e2;
  }
  const now = new Date().toISOString();
  const { error: e3 } = await db().from('events').update({ addresses_purged_at: now }).eq('id', l.event.id);
  if (e3) throw e3;
  l.event.addresses_purged_at = now;
  l.locations.clear();
  for (const p of l.people) {
    p.phone = null;
    p.alt_start = null;
  }
}
