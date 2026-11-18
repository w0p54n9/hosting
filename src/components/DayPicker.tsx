'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/client';
import { addDays, fmtDayKey, fmtTimeKey } from '@/lib/dates';
import type { EventBundle, PublicPerson } from '@/lib/types';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MAX_MONTHS_AHEAD = 5;

function Faces({ ids, people }: { ids: string[]; people: PublicPerson[] }) {
  if (!ids.length) return null;
  return (
    <span className="stack">
      {ids.slice(0, 6).map((id) => {
        const p = people.find((x) => x.id === id);
        return p ? <i key={id} style={{ background: p.color }} title={p.name}>{p.name[0]}</i> : null;
      })}
    </span>
  );
}

const monthKey = (day: string) => day.slice(0, 7); // 'YYYY-MM'
function shiftMonth(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Everyone taps the days they're free. The outing automatically follows the day the
 * most people can make; the host can lock a day in.
 */
export default function DayPicker({
  slug,
  data,
  onChanged,
  onJoin,
  onHost,
}: {
  slug: string;
  data: EventBundle;
  onChanged: () => void;
  onJoin: () => void;
  onHost: (patch: Record<string, unknown>) => void;
}) {
  const { availability, people, me, isOrganizer, event } = data;
  const { byDay, bestDay, today } = availability;

  // My days: local copy so taps feel instant; saved shortly after the last tap.
  const serverMine = useMemo(
    () => new Set(Object.entries(byDay).filter(([, ids]) => me && ids.includes(me.id)).map(([d]) => d)),
    [byDay, me],
  );
  const [mine, setMine] = useState<Set<string>>(serverMine);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!dirty) setMine(serverMine);
  }, [serverMine, dirty]);

  const [month, setMonth] = useState(() => monthKey(bestDay ?? today));
  const lastMonth = shiftMonth(monthKey(today), MAX_MONTHS_AHEAD);
  const lastDay = addDays(today, 186);

  function toggle(day: string) {
    if (!me) return onJoin();
    const next = new Set(mine);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    setMine(next);
    setDirty(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await api(`/api/events/${slug}/availability`, slug, { method: 'PUT', json: { days: [...next].filter((d) => d >= today) } });
        onChanged();
      } catch (err) {
        alert((err as Error).message);
      } finally {
        setSaving(false);
        setDirty(false);
      }
    }, 700);
  }

  // Counts include my unsaved taps, so the calendar responds immediately.
  const countFor = (day: string) => {
    const ids = new Set(byDay[day] ?? []);
    if (me) {
      if (mine.has(day)) ids.add(me.id);
      else ids.delete(me.id);
    }
    return [...ids];
  };

  // Build the month grid.
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: first.getUTCDay() }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);

  const total = Math.max(1, people.length);
  const ranked = Object.keys(byDay)
    .filter((d) => d >= today && (byDay[d]?.length ?? 0) > 0)
    .sort((a, b) => byDay[b].length - byDay[a].length || a.localeCompare(b))
    .slice(0, 3);
  const responded = new Set(Object.entries(byDay).filter(([d]) => d >= today).flatMap(([, ids]) => ids)).size;

  return (
    <div className="card when">
      <div className="whenhead">
        <span className="display">When are you free?</span>
        <span className="saving">{saving ? 'Saving…' : dirty ? '…' : `${responded} of ${people.length} replied`}</span>
      </div>
      <div className="calhint">
        {me ? 'Tap every day you could make it.' : 'Join to mark the days you’re free.'} Arrive by {fmtTimeKey(event.arriveTime)}.
      </div>

      <div className="calnav">
        <button onClick={() => setMonth((x) => shiftMonth(x, -1))} disabled={month <= monthKey(today)} aria-label="Previous month">‹</button>
        <b>{fmtDayKey(`${month}-01`, { month: 'long', year: 'numeric' })}</b>
        <button onClick={() => setMonth((x) => shiftMonth(x, 1))} disabled={month >= lastMonth} aria-label="Next month">›</button>
      </div>

      <div className="calgrid">
        {WEEKDAYS.map((w, i) => <div key={i} className="wd">{w}</div>)}
        {cells.map((day, i) => {
          if (!day) return <div key={`b${i}`} />;
          const ids = countFor(day);
          const off = day < today || day > lastDay;
          const heat = ids.length / total;
          const isMine = mine.has(day);
          return (
            <button
              key={day}
              className={`day ${isMine ? 'mine' : ''} ${day === bestDay ? 'best' : ''} ${day === today ? 'today' : ''}`}
              disabled={off}
              onClick={() => toggle(day)}
              title={`${fmtDayKey(day)}: ${ids.length} free${ids.length ? ` (${ids.map((id) => people.find((p) => p.id === id)?.name).filter(Boolean).join(', ')})` : ''}`}
              style={!off && ids.length ? { background: `rgba(215, 255, 58, ${0.18 + heat * 0.72})`, color: heat > 0.45 ? '#000' : undefined } : undefined}
              aria-pressed={isMine}
            >
              {Number(day.slice(8))}
              {!off && ids.length > 0 && <span className="n">{ids.length}</span>}
            </button>
          );
        })}
      </div>

      {ranked.length > 0 ? (
        <div className="topdays">
          {ranked.map((day) => (
            <div key={day} className={`topday ${day === bestDay ? 'best' : ''}`}>
              <div className="when-l">
                <b>{day === bestDay ? '★ ' : ''}{fmtDayKey(day)}</b>
                <small>{byDay[day].length} of {people.length} free{day === bestDay ? ' · planning around this day' : ''}</small>
              </div>
              <Faces ids={byDay[day]} people={people} />
              {isOrganizer && <button className="btn small" onClick={() => onHost({ lockDay: day })}>Lock in</button>}
            </div>
          ))}
        </div>
      ) : (
        <div className="calhint">No days picked yet. The best day shows up here as people reply.</div>
      )}
    </div>
  );
}
