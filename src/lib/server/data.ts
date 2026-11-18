import 'server-only';
import { db } from './supabase';
import { hashToken } from './tokens';
import { PERSON_COLORS } from '../categories';
import { bestDay, dayIn, timeIn, todayIn, validTz } from '../dates';
import type { Availability, DateStatus, EventKind, LatLng, Me, MidpointMode, PublicEvent, PublicPerson, Role, StartFrom, Venue } from '../types';

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

/** Where this person sets off from for this outing: the office, or their home. */
export function originOf(l: Loaded, p: ParticipantRow): LatLng | null {
  if (startsAtOffice(l, p)) return { lat: l.event.office!.lat, lng: l.event.office!.lng };
  const loc = l.locations.get(p.id);
  return loc ? toLatLng(loc) : null;
}

/** Human-readable starting point, e.g. for a driver's pickup list. */
export function originLabel(l: Loaded, p: ParticipantRow): string {
  if (startsAtOffice(l, p)) return `the office (${l.event.office!.address})`;
  return l.locations.get(p.id)?.address ?? '';
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
  };
}

export function availabilityView(l: Loaded): Availability {
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
      startFrom: startsAtOffice(l, p) ? 'office' : 'home',
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
    startFrom: startsAtOffice(l, p) ? 'office' : 'home',
    address: loc?.address ?? null,
    location: loc ? toLatLng(loc) : null,
  };
}
