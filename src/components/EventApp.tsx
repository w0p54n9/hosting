'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import HostingMap from './HostingMap';
import JoinForm from './JoinForm';
import { DirectionsPanel, PlacesPanel } from './Panels';
import { api, fmtDay, fmtTime, joinLocal, splitLocal } from '@/lib/client';
import { MODE_LABEL, ROLES, categoriesFor, iconFor } from '@/lib/categories';
import type { EventBundle, MyTrip } from '@/lib/types';

const POLL_MS = 20_000;

export default function EventApp({ slug }: { slug: string }) {
  const [data, setData] = useState<EventBundle | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<'places' | 'route'>('places');
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [dismissedJoin, setDismissedJoin] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [trip, setTrip] = useState<MyTrip | null>(null);
  const [tripLoading, setTripLoading] = useState(false);
  const [tripError, setTripError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<EventBundle>(`/api/events/${slug}`, slug));
      setLoadError(null);
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }, [slug]);

  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === 'visible' && load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // New visitors get the join form straight away.
  useEffect(() => {
    if (data && !data.me && !dismissedJoin) setEditing(true);
  }, [data, dismissedJoin]);

  // Re-fetch my directions only when something that affects them changes.
  const me = data?.me ?? null;
  const pool = data?.plan.carpools.find((c) => c.driverId === me?.id || c.riderIds.includes(me?.id ?? ''));
  const tripKey = data && me
    ? JSON.stringify([data.plan.selectedPlaceId, data.event.startsAt, me.role, me.seats, me.location, pool])
    : null;
  useEffect(() => {
    if (!tripKey) {
      setTrip(null);
      return;
    }
    let cancelled = false;
    setTripLoading(true);
    setTripError(null);
    api<MyTrip>(`/api/events/${slug}/trip`, slug)
      .then((t) => !cancelled && setTrip(t))
      .catch((err) => !cancelled && (setTrip(null), setTripError((err as Error).message)))
      .finally(() => !cancelled && setTripLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tripKey, slug]);

  async function patchEvent(patch: Record<string, unknown>) {
    try {
      await api(`/api/events/${slug}`, slug, { method: 'PATCH', json: patch });
      await load();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/e/${slug}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* the link is visible in the box to copy by hand */
    }
  }

  if (loadError && !data) {
    return (
      <main className="landing">
        <div className="sheet">
          <h2>Couldn&apos;t open this outing</h2>
          <p className="lead">{loadError}</p>
          <Link className="btn" href="/">Plan a new outing</Link>
        </div>
      </main>
    );
  }
  if (!data) return <main className="landing"><p className="lead">Loading…</p></main>;

  const { event, people, plan, isOrganizer } = data;
  const tags = new Set(categoriesFor(event.kind).map((c) => c.key));
  const sorted = [...people].sort((a, b) => Number(b.id === me?.id) - Number(a.id === me?.id));
  const local = splitLocal(event.startsAt);

  return (
    <div className="app">
      <aside className="side">
        <Link className="brand" href="/"><b>hosting<i>.</i></b></Link>

        <div className="card">
          {isOrganizer ? (
            <>
              <div className="row" style={{ marginTop: 0, justifyContent: 'space-between' }}>
                <span className="hostbadge">You&apos;re hosting</span>
              </div>
              <input
                className="title"
                defaultValue={event.title}
                key={event.title}
                aria-label="Outing name"
                onBlur={(e) => e.target.value.trim() && e.target.value !== event.title && patchEvent({ title: e.target.value })}
              />
              <div className="row">
                <input type="date" defaultValue={local.date} key={'d' + event.startsAt} onChange={(e) => e.target.value && patchEvent({ startsAt: joinLocal(e.target.value, local.time) })} />
                <input type="time" defaultValue={local.time} key={'t' + event.startsAt} onChange={(e) => e.target.value && patchEvent({ startsAt: joinLocal(local.date, e.target.value) })} />
              </div>
              <div className="row">
                <div className="seg">
                  <button className={event.kind === 'food' ? 'on' : ''} onClick={() => patchEvent({ kind: 'food' })}>🍽️ Food</button>
                  <button className={event.kind === 'activity' ? 'on' : ''} onClick={() => patchEvent({ kind: 'activity' })}>🎳 Activity</button>
                </div>
              </div>
              <span className="lbl">Pick the midpoint that&apos;s…</span>
              <select value={event.midpointMode} onChange={(e) => patchEvent({ midpointMode: e.target.value })}>
                <option value="fair">Fairest: shortest longest trip</option>
                <option value="total">Least total travel for the group</option>
              </select>
            </>
          ) : (
            <>
              <div className="title" style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: 19 }}>{event.title}</div>
              <div className="meta">{fmtDay(event.startsAt)} · arrive by {fmtTime(event.startsAt)}</div>
              <div className="meta">{event.kind === 'food' ? '🍽️ Food' : '🎳 Activity'} · {event.midpointMode === 'fair' ? 'fairest midpoint' : 'least total travel'}</div>
            </>
          )}
          <span className="lbl">Invite link</span>
          <div className="invite">
            <input readOnly value={typeof window !== 'undefined' ? `${window.location.origin}/e/${slug}` : `/e/${slug}`} onFocus={(e) => e.target.select()} />
            <button className="btn small" onClick={copyInvite}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
        </div>

        <h3>
          <span>Who&apos;s coming · {people.length}</span>
          {!me && <button className="btn small ghost" onClick={() => setEditing(true)}>+ Join</button>}
        </h3>
        {sorted.map((p) => {
          const mine = p.id === me?.id;
          const est = plan.estimates[p.id];
          const likes = p.likes.filter((t) => tags.has(t));
          const driverName = est?.driverId ? people.find((x) => x.id === est.driverId)?.name : null;
          return (
            <div key={p.id} className={`person ${mine ? 'me' : ''}`}>
              <div className="av" style={{ background: p.color }}>{p.name[0]}</div>
              <div>
                <div className="pname">
                  {p.name} {mine && <span className="you">YOU</span>}
                  <span className="role">
                    {ROLES[p.role].icon} {ROLES[p.role].label}
                    {p.role === 'driver' && p.seats ? ` · ${p.seats} seat${p.seats > 1 ? 's' : ''}` : ''}
                  </span>
                </div>
                {mine ? <div className="addr mine">🔒 {me!.address} · only you</div> : <div className="addr">🔒 Address private</div>}
                <div className="chips">
                  {likes.length ? likes.map((t) => <span key={t} className="chip">{iconFor(t)} {t}</span>) : <span className="chip" style={{ opacity: 0.6 }}>Open to anything</span>}
                </div>
                {mine && <button className="linkbtn" onClick={() => setEditing(true)}>Edit my details →</button>}
              </div>
              {est ? (
                <div className={`ptime ${est.unmatched ? 'warn' : ''}`}>
                  {est.minutes}
                  <small>min · {est.unmatched ? 'no ride yet' : driverName ? `with ${driverName}` : MODE_LABEL[est.mode].label}</small>
                </div>
              ) : <div className="ptime"><small>—</small></div>}
            </div>
          );
        })}
        {!people.length && <div className="empty" style={{ padding: 20 }}>No one yet. Share the invite link!</div>}

        <div style={{ marginTop: 20 }}>
          <h3>Carpools</h3>
          {plan.carpools.filter((c) => c.riderIds.length || c.openSeats).map((c) => {
            const d = people.find((p) => p.id === c.driverId);
            if (!d) return null;
            return (
              <div key={c.driverId} className="pool">
                <div className="ph"><span className="dot" style={{ background: d.color }} />🚗 {d.name} is driving</div>
                <div className="seats">
                  {c.riderIds.map((id) => <span key={id} className="seat">🙋 {people.find((p) => p.id === id)?.name}</span>)}
                  {Array.from({ length: c.openSeats }, (_, i) => <span key={i} className="seat open">open seat</span>)}
                </div>
              </div>
            );
          })}
          {plan.unmatchedRiderIds.map((id) => (
            <div key={id} className="pool warn">🙋 <b>{people.find((p) => p.id === id)?.name}</b> still needs a ride. All seats are taken.</div>
          ))}
          {!plan.carpools.some((c) => c.riderIds.length || c.openSeats) && !plan.unmatchedRiderIds.length && (
            <div className="pool" style={{ color: 'var(--muted)' }}>No drivers offering seats yet.</div>
          )}
        </div>
      </aside>

      <main className={`mapwrap ${collapsed ? 'collapsed' : ''}`}>
        <div className="stage">
          <HostingMap
            plan={plan}
            me={me}
            people={people}
            trip={trip}
            focusId={focusId}
            panelOpen={!collapsed}
            onSelectVenue={(id) => {
              setFocusId(id);
              setTab('places');
              setCollapsed(false);
            }}
          />
          <div className="overlay top">
            <div className="pill">🔒 Only your own home is on your map</div>
          </div>
          {plan.midpoint && (
            <div className="overlay bottom">
              <div className="pill"><b style={{ color: 'var(--accent-ink)' }}>◎ Midpoint</b> longest trip from here ≈ {plan.midpointMaxMin} min (estimate)</div>
            </div>
          )}
        </div>
        <button className="showpanel" onClick={() => setCollapsed(false)}>☰ Places &amp; directions</button>
        <aside className="panel">
          <div className="tabs">
            <button className={tab === 'places' ? 'on' : ''} onClick={() => setTab('places')}>Ranked places</button>
            <button className={tab === 'route' ? 'on' : ''} onClick={() => setTab('route')}>Your directions</button>
            <button className="collapse" onClick={() => setCollapsed(true)} title="Hide panel" aria-label="Hide panel">›</button>
          </div>
          <div className="pbody">
            {tab === 'places' ? (
              <PlacesPanel data={data} focusId={focusId} onFocus={setFocusId} onChoose={(id) => patchEvent({ chosenPlaceId: id })} />
            ) : (
              <DirectionsPanel data={data} trip={trip} loading={tripLoading} error={tripError} onJoin={() => setEditing(true)} />
            )}
          </div>
        </aside>
      </main>

      {editing && (
        <JoinForm
          slug={slug}
          me={me}
          onClose={() => {
            setEditing(false);
            setDismissedJoin(true);
          }}
          onSaved={async () => {
            setEditing(false);
            setDismissedJoin(true);
            await load();
          }}
        />
      )}
    </div>
  );
}
