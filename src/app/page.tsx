'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, joinLocal, setStored, splitLocal } from '@/lib/client';
import type { EventKind, MidpointMode } from '@/lib/types';

function nextFriday7pm(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7));
  d.setHours(19, 0, 0, 0);
  return d.toISOString();
}

const browserTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
};

export default function Home() {
  const router = useRouter();
  const initial = splitLocal(nextFriday7pm());
  const [title, setTitle] = useState('');
  const [everyonePicks, setEveryonePicks] = useState(true);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [kind, setKind] = useState<EventKind>('food');
  const [mode, setMode] = useState<MidpointMode>('fair');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ slug: string; organizerToken: string }>('/api/events', null, {
        method: 'POST',
        json: {
          title: title || 'Team night out',
          kind,
          midpointMode: mode,
          timezone: browserTz(),
          ...(everyonePicks ? { dateMode: 'days', arriveTime: time } : { dateMode: 'pick', startsAt: joinLocal(date, time) }),
        },
      });
      setStored(r.slug, { organizerToken: r.organizerToken });
      router.push(`/e/${r.slug}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="landing">
      <form className="sheet" onSubmit={create}>
        <h1>GOING <span>OUT</span></h1>
        <div className="tag">Plan the night, not the logistics.</div>
        <p className="lead">
          Everyone picks the days they&apos;re free and adds their address. Going Out finds the best day, the fair middle, places people
          actually want, sorts out rides and sends everyone directions.
        </p>
        <div className="field">
          <span className="lbl">What&apos;s the plan?</span>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Team night out" maxLength={80} />
        </div>
        <div className="field">
          <span className="lbl">Which day?</span>
          <div className="seg" style={{ marginTop: 7 }}>
            <button type="button" className={everyonePicks ? 'on' : ''} onClick={() => setEveryonePicks(true)}>📅 Everyone picks</button>
            <button type="button" className={!everyonePicks ? 'on' : ''} onClick={() => setEveryonePicks(false)}>I&apos;ll set it</button>
          </div>
          {everyonePicks && <div className="hint">Everyone taps the days they&apos;re free on a calendar. The day most people can make is used automatically.</div>}
        </div>
        <div className="row">
          {!everyonePicks && (
            <div className="field" style={{ flex: 1 }}>
              <span className="lbl">Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
          )}
          <div className="field" style={{ flex: 1 }}>
            <span className="lbl">Arrive by</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          </div>
        </div>
        <div className="field">
          <span className="lbl">Going for</span>
          <div className="seg" style={{ marginTop: 7 }}>
            <button type="button" className={kind === 'food' ? 'on' : ''} onClick={() => setKind('food')}>🍽️ Food</button>
            <button type="button" className={kind === 'activity' ? 'on' : ''} onClick={() => setKind('activity')}>🎳 Activity</button>
          </div>
        </div>
        <div className="field">
          <span className="lbl">Meeting spot that&apos;s…</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as MidpointMode)} style={{ marginTop: 7 }}>
            <option value="fair">Fairest: shortest longest trip</option>
            <option value="total">Least total travel for the group</option>
          </select>
        </div>
        <button className="btn block" disabled={busy} style={{ padding: '13px 16px', fontSize: 15 }}>
          {busy ? 'Creating…' : 'START PLANNING →'}
        </button>
        {error && <div className="error">{error}</div>}
      </form>
    </main>
  );
}
