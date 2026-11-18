import { db } from '@/lib/server/supabase';
import { newSlug, newToken, hashToken } from '@/lib/server/tokens';
import { cleanDate, cleanKind, cleanMode, cleanText, cleanTime, handle, json, readJson } from '@/lib/server/http';
import { addDays, timeIn, todayIn, validTz, zonedToUtc } from '@/lib/dates';

export const dynamic = 'force-dynamic';

/**
 * Create an outing. Returns the invite slug and the host's secret token.
 *   dateMode 'days' (default): everyone marks the days they're free; needs arriveTime ('HH:MM').
 *   dateMode 'pick': the host sets the date; needs startsAt (ISO).
 * timezone: the host's IANA time zone, so days and times mean the same thing for everyone.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req);
    const title = cleanText(body.title, 'Name', 80);
    const kind = cleanKind(body.kind ?? 'food');
    const midpointMode = cleanMode(body.midpointMode ?? 'fair');
    const timezone = validTz(body.timezone);
    const voting = body.dateMode !== 'pick';

    let startsAt: string;
    let arriveTime: string;
    if (voting) {
      arriveTime = cleanTime(body.arriveTime ?? '19:00');
      startsAt = zonedToUtc(addDays(todayIn(timezone), 1), arriveTime, timezone); // placeholder until people pick days
    } else {
      startsAt = cleanDate(body.startsAt);
      arriveTime = timeIn(startsAt, timezone);
    }
    const organizerToken = newToken();

    for (let attempt = 0; attempt < 3; attempt++) {
      const slug = newSlug();
      const { error } = await db().from('events').insert({
        slug,
        title,
        starts_at: startsAt,
        kind,
        midpoint_mode: midpointMode,
        organizer_token_hash: hashToken(organizerToken),
        date_status: voting ? 'voting' : 'set',
        arrive_time: arriveTime,
        timezone,
      });
      if (!error) return json({ slug, organizerToken }, 201);
      if (error.code !== '23505') throw error; // retry only on slug collision
    }
    throw new Error('Could not allocate an invite code');
  });
}
