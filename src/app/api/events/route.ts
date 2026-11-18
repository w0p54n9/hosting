import { db } from '@/lib/server/supabase';
import { newSlug, newToken, hashToken } from '@/lib/server/tokens';
import { cleanDate, cleanDateOptions, cleanKind, cleanMode, cleanText, handle, json, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/**
 * Create an outing. Returns the invite slug and the host's secret token.
 * Either a fixed `startsAt`, or 2+ `dateOptions` for everyone to vote on.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req);
    const title = cleanText(body.title, 'Name', 80);
    const kind = cleanKind(body.kind ?? 'food');
    const midpointMode = cleanMode(body.midpointMode ?? 'fair');
    const options = cleanDateOptions(body.dateOptions);
    const voting = options.length >= 2;
    const startsAt = voting ? options[0] : cleanDate(body.startsAt);
    const organizerToken = newToken();

    for (let attempt = 0; attempt < 3; attempt++) {
      const slug = newSlug();
      const row: Record<string, unknown> = {
        slug,
        title,
        starts_at: startsAt,
        kind,
        midpoint_mode: midpointMode,
        organizer_token_hash: hashToken(organizerToken),
      };
      if (voting) row.date_status = 'voting';
      const { data, error } = await db().from('events').insert(row).select('id').single<{ id: string }>();
      if (error) {
        if (error.code === '23505') continue; // slug collision: try another
        throw error;
      }
      if (voting) {
        const { error: e2 } = await db()
          .from('date_options')
          .insert(options.map((starts_at) => ({ event_id: data.id, starts_at })));
        if (e2) throw e2;
      }
      return json({ slug, organizerToken }, 201);
    }
    throw new Error('Could not allocate an invite code');
  });
}
