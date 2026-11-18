import { findParticipant, isOrganizer, loadEvent } from '@/lib/server/data';
import { placeInfo } from '@/lib/server/google';
import { planFor } from '@/lib/server/plan';
import { fail, handle, json, organizerToken, participantToken } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Phone, website and opening hours for the place the outing is going to (for booking). */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const { slug } = await params;
    const l = await loadEvent(slug);
    if (!l) return fail('Not found', 404);
    if (!findParticipant(l, participantToken(req)) && !isOrganizer(l, organizerToken(req))) return fail('Join the outing first', 401);
    const placeId = l.event.chosen_place_id ?? (await planFor(l)).selectedPlaceId;
    if (!placeId) return json({ placeId: null, info: null });
    try {
      return json({ placeId, info: await placeInfo(placeId) });
    } catch (err) {
      console.error('placeInfo failed', err);
      return json({ placeId, info: null });
    }
  });
}
