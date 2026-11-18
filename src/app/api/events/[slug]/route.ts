import { db } from '@/lib/server/supabase';
import {
  arriveTimeOf, availabilityView, findParticipant, isOrganizer, loadEvent, meView, plannedDay, publicEvent, publicPeople, tzOf,
} from '@/lib/server/data';
import { getCore, planFor } from '@/lib/server/plan';
import {
  HttpError, cleanDate, cleanDay, cleanKind, cleanMode, cleanText, cleanTime, fail, handle, json, organizerToken, participantToken, readJson,
} from '@/lib/server/http';
import { timeIn, validTz, zonedToUtc } from '@/lib/dates';
import type { EventBundle } from '@/lib/types';
import { officeFromPlace } from '@/lib/server/office';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ slug: string }> };

/** Everything the event page needs. Addresses appear only for people who chose to show theirs. */
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
      availability: availabilityView(l),
    };
    return json(bundle);
  });
}

/**
 * Host-only edits:
 *   title, kind, midpointMode, chosenPlaceId (lock in the place)
 *   startsAt (+ timezone)   set a fixed date and time
 *   arriveTime              change the arrive-by time, keeping the day
 *   lockDay: 'YYYY-MM-DD'   stop day-picking and fix the outing on that day
 *   openDays: true          let everyone mark the days they're free again
 *   officePlaceId           set the office address (from autocomplete); officePlaceId: null clears it
 */
export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug } = await params;
    const l = await loadEvent(slug);
    if (!l) return fail('Not found', 404);
    if (!isOrganizer(l, organizerToken(req))) return fail('Only the host can change this', 403);

    const body = await readJson(req);
    const patch: Record<string, unknown> = {};
    const tz = 'timezone' in body ? validTz(body.timezone) : tzOf(l.event);
    if ('timezone' in body) patch.timezone = tz;
    if ('title' in body) patch.title = cleanText(body.title, 'Name', 80);
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

    // ----- office -----
    if ('officePlaceId' in body) {
      patch.office =
        typeof body.officePlaceId === 'string' && body.officePlaceId
          ? await officeFromPlace(body.officePlaceId, typeof body.sessionToken === 'string' ? body.sessionToken : undefined)
          : null;
    }

    // ----- when -----
    if ('startsAt' in body) {
      patch.starts_at = cleanDate(body.startsAt);
      patch.arrive_time = timeIn(patch.starts_at as string, tz);
    }
    if ('arriveTime' in body) {
      const t = cleanTime(body.arriveTime);
      patch.arrive_time = t;
      const day = l.event.date_status === 'voting' ? availabilityView(l).bestDay ?? plannedDay(l.event) : plannedDay(l.event);
      patch.starts_at = zonedToUtc(day, t, tz);
    }
    if ('lockDay' in body) {
      patch.starts_at = zonedToUtc(cleanDay(body.lockDay), (patch.arrive_time as string) ?? arriveTimeOf(l.event), tz);
      patch.date_status = 'set';
    }
    if (body.openDays === true) {
      patch.date_status = 'voting';
      const best = availabilityView(l).bestDay;
      if (best) patch.starts_at = zonedToUtc(best, (patch.arrive_time as string) ?? arriveTimeOf(l.event), tz);
    }

    if (Object.keys(patch).length) {
      const { error } = await db().from('events').update(patch).eq('id', l.event.id);
      if (error) throw error;
    }
    return json({ ok: true });
  });
}
