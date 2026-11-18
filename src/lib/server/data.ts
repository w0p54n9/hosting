import 'server-only';
import { db } from './supabase';
import { hashToken } from './tokens';
import { PERSON_COLORS } from '../categories';
import type { DateOption, DateStatus, EventKind, LatLng, Me, MidpointMode, PublicEvent, PublicPerson, Role, Venue, Vote } from '../types';

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
  date_status?: DateStatus; // optional so older databases without the column still work
  created_at: string;
}

export interface ParticipantRow {
  id: string;
  event_id: string;
  name: string;
  role: Role;
  seats: number;
  likes: string[];
  share_location?: boolean; // optional so older databases without the column still work
  token_hash: string;
  created_at: string;
}

export interface LocationRow {
  participant_id: string;
  address: string;
  lat: number;
  lng: number;
}

export interface DateOptionRow {
  id: string;
  event_id: string;
  starts_at: string;
}

export interface DateVoteRow {
  option_id: string;
  participant_id: string;
  vote: Vote;
}

export interface Loaded {
  event: EventRow;
  people: ParticipantRow[];
  locations: Map<string, LocationRow>;
  dateOptions: DateOptionRow[];
  dateVotes: DateVoteRow[];
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
  if (ids.length) {
    const { data, error: e3 } = await db().from('participant_locations').select('*').in('participant_id', ids).returns<LocationRow[]>();
    if (e3) throw e3;
    locs = data ?? [];
  }

  // Date voting. If the tables don't exist yet (migration not run), just treat it as "no options".
  let dateOptions: DateOptionRow[] = [];
  let dateVotes: DateVoteRow[] = [];
  const { data: opts, error: e4 } = await db()
    .from('date_options')
    .select('id, event_id, starts_at')
    .eq('event_id', event.id)
    .order('starts_at', { ascending: true })
    .returns<DateOptionRow[]>();
  if (e4) console.error('date_options unavailable', e4.message);
  else dateOptions = opts ?? [];
  if (dateOptions.length) {
    const { data: votes, error: e5 } = await db()
      .from('date_votes')
      .select('option_id, participant_id, vote')
      .in('option_id', dateOptions.map((o) => o.id))
      .returns<DateVoteRow[]>();
    if (e5) console.error('date_votes unavailable', e5.message);
    else dateVotes = votes ?? [];
  }

  return { event, people: people ?? [], locations: new Map(locs.map((l) => [l.participant_id, l])), dateOptions, dateVotes };
}

/** True when this person's address may be used for planning: they have one AND their switch is on. */
export const usesLocation = (l: Loaded, p: ParticipantRow) => p.share_location !== false && l.locations.has(p.id);

export const toLatLng = (l: LocationRow): LatLng => ({ lat: l.lat, lng: l.lng });

export function findParticipant(l: Loaded, token: string | null): ParticipantRow | null {
  if (!token) return null;
  const h = hashToken(token);
  return l.people.find((p) => p.token_hash === h) ?? null;
}

export function isOrganizer(l: Loaded, token: string | null): boolean {
  return !!token && hashToken(token) === l.event.organizer_token_hash;
}

export function publicEvent(e: EventRow): PublicEvent {
  return {
    slug: e.slug,
    title: e.title,
    startsAt: e.starts_at,
    kind: e.kind,
    midpointMode: e.midpoint_mode,
    chosenPlaceId: e.chosen_place_id,
    dateStatus: e.date_status === 'voting' ? 'voting' : 'set',
  };
}

export function publicDateOptions(l: Loaded): DateOption[] {
  const ids = new Set(l.people.map((p) => p.id));
  return l.dateOptions.map((o) => {
    const votes = l.dateVotes.filter((v) => v.option_id === o.id && ids.has(v.participant_id));
    const by = (k: Vote) => votes.filter((v) => v.vote === k).map((v) => v.participant_id);
    return { id: o.id, startsAt: o.starts_at, yes: by('yes'), maybe: by('maybe'), no: by('no') };
  });
}

/** Public view of everyone: no addresses, no coordinates. */
export function publicPeople(l: Loaded): PublicPerson[] {
  return l.people.map((p, i) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    seats: p.seats,
    likes: p.likes,
    color: PERSON_COLORS[i % PERSON_COLORS.length],
    hasLocation: usesLocation(l, p),
  }));
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
    shareLocation: p.share_location !== false,
    address: loc?.address ?? null,
    location: loc ? toLatLng(loc) : null,
  };
}
