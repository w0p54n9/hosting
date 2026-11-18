import 'server-only';
import { db } from './supabase';
import { arriveTimeOf, availabilityView, plannedDay, tzOf, type Loaded } from './data';
import { zonedToUtc } from '../dates';

/**
 * While people are marking their free days, the outing automatically follows the
 * best day (most people free; earliest on a tie). Call after availability changes.
 */
export async function syncPlannedDate(l: Loaded): Promise<void> {
  if (l.event.date_status !== 'voting') return;
  const { bestDay } = availabilityView(l);
  const day = bestDay ?? plannedDay(l.event);
  const startsAt = zonedToUtc(day, arriveTimeOf(l.event), tzOf(l.event));
  if (new Date(startsAt).getTime() === new Date(l.event.starts_at).getTime()) return;
  const { error } = await db().from('events').update({ starts_at: startsAt }).eq('id', l.event.id);
  if (error) throw error;
}
