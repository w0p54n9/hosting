'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, joinLocal, setStored, splitLocal } from '@/lib/client';
import type { EventKind, MidpointMode } from '@/lib/types';

function nextFriday7pm(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7));
  d.setHours(19, 0, 0, 0);
  return d.toISOString();
}

export default function Home() {
  const router = useRouter();
  const initial = splitLocal(nextFriday7pm());
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [kind, setKind] = useState<EventKind>('food');
  const [mode, setMode] = useState<MidpointMode>('fair');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ slug: string; organizerToken: string }>('/api/events', null, {
        method: 'POST',
        json: { title: title || 'Team outing', startsAt: joinLocal(date, time), kind, midpointMode: mode },
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
        <div className="brand"><b>hosting<i>.</i></b></div>
        <h1>Plan the outing, not the logistics.</h1>
        <p className="lead">
          Everyone adds their address privately. Hosting finds the fair middle, ranks places people actually want,
          sorts out carpools and gives everyone directions.
        </p>
        <div className="field">
          <span className="lbl">What&apos;s the outing?</span>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Friday team dinner" maxLength={80} />
        </div>
        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <span className="lbl">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <span className="lbl">Arrive by</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          </div>
        </div>
        <div className="field">
          <span className="lbl">Going for</span>
          <div className="seg" style={{ marginTop: 6 }}>
            <button type="button" className={kind === 'food' ? 'on' : ''} onClick={() => setKind('food')}>🍽️ Food</button>
            <button type="button" className={kind === 'activity' ? 'on' : ''} onClick={() => setKind('activity')}>🎳 Activity</button>
          </div>
        </div>
        <div className="field">
          <span className="lbl">Pick the midpoint that&apos;s…</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as MidpointMode)} style={{ marginTop: 6 }}>
            <option value="fair">Fairest: shortest longest trip</option>
            <option value="total">Least total travel for the group</option>
          </select>
        </div>
        <button className="btn block" disabled={busy}>{busy ? 'Creating…' : 'Create outing & get invite link'}</button>
        {error && <div className="error">{error}</div>}
      </form>
    </main>
  );
}
