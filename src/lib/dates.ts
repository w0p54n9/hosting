// Calendar-day helpers that work the same on the server and in the browser.
// A "day" is 'YYYY-MM-DD' and a "time" is 'HH:MM', both in the outing's time zone.

export const DEFAULT_TZ = 'America/Toronto';

export function validTz(tz: unknown): string {
  if (typeof tz !== 'string' || !tz) return DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

function parts(ms: number, tz: string) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms));
  const g = (t: string) => Number(f.find((p) => p.type === t)?.value ?? 0);
  return { y: g('year'), mo: g('month'), d: g('day'), h: g('hour'), mi: g('minute'), s: g('second') };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The local day ('YYYY-MM-DD') of an instant in a time zone. */
export function dayIn(iso: string | number, tz: string): string {
  const p = parts(typeof iso === 'number' ? iso : new Date(iso).getTime(), tz);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}`;
}

/** The local time ('HH:MM') of an instant in a time zone. */
export function timeIn(iso: string, tz: string): string {
  const p = parts(new Date(iso).getTime(), tz);
  return `${pad(p.h)}:${pad(p.mi)}`;
}

export const todayIn = (tz: string) => dayIn(Date.now(), tz);

/** A local day + time in a time zone, as a UTC ISO string. Handles daylight-saving changes. */
export function zonedToUtc(day: string, time: string, tz: string): string {
  const [y, mo, d] = day.split('-').map(Number);
  const [h, mi] = (time || '19:00').split(':').map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let guess = wall;
  for (let i = 0; i < 3; i++) {
    const p = parts(guess, tz);
    const offset = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - guess;
    guess = wall - offset;
  }
  return new Date(guess).toISOString();
}

export function addDays(day: string, n: number): string {
  const [y, mo, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Day that the most people are free (ties go to the earliest), from today on. */
export function bestDay(byDay: Record<string, string[]>, today: string): string | null {
  let best: string | null = null;
  for (const [day, ids] of Object.entries(byDay)) {
    if (day < today || !ids.length) continue;
    if (!best || ids.length > byDay[best].length || (ids.length === byDay[best].length && day < best)) best = day;
  }
  return best;
}

export const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
export const isTime = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/** e.g. "Fri, Nov 20" for a 'YYYY-MM-DD' day (no time-zone shifting). */
export function fmtDayKey(day: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }): string {
  const [y, mo, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, 12)).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
}

/** e.g. "7:00 PM" for 'HH:MM'. */
export function fmtTimeKey(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`;
}
