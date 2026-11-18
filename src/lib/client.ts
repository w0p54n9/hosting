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
