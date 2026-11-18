import { db } from '@/lib/server/supabase';
import { isOrganizer, loadEvent } from '@/lib/server/data';
import { syncPlannedDate } from '@/lib/server/schedule';
import { fail, handle, json, organizerToken } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Host only: remove someone from the outing (their address and days go with them). */
export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  return handle(async () => {
    const { slug, id } = await params;
    const l = await loadEvent(slug);
    if (!l) return fail('Not found', 404);
    if (!isOrganizer(l, organizerToken(req))) return fail('Only the host can remove people', 403);
    if (!l.people.some((p) => p.id === id)) return fail('That person already left', 404);
    const { error } = await db().from('participants').delete().eq('id', id).eq('event_id', l.event.id);
    if (error) throw error;
    const fresh = await loadEvent(slug);
    if (fresh) await syncPlannedDate(fresh);
    return json({ ok: true });
  });
}
