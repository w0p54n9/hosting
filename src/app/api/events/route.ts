import { db } from '@/lib/server/supabase';
import { newSlug, newToken, hashToken } from '@/lib/server/tokens';
import { cleanDate, cleanKind, cleanMode, cleanText, handle, json, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Create an outing. Returns the invite slug and the host's secret token. */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req);
    const title = cleanText(body.title, 'Name', 80);
    const startsAt = cleanDate(body.startsAt);
    const kind = cleanKind(body.kind ?? 'food');
    const midpointMode = cleanMode(body.midpointMode ?? 'fair');
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
      });
      if (!error) return json({ slug, organizerToken }, 201);
      if (error.code !== '23505') throw error; // retry only on slug collision
    }
    throw new Error('Could not allocate an invite code');
  });
}
