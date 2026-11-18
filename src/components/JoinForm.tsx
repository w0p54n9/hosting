'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import AddressInput, { type AddressValue } from './AddressInput';
import { RsvpPicker } from './PlanCards';
import { api, clearDraft, forgetOuting, loadDraft, saveDraft, setStored } from '@/lib/client';
import { ACTIVITIES, FOOD, NEEDS, ROLES } from '@/lib/categories';
import type { Me, Need, PublicEvent, Role, Rsvp, StartFrom } from '@/lib/types';

interface Props {
  slug: string;
  me: Me | null;
  event: PublicEvent;
  onClose: () => void;
  onSaved: (joined: boolean) => void;
}

interface Draft {
  name: string;
  rsvp: Rsvp;
  role: Role;
  seats: number;
  likes: string[];
  address: AddressValue;
  showAddress: boolean;
  startFrom: StartFrom;
  alt: AddressValue;
  phone: string;
  needs: Need[];
}

const newSession = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random()));

export default function JoinForm({ slug, me, event, onClose, onSaved }: Props) {
  const isNew = !me;
  const office = event.office;
  // A half-filled join form is kept on this device, so closing the tab doesn't lose it.
  const [draft] = useState(() => (isNew ? loadDraft<Partial<Draft>>(slug) : null));
  const [name, setName] = useState(me?.name ?? draft?.name ?? '');
  const [rsvp, setRsvp] = useState<Rsvp>(me?.rsvp ?? draft?.rsvp ?? 'going');
  const [role, setRole] = useState<Role>(me?.role ?? draft?.role ?? 'transit');
  const [seats, setSeats] = useState(me?.seats ?? draft?.seats ?? 0);
  const [likes, setLikes] = useState<string[]>(me?.likes ?? draft?.likes ?? []);
  const [address, setAddress] = useState<AddressValue>(me ? { placeId: null, label: me.address ?? '' } : draft?.address ?? { placeId: null, label: '' });
  const [showAddress, setShowAddress] = useState(me?.showAddress ?? draft?.showAddress ?? false);
  const [startFrom, setStartFrom] = useState<StartFrom>(me?.startFrom ?? draft?.startFrom ?? 'home');
  const [alt, setAlt] = useState<AddressValue>(me ? { placeId: null, label: me.altStartAddress ?? '' } : draft?.alt ?? { placeId: null, label: '' });
  const [phone, setPhone] = useState(me?.phone ?? draft?.phone ?? '');
  const [needs, setNeeds] = useState<Need[]>(me?.needs ?? draft?.needs ?? []);
  useEffect(() => {
    if (isNew) saveDraft(slug, { name, rsvp, role, seats, likes, address, showAddress, startFrom, alt, phone, needs } satisfies Draft);
  }, [isNew, slug, name, rsvp, role, seats, likes, address, showAddress, startFrom, alt, phone, needs]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Show only this outing's kind of likes; the other kind is one tap away.
  const [mainList, otherList, otherLabel] = event.kind === 'food' ? [FOOD, ACTIVITIES, 'activities'] : [ACTIVITIES, FOOD, 'food'];
  const [showOther, setShowOther] = useState(() => likes.some((k) => otherList.some((c) => c.key === k)));

  // One Places "session" per address box keeps address-lookup billing low.
  const sessionToken = useMemo(newSession, []);
  const altSession = useMemo(newSession, []);
  const toggle = (k: string) => setLikes((l) => (l.includes(k) ? l.filter((x) => x !== k) : [...l, k]));
  const toggleNeed = (k: Need) => setNeeds((l) => (l.includes(k) ? l.filter((x) => x !== k) : [...l, k]));
  const out = rsvp === 'no';
  const ride = role === 'driver' || role === 'rider';

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Add your name');
    if (!out && !address.placeId && !me?.address) return setError('Pick your address from the suggestions');
    if (!out && startFrom === 'other' && !alt.placeId && !me?.altStartAddress) return setError('Pick where you’re starting from, or choose Home');
    setBusy(true);
    try {
      const sf: StartFrom = startFrom === 'office' && !office ? 'home' : startFrom;
      const body = {
        name,
        rsvp,
        role,
        seats: role === 'driver' ? seats : 0,
        likes,
        needs,
        showAddress,
        startFrom: sf,
        phone: ride ? phone : '',
        ...(address.placeId ? { placeId: address.placeId, sessionToken } : {}),
        ...(sf === 'other' && alt.placeId ? { altPlaceId: alt.placeId } : {}),
      };
      if (isNew) {
        const r = await api<{ token: string }>(`/api/events/${slug}/participants`, slug, { method: 'POST', json: body });
        setStored(slug, { participantToken: r.token });
        clearDraft(slug);
      } else {
        await api(`/api/events/${slug}/participants/me`, slug, { method: 'PATCH', json: body });
      }
      onSaved(isNew);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function leave() {
    if (!window.confirm('Leave this outing? Your address and free days will be deleted.')) return;
    setBusy(true);
    try {
      await api(`/api/events/${slug}/participants/me`, slug, { method: 'DELETE' });
      setStored(slug, { participantToken: undefined });
      forgetOuting(slug);
      onSaved(false);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" onSubmit={save}>
        <h2>{isNew ? "I'm in" : 'Your details'}</h2>
        <p className="lead">{isNew ? 'Takes 30 seconds.' : 'Changes update the plan for everyone.'}</p>
        {isNew && (
          <div className="note" style={{ margin: '-6px 0 16px' }}>
            Already joined on another device? Open your <b>🔑 personal link</b> instead of joining again.
            {draft && <> We kept what you started typing last time.</>}
          </div>
        )}

        <div className="field">
          <span className="lbl">Name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="First name" maxLength={40} autoFocus={isNew} />
        </div>

        <div className="field">
          <span className="lbl">Are you coming?</span>
          <div style={{ marginTop: 7 }}><RsvpPicker value={rsvp} onChange={setRsvp} /></div>
          {out && <div className="hint">No problem. The host will see you can&apos;t make it, and you won&apos;t count towards the day, place or rides.</div>}
        </div>

        {!out && (
          <>
            <AddressInput value={address} onChange={setAddress} sessionToken={sessionToken} />
            <div className="field" style={{ marginTop: -6 }}>
              <label className="switch">
                <input type="checkbox" checked={showAddress} onChange={(e) => setShowAddress(e.target.checked)} />
                <span className="track" />
                Show my address to the group
              </label>
              <div className="hint">
                {showAddress
                  ? 'Everyone in this outing will see your address on their map.'
                  : 'Off: only you see it (and your driver, if you need a ride). It’s still used to find the meeting spot.'}
                {' '}Deleted 3 days after the outing.
              </div>
            </div>

            <div className="field">
              <span className="lbl">Setting off from</span>
              <div className="seg" style={{ marginTop: 7 }}>
                <button type="button" className={startFrom === 'home' ? 'on' : ''} onClick={() => setStartFrom('home')}>🏠 Home</button>
                {office && <button type="button" className={startFrom === 'office' ? 'on' : ''} onClick={() => setStartFrom('office')}>🏢 Office</button>}
                <button type="button" className={startFrom === 'other' ? 'on' : ''} onClick={() => setStartFrom('other')}>📍 Elsewhere</button>
              </div>
              {startFrom === 'office' && office && <div className="hint">You&apos;ll be routed from {office.address}.</div>}
              {startFrom === 'other' && (
                <div style={{ marginTop: 10 }}>
                  <AddressInput value={alt} onChange={setAlt} sessionToken={altSession} placeholder="Where you’ll be coming from" bare />
                  <div className="hint">Private, like your home address. Only for your own route (and your driver&apos;s pickup).</div>
                </div>
              )}
            </div>

            <div className="field">
              <span className="lbl">How are you getting there?</span>
              <div className="opts">
                {(Object.keys(ROLES) as Role[]).map((r) => (
                  <button type="button" key={r} className={`opt ${role === r ? 'on' : ''}`} onClick={() => { setRole(r); if (r === 'driver' && !seats) setSeats(2); }}>
                    {ROLES[r].icon} {ROLES[r].label}
                  </button>
                ))}
              </div>
              {role === 'driver' && (
                <div className="row" style={{ marginTop: 10, gap: 12 }}>
                  <span className="hint" style={{ margin: 0 }}>Seats you can offer</span>
                  <div className="stepper" style={{ marginTop: 0 }}>
                    <button type="button" onClick={() => setSeats((s) => Math.max(0, s - 1))}>−</button>
                    <b>{seats}</b>
                    <button type="button" onClick={() => setSeats((s) => Math.min(8, s + 1))}>+</button>
                  </div>
                </div>
              )}
              {role === 'rider' && <div className="hint">You&apos;ll be matched with a driver, who gets your pickup address.</div>}
              {ride && (
                <div style={{ marginTop: 10 }}>
                  <input type="tel" className="inp wide" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" maxLength={24} autoComplete="tel" />
                  <div className="hint">Only shared with your carpool, so {role === 'driver' ? 'riders' : 'your driver'} can text you. Deleted after the outing.</div>
                </div>
              )}
            </div>

            <div className="field">
              <span className="lbl">{event.kind === 'food' ? 'Food' : 'Activities'} you&apos;re into</span>
              <div className="opts">
                {mainList.map((c) => (
                  <button type="button" key={c.key} className={`opt ${likes.includes(c.key) ? 'on' : ''}`} onClick={() => toggle(c.key)}>{c.icon} {c.key}</button>
                ))}
              </div>
              {showOther ? (
                <>
                  <div className="hint" style={{ marginTop: 10 }}>For other outings: {otherLabel}</div>
                  <div className="opts">
                    {otherList.map((c) => (
                      <button type="button" key={c.key} className={`opt ${likes.includes(c.key) ? 'on' : ''}`} onClick={() => toggle(c.key)}>{c.icon} {c.key}</button>
                    ))}
                  </div>
                </>
              ) : (
                <button type="button" className="linkbtn" onClick={() => setShowOther(true)}>+ Also pick {otherLabel}, in case the plan changes</button>
              )}
            </div>

            <details className="field more-opts" open={needs.length > 0}>
              <summary>Dietary or access needs{needs.length ? ` · ${needs.length}` : ''}</summary>
              <div className="opts">
                {NEEDS.map((n) => (
                  <button type="button" key={n.key} className={`opt ${needs.includes(n.key) ? 'on' : ''}`} onClick={() => toggleNeed(n.key)}>{n.icon} {n.label}</button>
                ))}
              </div>
              <div className="hint">The group only sees counts, never who. Vegetarian, vegan and step-free also filter the places.</div>
            </details>
          </>
        )}

        {error && <div className="error">{error}</div>}
        <div className="actions">
          {isNew ? <span /> : <button type="button" className="danger" onClick={leave} disabled={busy}>Leave outing</button>}
          <div className="row">
            <button type="button" className="btn ghost" onClick={onClose}>{isNew ? 'Just looking' : 'Cancel'}</button>
            <button className="btn" disabled={busy}>{busy ? 'Saving…' : isNew ? 'Join' : 'Save'}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
