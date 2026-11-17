import 'server-only';
import { db } from './supabase';
import { hashToken } from './tokens';
import { PERSON_COLORS } from '../categories';
import type { EventKind, LatLng, Me, MidpointMode, PublicEvent, PublicPerson, Role, Venue } from '../types';

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
  created_at: string;
}

export interface ParticipantRow {
  id: string;
  event_id: string;
  name: string;
  role: Role;
  seats: number;
  likes: string[];
  token_hash: string;
  created_at: string;
}

export interface LocationRow {
  participant_id: string;
  address: string;
  lat: number;
  lng: number;
}

export interface Loaded {
  event: EventRow;
  people: ParticipantRow[];
  locations: Map<string, LocationRow>;
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
  return { event, people: people ?? [], locations: new Map(locs.map((l) => [l.participant_id, l])) };
}

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
  };
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
    hasLocation: l.locations.has(p.id),
  }));
}

/** Your own details, including your own address. Only ever sent to you. */
export function meView(l: Loaded, p: ParticipantRow): Me | null {
  const loc = l.locations.get(p.id);
  if (!loc) return null;
  return { id: p.id, name: p.name, role: p.role, seats: p.seats, likes: p.likes, address: loc.address, location: toLatLng(loc) };
}
