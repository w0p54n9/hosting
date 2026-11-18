import { db } from '@/lib/server/supabase';
import { availabilityView, findParticipant, loadEvent } from '@/lib/server/data';
import { syncPlannedDate } from '@/lib/server/schedule';
import { cleanDays, fail, handle, json, participantToken, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Set the days you're free: { days: ['YYYY-MM-DD', ...] } replaces your whole list. */
export async function PUT(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const { slug } = await params;
    const l = await loadEvent(slug);
    if (!l) return fail('Not found', 404);
    const me = findParticipant(l, participantToken(req));
    if (!me) return fail('Join the outing to mark your days', 401);

    const body = await readJson(req);
    const { today } = availabilityView(l);
    const days = cleanDays(body.days, today);

    // Keep past days as they were; replace today onwards.
    const { error: delErr } = await db().from('availability').delete().eq('participant_id', me.id).gte('day', today);
    if (delErr) throw delErr;
    if (days.length) {
      const { error } = await db().from('availability').insert(days.map((day) => ({ participant_id: me.id, day })));
      if (error) throw error;
    }

    // The outing follows the best day while people are still picking.
    const fresh = await loadEvent(slug);
    if (fresh) await syncPlannedDate(fresh);
    return json({ ok: true });
  });
}
