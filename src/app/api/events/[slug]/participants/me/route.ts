import { db } from '@/lib/server/supabase';
import { findParticipant, loadEvent } from '@/lib/server/data';
import { placeLocation } from '@/lib/server/google';
import {
  HttpError, cleanLikes, cleanRole, cleanSeats, cleanText, fail, handle, json, participantToken, readJson,
} from '@/lib/server/http';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ slug: string }> };

/**
 * Update your own details: name, address, how you're getting there, likes, and
 * `shareLocation` (the "use my address" switch). `forgetAddress: true` deletes your saved address.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug } = await params;
    const l = await loadEvent(slug);
    if (!l) return fail('Not found', 404);
    const me = findParticipant(l, participantToken(req));
    if (!me) return fail('You are not part of this outing on this device', 401);

    const body = await readJson(req);
    const patch: Record<string, unknown> = {};
    if ('name' in body) patch.name = cleanText(body.name, 'Name', 40);
    const role = 'role' in body ? cleanRole(body.role) : me.role;
    if ('role' in body) patch.role = role;
    if ('seats' in body || 'role' in body) patch.seats = cleanSeats('seats' in body ? body.seats : me.seats, role);
    if ('likes' in body) patch.likes = cleanLikes(body.likes);

    const newPlaceId = typeof body.placeId === 'string' && body.placeId ? body.placeId : null;
    const forget = body.forgetAddress === true && !newPlaceId;
    const willHaveAddress = !forget && (!!newPlaceId || l.locations.has(me.id));
    if ('shareLocation' in body) {
      const on = body.shareLocation === true;
      if (on && !willHaveAddress) throw new HttpError(400, 'Add your address first');
      patch.share_location = on;
    }
    if (forget) patch.share_location = false;

    if (newPlaceId) {
      const sessionToken = typeof body.sessionToken === 'string' ? body.sessionToken.slice(0, 100) : undefined;
      const place = await placeLocation(newPlaceId, sessionToken);
      const { error } = await db().from('participant_locations').upsert({
        participant_id: me.id,
        address: place.address,
        lat: place.location.lat,
        lng: place.location.lng,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    }
    if (forget) {
      const { error } = await db().from('participant_locations').delete().eq('participant_id', me.id);
      if (error) throw error;
    }
    if (Object.keys(patch).length) {
      const { error } = await db().from('participants').update(patch).eq('id', me.id);
      if (error) throw error;
    }
    return json({ ok: true });
  });
}

/** Leave the outing. Deletes your row, your address and your votes. */
export async function DELETE(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug } = await params;
    const l = await loadEvent(slug);
    if (!l) return fail('Not found', 404);
    const me = findParticipant(l, participantToken(req));
    if (!me) return fail('You are not part of this outing on this device', 401);
    const { error } = await db().from('participants').delete().eq('id', me.id); // cascades to address and votes
    if (error) throw error;
    return json({ ok: true });
  });
}
