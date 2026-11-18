import { db } from '@/lib/server/supabase';
import { findParticipant, isOrganizer, loadEvent, meView, publicDateOptions, publicEvent, publicPeople } from '@/lib/server/data';
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
      dateOptions: publicDateOptions(l),
    };
    return json(bundle);
  });
}

/**
 * Host-only: edit the outing, lock in the group pick, or manage the date vote:
 *   { startVoting: true }        open voting (the current date becomes the first option)
 *   { addDateOption: iso }       add a date/time to vote on
 *   { removeDateOption: id }     remove one
 *   { lockDate: optionId }       close the vote and set the outing to that date
 */
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

    // ----- date voting -----
    const addOption = async (iso: string) => {
      const { error } = await db()
        .from('date_options')
        .upsert({ event_id: l.event.id, starts_at: iso }, { onConflict: 'event_id,starts_at', ignoreDuplicates: true });
      if (error) throw error;
    };
    if (body.startVoting === true) {
      await addOption(l.event.starts_at);
      patch.date_status = 'voting';
    }
    if ('addDateOption' in body) {
      if (l.dateOptions.length >= 8) throw new HttpError(400, 'Up to 8 dates can be voted on');
      await addOption(cleanDate(body.addDateOption));
    }
    if (typeof body.removeDateOption === 'string') {
      const { error } = await db().from('date_options').delete().eq('id', body.removeDateOption).eq('event_id', l.event.id);
      if (error) throw error;
    }
    if (typeof body.lockDate === 'string') {
      const opt = l.dateOptions.find((o) => o.id === body.lockDate);
      if (!opt) throw new HttpError(400, 'That date is no longer an option');
      patch.starts_at = opt.starts_at;
      patch.date_status = 'set';
    }

    if (Object.keys(patch).length) {
      const { error } = await db().from('events').update(patch).eq('id', l.event.id);
      if (error) throw error;
    }
    return json({ ok: true });
  });
}
