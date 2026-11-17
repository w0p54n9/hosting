import { db } from '@/lib/server/supabase';
import { findParticipant, isOrganizer, loadEvent, meView, publicEvent, publicPeople } from '@/lib/server/data';
import { getCore, planFor } from '@/lib/server/plan';
import {
  HttpError, cleanDate, cleanKind, cleanMode, cleanText, fail, handle, json, organizerToken, participantToken, readJson,
} from '@/lib/server/http';
import type { EventBundle } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ slug: string }> };

/** Everything the event page needs. Other people's addresses are never included. */
export async function GET(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug } = await params;
    const l = await loadEvent(slug);
    if (!l) return fail('This outing does not exist (or was deleted).', 404);
    const me = findParticipant(l, participantToken(req));
    const bundle: EventBundle = {
      event: publicEvent(l.event),
      people: publicPeople(l),
      plan: await planFor(l),
      me: me ? meView(l, me) : null,
      isOrganizer: isOrganizer(l, organizerToken(req)),
    };
    return json(bundle);
  });
}

/** Host-only: edit the outing or lock in the group pick. */
export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug } = await params;
    const l = await loadEvent(slug);
    if (!l) return fail('Not found', 404);
    if (!isOrganizer(l, organizerToken(req))) return fail('Only the host can change this', 403);

    const body = await readJson(req);
    const patch: Record<string, unknown> = {};
    if ('title' in body) patch.title = cleanText(body.title, 'Name', 80);
    if ('startsAt' in body) patch.starts_at = cleanDate(body.startsAt);
    if ('midpointMode' in body) patch.midpoint_mode = cleanMode(body.midpointMode);
    if ('kind' in body) {
      patch.kind = cleanKind(body.kind);
      if (patch.kind !== l.event.kind) {
        patch.chosen_place_id = null;
        patch.chosen_place = null;
      }
    }
    if ('chosenPlaceId' in body) {
      if (body.chosenPlaceId === null) {
        patch.chosen_place_id = null;
        patch.chosen_place = null;
      } else {
        const core = await getCore(l);
        const v = core.venues.find((x) => x.placeId === body.chosenPlaceId);
        if (!v) throw new HttpError(400, 'That place is no longer in the list');
        patch.chosen_place_id = v.placeId;
        patch.chosen_place = v;
      }
    }
    if (!Object.keys(patch).length) return json({ ok: true });
    const { error } = await db().from('events').update(patch).eq('id', l.event.id);
    if (error) throw error;
    return json({ ok: true });
  });
}
