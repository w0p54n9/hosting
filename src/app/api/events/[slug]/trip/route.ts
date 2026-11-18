import { findParticipant, loadEvent, usesLocation } from '@/lib/server/data';
import { planFor } from '@/lib/server/plan';
import { buildTrip } from '@/lib/server/trip';
import { fail, handle, json, participantToken } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Your personal directions to the group pick (with pickups if you're driving). */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const { slug } = await params;
    const l = await loadEvent(slug);
    if (!l) return fail('Not found', 404);
    const me = findParticipant(l, participantToken(req));
    if (!me) return fail('Join the outing to get directions', 401);
    if (!usesLocation(l, me)) return fail('Turn on "Use my address" to get directions', 409);
    const plan = await planFor(l);
    const trip = await buildTrip(l, plan, me);
    if (!trip) return fail('No place has been picked yet', 404);
    return json(trip);
  });
}
