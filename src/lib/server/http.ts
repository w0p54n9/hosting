import 'server-only';
import { NextResponse } from 'next/server';
import { ALL_KEYS, NEED_KEYS, PRICE_CAPS } from '../categories';
import type { EventKind, MidpointMode, Need, PriceCap, Role, Rsvp, StartFrom } from '../types';
import { addDays, isDay, isTime } from '../dates';

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Wraps a handler so unexpected errors become a generic 500 (details go to the server log only). */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) return fail(err.message, err.status);
    console.error(err);
    return fail('Something went wrong. Please try again.', 500);
  }
}

export const participantToken = (req: Request) => req.headers.get('x-hosting-token');
export const organizerToken = (req: Request) => req.headers.get('x-hosting-organizer');

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

// ---------- validation ----------

const ROLES: Role[] = ['driver', 'rider', 'transit', 'bike', 'walk'];

export function cleanText(v: unknown, field: string, max: number): string {
  const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  if (!s) throw new HttpError(400, `${field} is required`);
  return s.slice(0, max);
}

export function cleanRole(v: unknown): Role {
  if (typeof v === 'string' && (ROLES as string[]).includes(v)) return v as Role;
  throw new HttpError(400, 'Choose how you are getting there');
}

export const cleanSeats = (v: unknown, role: Role) => (role === 'driver' ? Math.max(0, Math.min(8, Math.floor(Number(v) || 0))) : 0);

export const cleanLikes = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && ALL_KEYS.has(x)))].slice(0, 12) : [];

export function cleanKind(v: unknown): EventKind {
  if (v === 'food' || v === 'activity') return v;
  throw new HttpError(400, 'Kind must be food or activity');
}

export function cleanMode(v: unknown): MidpointMode {
  if (v === 'fair' || v === 'total') return v;
  throw new HttpError(400, 'Midpoint mode must be fair or total');
}

export function cleanDate(v: unknown): string {
  const d = typeof v === 'string' ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) throw new HttpError(400, 'Pick a valid date and time');
  return d.toISOString();
}

export function cleanDay(v: unknown): string {
  if (!isDay(v)) throw new HttpError(400, 'Pick a valid day');
  return v;
}

export function cleanTime(v: unknown): string {
  if (!isTime(v)) throw new HttpError(400, 'Pick a valid time');
  return v;
}

/** Up to 120 distinct days, from today (in the outing's time zone) to about 6 months out. */
export function cleanDays(v: unknown, today: string): string[] {
  if (!Array.isArray(v)) throw new HttpError(400, 'Days must be a list');
  const last = addDays(today, 186);
  return [...new Set(v.filter(isDay))].filter((d) => d >= today && d <= last).sort().slice(0, 120);
}

export const cleanStartFrom = (v: unknown): StartFrom => (v === 'office' || v === 'other' ? v : 'home');

export function cleanRsvp(v: unknown): Rsvp {
  if (v === 'going' || v === 'maybe' || v === 'no') return v;
  throw new HttpError(400, 'Choose going, maybe or can’t make it');
}

export const cleanNeeds = (v: unknown): Need[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is Need => typeof x === 'string' && NEED_KEYS.has(x as Need)))] : [];

/** Optional phone number: digits and the usual punctuation only; empty clears it. */
export function cleanPhone(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  if (!s) return null;
  if (!/^\+?[0-9 ().-]{7,24}$/.test(s) || s.replace(/\D/g, '').length < 7) throw new HttpError(400, 'That phone number doesn’t look right');
  return s;
}

export function cleanPriceCap(v: unknown): PriceCap | null {
  if (v === null || v === '') return null;
  if (PRICE_CAPS.some((p) => p.key === v)) return v as PriceCap;
  throw new HttpError(400, 'Pick a budget');
}

export const cleanOptionalDay = (v: unknown): string | null => (v === null || v === '' ? null : cleanDay(v));
