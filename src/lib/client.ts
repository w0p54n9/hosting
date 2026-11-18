// Browser helpers: secret tokens live in this device's localStorage, per outing.

interface Stored {
  participantToken?: string;
  organizerToken?: string;
}

const keyFor = (slug: string) => `hosting:${slug}`;

export function getStored(slug: string): Stored {
  try {
    return JSON.parse(localStorage.getItem(keyFor(slug)) || '{}') as Stored;
  } catch {
    return {};
  }
}

export function setStored(slug: string, patch: Partial<Stored>): void {
  try {
    const next = { ...getStored(slug), ...patch };
    for (const k of Object.keys(next) as (keyof Stored)[]) if (!next[k]) delete next[k];
    localStorage.setItem(keyFor(slug), JSON.stringify(next));
  } catch {
    /* storage unavailable: the person will just be asked to join again */
  }
}

// ---------- personal "get back in" links ----------
// The secret tokens ride in the URL *hash* (#me=...&host=...). Browsers never send the
// hash to the server, so the tokens stay out of server logs.

/** This browser's personal link for an outing (includes host access if this browser has it). */
export function personalLink(slug: string): string | null {
  const s = getStored(slug);
  if (!s.participantToken && !s.organizerToken) return null;
  const p = new URLSearchParams();
  if (s.participantToken) p.set('me', s.participantToken);
  if (s.organizerToken) p.set('host', s.organizerToken);
  return `${window.location.origin}/e/${slug}#${p.toString()}`;
}

/** If the page was opened with a personal link, remember its tokens and tidy the address bar. */
export function absorbLinkTokens(slug: string): void {
  if (typeof window === 'undefined' || !window.location.hash) return;
  const p = new URLSearchParams(window.location.hash.slice(1));
  const me = p.get('me');
  const host = p.get('host');
  if (!me && !host) return;
  setStored(slug, { ...(me ? { participantToken: me } : {}), ...(host ? { organizerToken: host } : {}) });
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

// ---------- join form draft (survives closing the tab) ----------
const draftKey = (slug: string) => `going-out-draft:${slug}`;
export function loadDraft<T>(slug: string): T | null {
  try {
    const raw = localStorage.getItem(draftKey(slug));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
export function saveDraft(slug: string, draft: unknown): void {
  try {
    localStorage.setItem(draftKey(slug), JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}
export function clearDraft(slug: string): void {
  try {
    localStorage.removeItem(draftKey(slug));
  } catch {
    /* ignore */
  }
}

export async function api<T>(path: string, slug: string | null, init: { method?: string; json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (slug) {
    const s = getStored(slug);
    if (s.participantToken) headers['x-hosting-token'] = s.participantToken;
    if (s.organizerToken) headers['x-hosting-organizer'] = s.organizerToken;
  }
  if (init.json !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export const fmtDay = (iso: string) => new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

export const PRICE: Record<string, string> = {
  PRICE_LEVEL_FREE: 'Free',
  PRICE_LEVEL_INEXPENSIVE: '$',
  PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$',
  PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
};

/** Decodes a Google encoded polyline into lat/lng points. */
export function decodePolyline(str: string): { lat: number; lng: number }[] {
  const out: { lat: number; lng: number }[] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const which of [0, 1]) {
      let result = 0, shift = 0, b: number;
      do {
        b = str.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta;
      else lng += delta;
    }
    out.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return out;
}

/** "YYYY-MM-DD" and "HH:MM" in the viewer's local time, from an ISO string. */
export function splitLocal(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

export const joinLocal = (date: string, time: string) => new Date(`${date}T${time || '19:00'}`).toISOString();

// ---------- "Your outings" (this device only) ----------
export interface SavedOuting {
  slug: string;
  title: string;
  startsAt: string;
  host: boolean;
  seenAt: number;
}
const OUTINGS_KEY = 'going-out-outings';
export function listOutings(): SavedOuting[] {
  try {
    const all = JSON.parse(localStorage.getItem(OUTINGS_KEY) || '[]') as SavedOuting[];
    // Keep only outings this browser can still get back into.
    return all.filter((o) => { const s = getStored(o.slug); return s.participantToken || s.organizerToken; });
  } catch {
    return [];
  }
}
export function rememberOuting(o: Omit<SavedOuting, 'seenAt'>): void {
  try {
    const rest = listOutings().filter((x) => x.slug !== o.slug);
    localStorage.setItem(OUTINGS_KEY, JSON.stringify([{ ...o, seenAt: Date.now() }, ...rest].slice(0, 30)));
  } catch {
    /* ignore */
  }
}
export function forgetOuting(slug: string): void {
  try {
    localStorage.setItem(OUTINGS_KEY, JSON.stringify(listOutings().filter((x) => x.slug !== slug)));
  } catch {
    /* ignore */
  }
}

// ---------- "Since your last visit" ----------
export interface Snapshot {
  people: Record<string, string>; // id -> name
  startsAt: string;
  dateStatus: string;
  placeId: string | null;
  placeName: string | null;
  finalized: boolean;
}
const snapKey = (slug: string) => `going-out-seen:${slug}`;
export function readSnapshot(slug: string): Snapshot | null {
  try {
    const raw = localStorage.getItem(snapKey(slug));
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch {
    return null;
  }
}
export function writeSnapshot(slug: string, s: Snapshot): void {
  try {
    localStorage.setItem(snapKey(slug), JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
const names = (list: string[]) => (list.length <= 2 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);
export function describeChanges(before: Snapshot, now: Snapshot): string[] {
  const out: string[] = [];
  const joined = Object.keys(now.people).filter((id) => !before.people[id]).map((id) => now.people[id]);
  const left = Object.keys(before.people).filter((id) => !now.people[id]).map((id) => before.people[id]);
  if (now.finalized && !before.finalized) out.push('The plan is locked in');
  if (joined.length) out.push(`${names(joined)} joined`);
  if (left.length) out.push(`${names(left)} left`);
  if (now.startsAt !== before.startsAt) out.push(`The day moved to ${fmtDay(now.startsAt)}, ${fmtTime(now.startsAt)}`);
  else if (now.dateStatus !== before.dateStatus) out.push(now.dateStatus === 'set' ? 'The day is locked in' : 'Everyone is picking the day again');
  if (now.placeId && now.placeId !== before.placeId && now.placeName) out.push(`The top place is now ${now.placeName}`);
  return out;
}

// ---------- sharing ----------
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    window.prompt('Copy this:', text);
    return false;
  }
}

/** A calendar file (.ics) for the outing: works with Apple, Google and Outlook calendars. */
export function downloadIcs(o: { slug: string; title: string; startsAt: string; place: string; address: string; url: string }) {
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
  const start = new Date(o.startsAt);
  const end = new Date(start.getTime() + 2.5 * 3600_000);
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Going Out//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${o.slug}@going-out`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(o.title)}`,
    `LOCATION:${esc(`${o.place}, ${o.address}`)}`,
    `DESCRIPTION:${esc(`Your directions and leave time: ${o.url}`)}`,
    `URL:${o.url}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(o.title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  a.download = `${o.title.replace(/[^\w\- ]+/g, '').trim() || 'outing'}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const fmtDayKeyLong = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
