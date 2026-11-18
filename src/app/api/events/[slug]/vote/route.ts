import { db } from '@/lib/server/supabase';
import { findParticipant, loadEvent } from '@/lib/server/data';
import { planFor } from '@/lib/server/plan';
import { fail, handle, json, participantToken, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Vote for one of the tied top places: { placeId } (or { placeId: null } to take your vote back). */
export async function PUT(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const { slug } = await params;
    const l = await loadEvent(slug);
    if (!l) return fail('Not found', 404);
    const me = findParticipant(l, participantToken(req));
    if (!me) return fail('Join the outing to vote', 401);

    const body = await readJson(req);
    const placeId = typeof body.placeId === 'string' && body.placeId ? body.placeId : null;
    if (placeId) {
      const plan = await planFor(l);
      if (!plan.vote.open || !plan.vote.placeIds.includes(placeId)) return fail('That place isn’t part of the vote any more', 409);
    }
    const { error } = await db().from('participants').update({ place_vote: placeId }).eq('id', me.id);
    if (error) throw error;
    return json({ ok: true });
  });
}
