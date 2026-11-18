import { db } from '@/lib/server/supabase';
import { findParticipant, loadEvent } from '@/lib/server/data';
import { cleanVote, fail, handle, json, participantToken, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Vote on one date option: { optionId, vote: 'yes' | 'maybe' | 'no' | null } (null clears your vote). */
export async function PUT(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const { slug } = await params;
    const l = await loadEvent(slug);
    if (!l) return fail('Not found', 404);
    const me = findParticipant(l, participantToken(req));
    if (!me) return fail('Join the outing to vote', 401);

    const body = await readJson(req);
    const optionId = typeof body.optionId === 'string' ? body.optionId : '';
    if (!l.dateOptions.some((o) => o.id === optionId)) return fail('That date is no longer an option', 400);
    const vote = cleanVote(body.vote);

    if (vote === null) {
      const { error } = await db().from('date_votes').delete().eq('option_id', optionId).eq('participant_id', me.id);
      if (error) throw error;
    } else {
      const { error } = await db()
        .from('date_votes')
        .upsert({ option_id: optionId, participant_id: me.id, vote, updated_at: new Date().toISOString() });
      if (error) throw error;
    }
    return json({ ok: true });
  });
}
