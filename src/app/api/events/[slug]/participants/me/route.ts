import { db } from '@/lib/server/supabase';
import { findParticipant, loadEvent } from '@/lib/server/data';
import { placeLocation } from '@/lib/server/google';
import { syncPlannedDate } from '@/lib/server/schedule';
import {
  cleanLikes, cleanNeeds, cleanPhone, cleanRole, cleanRsvp, cleanSeats, cleanStartFrom, cleanText, fail, handle, json, participantToken, readJson,
} from '@/lib/server/http';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ slug: string }> };

/** Update your own details: name, address, showAddress, how you're getting there, likes. */
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
    if ('showAddress' in body) patch.show_address = body.showAddress === true;
    if ('startFrom' in body) patch.start_from = cleanStartFrom(body.startFrom);
    if ('rsvp' in body) patch.rsvp = cleanRsvp(body.rsvp);
    if ('phone' in body) patch.phone = cleanPhone(body.phone);
    if ('needs' in body) patch.needs = cleanNeeds(body.needs);
    // "Somewhere else" start: a private address only used to plan your own trip (and your driver's pickup).
    if (typeof body.altPlaceId === 'string' && body.altPlaceId) {
      const sessionToken = typeof body.sessionToken === 'string' ? body.sessionToken.slice(0, 100) : undefined;
      const alt = await placeLocation(body.altPlaceId, sessionToken);
      patch.alt_start = { address: alt.address, lat: alt.location.lat, lng: alt.location.lng };
      if (!('startFrom' in body)) patch.start_from = 'other';
    } else if (body.altPlaceId === null) {
      patch.alt_start = null;
      if (me.start_from === 'other' && !('startFrom' in body)) patch.start_from = 'home';
    }
    if (patch.start_from === 'other' && !patch.alt_start && !me.alt_start) return fail('Add the address you’re starting from', 400);

    if (Object.keys(patch).length) {
      const { error } = await db().from('participants').update(patch).eq('id', me.id);
      if (error) throw error;
    }
    if (typeof body.placeId === 'string' && body.placeId) {
      if (l.event.addresses_purged_at) return fail('This outing is over, so addresses are no longer kept', 409);
      const sessionToken = typeof body.sessionToken === 'string' ? body.sessionToken.slice(0, 100) : undefined;
      const place = await placeLocation(body.placeId, sessionToken);
      const { error } = await db().from('participant_locations').upsert({
        participant_id: me.id,
        address: place.address,
        lat: place.location.lat,
        lng: place.location.lng,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    }
    if ('rsvp' in patch) {
      const fresh = await loadEvent(slug);
      if (fresh) await syncPlannedDate(fresh);
    }
    return json({ ok: true });
  });
}

/** Leave the outing. Deletes your row, your address and your free days. */
export async function DELETE(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug } = await params;
    const l = await loadEvent(slug);
    if (!l) return fail('Not found', 404);
    const me = findParticipant(l, participantToken(req));
    if (!me) return fail('You are not part of this outing on this device', 401);
    const { error } = await db().from('participants').delete().eq('id', me.id); // cascades
    if (error) throw error;
    const fresh = await loadEvent(slug);
    if (fresh) await syncPlannedDate(fresh);
    return json({ ok: true });
  });
}
