'use client';

import { useEffect, useState } from 'react';
import { api, copyText, downloadIcs, fmtDay, fmtDayKeyLong, fmtTime, PRICE } from '@/lib/client';
import { NEEDS, RSVPS } from '@/lib/categories';
import { fmtTimeKey } from '@/lib/dates';
import type { EventBundle, PlaceInfo, Rsvp } from '@/lib/types';

const inviteUrl = (slug: string) => `${window.location.origin}/e/${slug}`;
const names = (list: string[]) => (list.length <= 2 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);

function useFlash(): [string | null, (s: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  return [msg, (s) => { setMsg(s); setTimeout(() => setMsg(null), 1800); }];
}

/** The place everyone's heading to (or the current top pick), with name and address. */
function placeOf(data: EventBundle) {
  return data.plan.venues.find((v) => v.placeId === data.plan.selectedPlaceId) ?? null;
}

// ---------- RSVP ----------

export function RsvpPicker({ value, onChange, busy }: { value: Rsvp; onChange: (r: Rsvp) => void; busy?: boolean }) {
  return (
    <div className="seg rsvp" role="group" aria-label="Are you coming?">
      {RSVPS.map((r) => (
        <button key={r.key} type="button" disabled={busy} className={`${value === r.key ? 'on' : ''} r-${r.key}`} onClick={() => onChange(r.key)}>
          {r.label}
        </button>
      ))}
    </div>
  );
}

// ---------- your to-do list ----------

interface TodoProps {
  data: EventBundle;
  onJoin: () => void;
  onRsvp: (r: Rsvp) => void;
  onGo: (where: 'days' | 'vote' | 'route') => void;
}

export function TodoList({ data, onJoin, onRsvp, onGo }: TodoProps) {
  const { me, event, plan, availability } = data;
  if (!me) {
    return (
      <div className="card todo">
        <div className="display todohead">You&apos;re invited</div>
        <p className="meta" style={{ marginTop: 6 }}>Add yourself so the group can find a day and a place that works for you.</p>
        <button className="btn block" style={{ marginTop: 10 }} onClick={onJoin}>I&apos;M IN →</button>
        {event.replyBy && <div className="meta" style={{ marginTop: 8 }}>Reply by {fmtDayKeyLong(event.replyBy)}</div>}
      </div>
    );
  }

  const out = me.rsvp === 'no';
  const picking = event.dateStatus === 'voting';
  const myDays = Object.values(availability.byDay).some((ids) => ids.includes(me.id));
  const voteOpen = plan.vote.open;
  const voted = !!me.placeVote && plan.vote.placeIds.includes(me.placeVote);
  const items: { done: boolean; text: string; go?: () => void; cta?: string }[] = [];
  if (!out) {
    if (picking) items.push({ done: myDays, text: myDays ? 'You marked the days you’re free' : 'Tap the days you’re free', go: () => onGo('days'), cta: myDays ? 'Change' : 'Pick days' });
    if (voteOpen) items.push({ done: voted, text: voted ? 'You voted for a place' : 'Vote: a few places are tied', go: () => onGo('vote'), cta: voted ? 'Change' : 'Vote' });
    if (plan.selectedPlaceId && me.location) items.push({ done: false, text: event.finalized ? 'See when to leave' : 'Check your route (it may still change)', go: () => onGo('route'), cta: 'Route' });
  }
  const left = items.filter((i) => !i.done).length;

  return (
    <div className="card todo">
      <div className="todohead-row">
        <span className="display todohead">{event.finalized ? 'It’s on' : out ? 'Not this time' : left ? 'Your to-do' : 'You’re all set'}</span>
        {event.replyBy && !event.finalized && <span className="replyby">Reply by {fmtDayKeyLong(event.replyBy)}</span>}
      </div>
      <span className="lbl" style={{ margin: '10px 0 6px' }}>Are you coming?</span>
      <RsvpPicker value={me.rsvp} onChange={onRsvp} />
      {out ? (
        <p className="meta" style={{ marginTop: 8 }}>
          You won&apos;t count towards the day, the place or the rides. Change your answer any time.
        </p>
      ) : (
        <ul className="todos">
          {items.map((i) => (
            <li key={i.text} className={i.done ? 'done' : ''}>
              <span className="tick">{i.done ? '✓' : ''}</span>
              <span className="tt">{i.text}</span>
              {i.go && <button className="btn small ghost" onClick={i.go}>{i.cta}</button>}
            </li>
          ))}
          {!items.length && <li className="done"><span className="tick">✓</span><span className="tt">Nothing to do. The plan will update here.</span></li>}
        </ul>
      )}
    </div>
  );
}

// ---------- host: who's left ----------

export function HostProgress({ data, onHost }: { data: EventBundle; onHost: (patch: Record<string, unknown>) => Promise<void> }) {
  const { progress, people, event, plan } = data;
  const [flash, setFlash] = useFlash();
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? '';
  const noDays = progress.noDays.map(nameOf);
  const noVote = progress.noVote.map(nameOf);

  async function copyReminder() {
    const todo = [
      event.dateStatus === 'voting' ? 'tap the days you’re free' : '',
      plan.vote.open ? 'vote on the place' : '',
    ].filter(Boolean);
    const msg = [
      `Hey! Quick one for “${event.title}”:`,
      todo.length ? `please ${todo.join(' and ')}` : 'please add yourself',
      event.replyBy ? `by ${fmtDayKeyLong(event.replyBy)}.` : 'when you get a sec.',
      `Takes 30 seconds: ${inviteUrl(event.slug)}`,
    ].join(' ');
    await copyText(msg);
    setFlash('Reminder copied');
  }

  if (event.finalized) return null;
  return (
    <div className="card">
      <div className="todohead-row">
        <span className="display todohead">Who&apos;s left</span>
        <span className="meta" style={{ marginTop: 0 }}>{progress.going} going · {progress.maybe} maybe · {progress.no} out</span>
      </div>
      <ul className="todos">
        {event.dateStatus === 'voting' && (
          <li className={noDays.length ? '' : 'done'}>
            <span className="tick">{noDays.length ? noDays.length : '✓'}</span>
            <span className="tt">{noDays.length ? `Haven’t picked days: ${names(noDays)}` : 'Everyone has picked their days'}</span>
          </li>
        )}
        {plan.vote.open && (
          <li className={noVote.length ? '' : 'done'}>
            <span className="tick">{noVote.length ? noVote.length : '✓'}</span>
            <span className="tt">{noVote.length ? `Haven’t voted: ${names(noVote)}` : 'Everyone has voted'}</span>
          </li>
        )}
      </ul>
      <span className="lbl" style={{ margin: '12px 0 5px' }}>Reply by</span>
      <div className="row" style={{ marginTop: 0 }}>
        <input
          type="date"
          className="inp"
          defaultValue={event.replyBy ?? ''}
          key={'rb' + event.replyBy}
          min={data.availability.today}
          onChange={(e) => onHost({ replyBy: e.target.value || null })}
        />
        <button className="btn small" onClick={copyReminder}>{flash ?? 'Copy reminder'}</button>
      </div>
      <div className="hint">Paste the reminder into your group chat. It has the invite link in it.</div>
    </div>
  );
}

// ---------- the final plan ----------

export function FinalPlan({ data, onHost }: { data: EventBundle; onHost: (patch: Record<string, unknown>) => Promise<void> }) {
  const { event, isOrganizer, progress, needs, slug } = { ...data, slug: data.event.slug };
  const place = placeOf(data);
  const [info, setInfo] = useState<PlaceInfo | null>(null);
  const [flash, setFlash] = useFlash();

  useEffect(() => {
    let cancelled = false;
    api<{ info: PlaceInfo | null }>(`/api/events/${slug}/place-info`, slug)
      .then((r) => !cancelled && setInfo(r.info))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug, event.chosenPlaceId]);

  if (!place) return null;
  const when = `${fmtDay(event.startsAt)} · arrive by ${fmtTime(event.startsAt)}`;
  const needList = NEEDS.filter((n) => needs[n.key]).map((n) => `${needs[n.key]} ${n.label.toLowerCase()}`);
  const headcount = progress.going + (progress.maybe ? ` (+${progress.maybe} maybe)` : '');

  async function announce() {
    await copyText(
      `🎉 ${event.title} is on! ${fmtDay(event.startsAt)}, arrive by ${fmtTime(event.startsAt)} at ${place!.name} (${place!.address}). ` +
        `Your directions and when to leave: ${inviteUrl(slug)}`,
    );
    setFlash('Copied');
  }

  return (
    <div className="card final">
      <div className="eyebrow">{event.finalized ? '🔒 Locked in' : 'Plan so far'}</div>
      <div className="display finaltitle">{event.title}</div>
      <div className="finalrow"><span>📅</span><b>{when}</b></div>
      <div className="finalrow"><span>📍</span><div><b>{place.name}</b>{place.priceLevel && PRICE[place.priceLevel] ? <span className="price">{PRICE[place.priceLevel]}</span> : null}<div className="meta">{place.address}</div></div></div>
      <div className="finalrow"><span>👥</span><b>{headcount} going</b></div>
      <div className="linkbtns" style={{ marginTop: 12 }}>
        <button className="btn small" onClick={() => downloadIcs({ slug, title: event.title, startsAt: event.startsAt, place: place.name, address: place.address, url: inviteUrl(slug) })}>
          📅 Add to calendar
        </button>
        {place.mapsUri && <a className="btn small ghost" href={place.mapsUri} target="_blank" rel="noreferrer">Map</a>}
        {isOrganizer && <button className="btn small ghost" onClick={announce}>{flash ?? '📣 Copy announcement'}</button>}
      </div>

      {isOrganizer && (
        <div className="booking">
          <span className="lbl" style={{ marginBottom: 6 }}>To book</span>
          <div>Table for <b>{progress.going}</b>{progress.maybe ? <> (up to <b>{progress.going + progress.maybe}</b> with maybes)</> : null}</div>
          {needList.length > 0 && <div>Mention: {needList.join(', ')}</div>}
          {info?.phone && <div>📞 <a href={`tel:${info.phone.replace(/[^\d+]/g, '')}`}>{info.phone}</a></div>}
          {info?.website && <div>🌐 <a href={info.website} target="_blank" rel="noreferrer">{new URL(info.website).hostname.replace(/^www\./, '')}</a></div>}
          {info?.reservable === true && <div className="okline">Takes reservations</div>}
          {info?.hours?.length ? (
            <details className="hours">
              <summary>Opening hours</summary>
              {info.hours.map((h) => <div key={h}>{h}</div>)}
            </details>
          ) : null}
        </div>
      )}

      {event.addressesPurged && <div className="note" style={{ marginTop: 12 }}>🔒 Everyone&apos;s addresses and phone numbers were deleted 3 days after the outing.</div>}
      {isOrganizer && event.finalized && (
        <button className="linkbtn" onClick={() => window.confirm('Reopen the plan? People can change the day and vote on places again.') && onHost({ finalize: false })}>
          Reopen the plan
        </button>
      )}
    </div>
  );
}

// ---------- since your last visit ----------

export function ChangesBanner({ changes, onDismiss }: { changes: string[]; onDismiss: () => void }) {
  if (!changes.length) return null;
  return (
    <div className="changes" role="status">
      <div>
        <b>Since your last visit</b>
        <ul>{changes.map((c) => <li key={c}>{c}</li>)}</ul>
      </div>
      <button className="x" onClick={onDismiss} aria-label="Dismiss">×</button>
    </div>
  );
}

export const arriveLabel = (data: EventBundle) =>
  data.event.dateStatus === 'voting' ? `Day: being picked · arrive by ${fmtTimeKey(data.event.arriveTime)}` : `${fmtDay(data.event.startsAt)} · arrive by ${fmtTime(data.event.startsAt)}`;
