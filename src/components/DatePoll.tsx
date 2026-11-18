'use client';

import { useState } from 'react';
import { fmtDay, fmtTime, joinLocal, splitLocal } from '@/lib/client';
import type { DateOption, EventBundle, PublicPerson, Vote } from '@/lib/types';

const VOTES: { v: Vote; label: string; title: string }[] = [
  { v: 'yes', label: '✓', title: 'Works for me' },
  { v: 'maybe', label: '~', title: 'Maybe' },
  { v: 'no', label: '✗', title: "Can't make it" },
];

const score = (o: DateOption) => o.yes.length * 2 + o.maybe.length;

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

/** Shown while the date is being voted on. Everyone votes; the host locks one in. */
export default function DatePoll({
  data,
  onVote,
  onHost,
}: {
  data: EventBundle;
  onVote: (optionId: string, vote: Vote | null) => void;
  onHost: (patch: Record<string, unknown>) => void;
}) {
  const { dateOptions: options, people, me, isOrganizer } = data;
  const [adding, setAdding] = useState(() => splitLocal(options[options.length - 1]?.startsAt ?? data.event.startsAt));

  const best = options.reduce<DateOption | null>((b, o) => (score(o) > (b ? score(b) : 0) ? o : b), null);
  const voted = new Set(options.flatMap((o) => [...o.yes, ...o.maybe, ...o.no])).size;
  const myVote = (o: DateOption): Vote | null =>
    !me ? null : o.yes.includes(me.id) ? 'yes' : o.maybe.includes(me.id) ? 'maybe' : o.no.includes(me.id) ? 'no' : null;

  return (
    <div className="card poll">
      <div className="pollhead">
        <b>🗳️ Vote on a date</b>
        <span className="meta">{voted} of {people.length} voted</span>
      </div>
      <p className="hint" style={{ marginTop: 2 }}>
        {me ? 'Tap ✓ for every date that works, ~ for maybe.' : 'Join the outing to vote.'}
        {isOrganizer ? ' As host, lock in a date when you’re ready.' : ' The host locks in the final date.'}
      </p>

      {options.map((o) => {
        const mine = myVote(o);
        const leading = best?.id === o.id;
        return (
          <div key={o.id} className={`optrow ${leading ? 'lead' : ''}`}>
            <div className="optwhen">
              <span><b>{fmtDay(o.startsAt)}</b> · {fmtTime(o.startsAt)}</span>
              {leading && <span className="leadbadge">Leading</span>}
            </div>
            <div className="tally">
              <Faces ids={o.yes} people={people} />
              <span>✓ {o.yes.length}</span>
              <span>~ {o.maybe.length}</span>
              <span>✗ {o.no.length}</span>
            </div>
            {me && (
              <div className="votebtns">
                {VOTES.map(({ v, label, title }) => (
                  <button key={v} className={`vb ${v} ${mine === v ? 'on' : ''}`} title={title} aria-pressed={mine === v} onClick={() => onVote(o.id, mine === v ? null : v)}>
                    {label} <span>{title}</span>
                  </button>
                ))}
              </div>
            )}
            {isOrganizer && (
              <div className="hostrow">
                <button className="btn small" onClick={() => onHost({ lockDate: o.id })}>Lock in this date</button>
                {options.length > 2 && <button className="linkbtn" onClick={() => onHost({ removeDateOption: o.id })}>Remove</button>}
              </div>
            )}
          </div>
        );
      })}

      {isOrganizer && options.length < 8 && (
        <div className="addopt">
          <span className="lbl">Add another option</span>
          <div className="row">
            <input type="date" value={adding.date} onChange={(e) => setAdding((a) => ({ ...a, date: e.target.value }))} />
            <input type="time" value={adding.time} onChange={(e) => setAdding((a) => ({ ...a, time: e.target.value }))} />
            <button className="btn small" disabled={!adding.date} onClick={() => onHost({ addDateOption: joinLocal(adding.date, adding.time) })}>Add</button>
          </div>
        </div>
      )}
    </div>
  );
}
