import { db } from '@/lib/server/supabase';
import { loadEvent } from '@/lib/server/data';
import { placeLocation } from '@/lib/server/google';
import { hashToken, newToken } from '@/lib/server/tokens';
import {
  cleanLikes, cleanNeeds, cleanPhone, cleanRole, cleanRsvp, cleanSeats, cleanStartFrom, cleanText, fail, handle, json, readJson,
} from '@/lib/server/http';
import { syncPlannedDate } from '@/lib/server/schedule';

export const dynamic = 'force-dynamic';

const MAX_PEOPLE = 40;

/**
 * Join an outing. The address is required (it's how the meeting spot is found) and is
 * resolved and stored server-side. `showAddress: true` lets the rest of the group see it.
 * The browser gets back only a secret token.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const { slug } = await params;
    const l = await loadEvent(slug);
    if (!l) return fail('Not found', 404);
    if (l.people.length >= MAX_PEOPLE) return fail('This outing is full', 409);

    const body = await readJson(req);
    const name = cleanText(body.name, 'Name', 40);
    const role = cleanRole(body.role);
    const seats = cleanSeats(body.seats, role);
    const likes = cleanLikes(body.likes);

    const sessionToken = typeof body.sessionToken === 'string' ? body.sessionToken.slice(0, 100) : undefined;

    const startFrom = cleanStartFrom(body.startFrom);
    const rsvp = 'rsvp' in body ? cleanRsvp(body.rsvp) : 'going';
    // The address is how the meeting spot is found. Someone who can't make it can say so without one.
    const placeId = rsvp === 'no' && !body.placeId ? null : cleanText(body.placeId, 'Address', 300);
    const phone = cleanPhone(body.phone);
    const needs = cleanNeeds(body.needs);
    const altPlaceId = startFrom === 'other' ? cleanText(body.altPlaceId, 'Starting address', 300) : null;

    const [place, alt] = await Promise.all([
      placeId ? placeLocation(placeId, sessionToken) : Promise.resolve(null),
      altPlaceId ? placeLocation(altPlaceId) : Promise.resolve(null),
    ]);
    const token = newToken();

    const row: Record<string, unknown> = { event_id: l.event.id, name, role, seats, likes, token_hash: hashToken(token) };
    if (body.showAddress === true) row.show_address = true;
    if (startFrom !== 'home') row.start_from = startFrom;
    if (alt) row.alt_start = { address: alt.address, lat: alt.location.lat, lng: alt.location.lng };
    if (rsvp !== 'going') row.rsvp = rsvp;
    if (phone) row.phone = phone;
    if (needs.length) row.needs = needs;
    const { data: p, error } = await db().from('participants').insert(row).select('id').single<{ id: string }>();
    if (error) throw error;

    const { error: e2 } = place
      ? await db()
          .from('participant_locations')
          .insert({ participant_id: p.id, address: place.address, lat: place.location.lat, lng: place.location.lng })
      : { error: null };
    if (e2) {
      await db().from('participants').delete().eq('id', p.id);
      throw e2;
    }
    const fresh = await loadEvent(slug);
    if (fresh) await syncPlannedDate(fresh).catch((err) => console.error('syncPlannedDate failed', err));
    return json({ participantId: p.id, token }, 201);
  });
}
