'use client';

import { useState } from 'react';
import { PRICE, fmtDay, fmtTime } from '@/lib/client';
import { MODE_LABEL, iconFor } from '@/lib/categories';
import type { EventBundle, MyTrip, PublicPerson } from '@/lib/types';

function Stack({ ids, people }: { ids: string[]; people: PublicPerson[] }) {
  return (
    <span className="stack">
      {ids.slice(0, 6).map((id) => {
        const p = people.find((x) => x.id === id);
        return p ? <i key={id} style={{ background: p.color }} title={p.name}>{p.name[0]}</i> : null;
      })}
    </span>
  );
}

export function PlacesPanel({
  data,
  focusId,
  onFocus,
  onChoose,
  onVote,
  onJoin,
}: {
  data: EventBundle;
  focusId: string | null;
  onFocus: (id: string) => void;
  onChoose: (id: string) => void;
  onVote: (placeId: string | null) => void;
  onJoin: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const { plan, people, isOrganizer, event } = data;
  const located = people.filter((p) => p.hasLocation).length;
  const total = people.length;
  const nameOf = (id: string | null) => people.find((p) => p.id === id)?.name ?? '';

  if (plan.error) return <div className="note warn">{plan.error}</div>;
  if (!located) return <div className="empty">Once people join with their address, the best places show up here.</div>;
  if (!plan.venues.length) return <div className="empty">No places found near the midpoint yet. Try switching between Food and Activity.</div>;

  const shown = showAll ? plan.venues : plan.venues.slice(0, 8);
  const inVote = new Set(plan.vote.open ? plan.vote.placeIds : []);
  const myVote = data.me?.placeVote && inVote.has(data.me.placeVote) ? data.me.placeVote : null;
  const votes = plan.vote.open ? plan.venues.filter((v) => inVote.has(v.placeId)).reduce((n, v) => n + v.voterIds.length, 0) : 0;
  return (
    <>
      <p className="explain">
        Places most people are into come first, then the fairest trip ({event.midpointMode === 'fair' ? 'shortest longest trip' : 'least total travel'}).{' '}
        {isOrganizer ? 'As host, you can lock in the final spot.' : 'The host can lock in the final spot.'}
      </p>
      {plan.vote.open && (
        <div className="votebanner">
          <b>🗳️ It&apos;s a tie: vote for your pick</b>
          <span>
            {plan.vote.placeIds.length} places that {plan.vote.fans} of {total} people are into. The most votes goes to the top.
            {' '}{votes} of {total} voted{myVote ? ', including you' : ''}.
          </span>
          {!data.me && <button className="btn small" onClick={onJoin}>Join to vote</button>}
        </div>
      )}
      {shown.map((v, i) => {
        const isSel = v.placeId === plan.selectedPlaceId;
        return (
          <div key={v.placeId} className={`place ${isSel ? 'sel' : ''} ${focusId === v.placeId ? 'focus' : ''}`} onClick={() => onFocus(v.placeId)} role="button" tabIndex={0}>
            <div className="rank">{i + 1}</div>
            <div>
              <div className="pn">
                {iconFor(v.category)} {v.name}
                {v.priceLevel && PRICE[v.priceLevel] && <span className="price">{PRICE[v.priceLevel]}</span>}
              </div>
              <div className="pmeta">
                {v.category}
                {v.rating ? ` · ★ ${v.rating.toFixed(1)}` : ''} · {v.kmFromMidpoint} km from midpoint
              </div>
              <div className="fit">
                {v.fanIds.length > 0 && <Stack ids={v.fanIds} people={people} />}
                <span><b>{v.fanIds.length} of {total}</b> into {v.category}</span>
              </div>
              <div className="bars">
                <span>avg <b>{v.avgMin} min</b></span>
                <span>longest <b>{v.maxMin} min</b>{v.worstId ? ` (${nameOf(v.worstId)})` : ''}</span>
              </div>
              {inVote.has(v.placeId) && (
                <div className="voterow">
                  {data.me && (
                    <button
                      className={`votebtn ${myVote === v.placeId ? 'on' : ''}`}
                      onClick={(e) => { e.stopPropagation(); onVote(myVote === v.placeId ? null : v.placeId); }}
                      aria-pressed={myVote === v.placeId}
                    >
                      {myVote === v.placeId ? '✓ Your vote' : 'Vote'}
                    </button>
                  )}
                  <span className="votecount">{v.voterIds.length} vote{v.voterIds.length === 1 ? '' : 's'}</span>
                  {v.voterIds.length > 0 && <Stack ids={v.voterIds} people={people} />}
                </div>
              )}
              <div className="placeactions">
                {isOrganizer && !isSel && (
                  <button className="btn small" onClick={(e) => { e.stopPropagation(); onChoose(v.placeId); }}>Make this the group pick</button>
                )}
                {v.mapsUri && (
                  <a className="btn small ghost" href={v.mapsUri} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>View on Google Maps</a>
                )}
              </div>
            </div>
            {isSel && <span className="badge">{event.chosenPlaceId ? 'Group pick' : plan.vote.open ? 'Leading' : 'Top pick'}</span>}
          </div>
        );
      })}
      {plan.venues.length > 8 && (
        <button className="more" onClick={() => setShowAll((s) => !s)}>{showAll ? 'Show top 8 only' : `Show all ${plan.venues.length}`}</button>
      )}
    </>
  );
}

export function DirectionsPanel({
  data,
  trip,
  loading,
  error,
  onJoin,
}: {
  data: EventBundle;
  trip: MyTrip | null;
  loading: boolean;
  error: string | null;
  onJoin: () => void;
}) {
  if (!data.me) {
    return (
      <div className="empty">
        <p>Join with your address to get your own directions and leave time.</p>
        <button className="btn" onClick={onJoin}>Join the outing</button>
      </div>
    );
  }
  if (!data.me.location) {
    return (
      <div className="empty">
        <p>Add your address to get directions and a leave-by time.</p>
        <button className="btn" onClick={onJoin}>Add my address</button>
      </div>
    );
  }
  if (error) return <div className="note warn">{error}</div>;
  if (loading && !trip) return <div className="empty">Working out your route…</div>;
  if (!trip) return <div className="empty">Directions appear once there&apos;s a place to go.</div>;

  const m = MODE_LABEL[trip.mode];
  return (
    <>
      <div className="dhead">
        <div className="eyebrow">Your trip to</div>
        <h2>{trip.venue.name}</h2>
        <p>Arrive by {fmtTime(trip.arriveAt)}, {fmtDay(trip.arriveAt)}</p>
      </div>

      {data.event.dateStatus === 'voting' && (
        <div className="note" style={{ marginTop: 12 }}>
          📅 The day isn&apos;t locked in yet. These times are for {fmtDay(trip.arriveAt)}, the day most people are free so far.
        </div>
      )}

      {trip.unmatched && (
        <div className="note warn" style={{ marginTop: 12 }}>
          All seats are taken right now, so here&apos;s a transit route. If a driver adds a seat, you&apos;ll be matched automatically.
        </div>
      )}

      {trip.driverName ? (
        <div className="leave ride">
          <div className="big">{fmtTime(trip.pickupAt!)}</div>
          <div className="sub">{trip.driverName} picks you up<br />🚗 about {trip.minutes} min ride · be out front</div>
        </div>
      ) : (
        <div className={`leave ${trip.unmatched ? 'warn' : ''}`}>
          <div className="big">{fmtTime(trip.leaveAt)}</div>
          <div className="sub">
            {trip.fromOffice ? 'leave the office' : 'leave home'}<br />
            {m.icon} {trip.minutes} min {m.label}{trip.km ? ` · ${trip.km} km` : ''}
            {trip.pickups?.length ? ` · ${trip.pickups.length} pickup${trip.pickups.length > 1 ? 's' : ''}` : ''}
          </div>
        </div>
      )}

      {trip.pickups && trip.pickups.length > 0 && (
        <div className="note" style={{ marginTop: 0, marginBottom: 12 }}>
          {trip.pickups.map((p) => (
            <div key={p.name + p.at}>🙋 <b>{p.name}</b> at {fmtTime(p.at)}: {p.address}</div>
          ))}
          <div style={{ marginTop: 6 }}>🔒 They shared their address with you only because you&apos;re their driver.</div>
        </div>
      )}

      <a className="btn block" href={trip.mapsUrl} target="_blank" rel="noreferrer">Open in Google Maps</a>

      <ol className="steps" style={{ marginTop: 12 }}>
        {trip.steps.map((s, i) => (
          <li key={i} className={s.highlight ? 'hl' : ''}>
            <span className="ic">{s.icon}</span>
            <span>
              <span className="t">{s.text}</span>
              {s.detail && <div className="d">{s.detail}</div>}
            </span>
          </li>
        ))}
      </ol>

      {trip.driverName && <div className="note">🔒 Your address is shared with <b>{trip.driverName}</b> only, for the pickup.</div>}
      {trip.estimated && <div className="note">Live directions weren&apos;t available, so these times are estimates.</div>}
    </>
  );
}
