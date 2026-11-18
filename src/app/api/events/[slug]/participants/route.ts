import { db } from '@/lib/server/supabase';
import { loadEvent } from '@/lib/server/data';
import { placeLocation } from '@/lib/server/google';
import { hashToken, newToken } from '@/lib/server/tokens';
import { cleanLikes, cleanRole, cleanSeats, cleanStartFrom, cleanText, fail, handle, json, readJson } from '@/lib/server/http';

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
    const placeId = cleanText(body.placeId, 'Address', 300);
    const sessionToken = typeof body.sessionToken === 'string' ? body.sessionToken.slice(0, 100) : undefined;

    const place = await placeLocation(placeId, sessionToken);
    const token = newToken();

    const row: Record<string, unknown> = { event_id: l.event.id, name, role, seats, likes, token_hash: hashToken(token) };
    if (body.showAddress === true) row.show_address = true;
    if (cleanStartFrom(body.startFrom) === 'office') row.start_from = 'office';
    const { data: p, error } = await db().from('participants').insert(row).select('id').single<{ id: string }>();
    if (error) throw error;

    const { error: e2 } = await db()
      .from('participant_locations')
      .insert({ participant_id: p.id, address: place.address, lat: place.location.lat, lng: place.location.lng });
    if (e2) {
      await db().from('participants').delete().eq('id', p.id);
      throw e2;
    }
    return json({ participantId: p.id, token }, 201);
  });
}
