'use client';

import { useMemo, useState, type FormEvent } from 'react';
import AddressInput from './AddressInput';
import { api, setStored } from '@/lib/client';
import { ACTIVITIES, FOOD, ROLES } from '@/lib/categories';
import type { Me, PublicEvent, Role, StartFrom } from '@/lib/types';

interface Props {
  slug: string;
  me: Me | null;
  office: PublicEvent['office'];
  onClose: () => void;
  onSaved: () => void;
}

export default function JoinForm({ slug, me, office, onClose, onSaved }: Props) {
  const isNew = !me;
  const [name, setName] = useState(me?.name ?? '');
  const [role, setRole] = useState<Role>(me?.role ?? 'transit');
  const [seats, setSeats] = useState(me?.seats ?? 0);
  const [likes, setLikes] = useState<string[]>(me?.likes ?? []);
  const [address, setAddress] = useState<{ placeId: string | null; label: string }>({ placeId: null, label: me?.address ?? '' });
  const [showAddress, setShowAddress] = useState(me?.showAddress ?? false);
  const [startFrom, setStartFrom] = useState<StartFrom>(me?.startFrom ?? 'home');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One Places "session" per form, which keeps address-lookup billing low.
  const sessionToken = useMemo(() => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random())), []);
  const toggle = (k: string) => setLikes((l) => (l.includes(k) ? l.filter((x) => x !== k) : [...l, k]));

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Add your name');
    if (!address.placeId && !me?.address) return setError('Pick your address from the suggestions');
    setBusy(true);
    try {
      const body = {
        name,
        role,
        seats: role === 'driver' ? seats : 0,
        likes,
        showAddress,
        startFrom: office ? startFrom : 'home',
        ...(address.placeId ? { placeId: address.placeId, sessionToken } : {}),
      };
      if (isNew) {
        const r = await api<{ token: string }>(`/api/events/${slug}/participants`, slug, { method: 'POST', json: body });
        setStored(slug, { participantToken: r.token });
      } else {
        await api(`/api/events/${slug}/participants/me`, slug, { method: 'PATCH', json: body });
      }
      onSaved();
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
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" onSubmit={save}>
        <h2>{isNew ? "I'm in" : 'Your details'}</h2>
        <p className="lead">{isNew ? 'Takes 30 seconds. Then mark the days you’re free.' : 'Changes update the plan for everyone.'}</p>

        <div className="field">
          <span className="lbl">Name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="First name" maxLength={40} autoFocus={isNew} />
        </div>

        <AddressInput value={address} onChange={setAddress} sessionToken={sessionToken} />
        <div className="field" style={{ marginTop: -6 }}>
          <label className="switch big">
            <input type="checkbox" checked={showAddress} onChange={(e) => setShowAddress(e.target.checked)} />
            <span className="track" />
            Show my address to the group
          </label>
          <div className="hint">
            {showAddress
              ? 'Everyone in this outing will see your address and your home on their map. Handy for sorting out rides.'
              : 'Off: only you can see it, plus your driver if you ask for a ride. It’s still used to find the meeting spot.'}
          </div>
        </div>

        <div className="field">
          <span className="lbl">Setting off from</span>
          <div className="seg" style={{ marginTop: 7 }}>
            <button type="button" className={startFrom === 'home' ? 'on' : ''} onClick={() => setStartFrom('home')}>🏠 Home</button>
            <button type="button" className={startFrom === 'office' ? 'on' : ''} disabled={!office} onClick={() => setStartFrom('office')}>🏢 The office</button>
          </div>
          <div className="hint">
            {!office
              ? 'The host hasn’t added an office address, so everyone sets off from home.'
              : startFrom === 'office'
                ? `You’ll be routed from ${office.address}. If you need a ride, your driver picks you up there.`
                : 'You’ll be routed from your home address.'}
          </div>
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
            <>
              <div className="hint" style={{ marginTop: 10 }}>Seats you can offer</div>
              <div className="stepper">
                <button type="button" onClick={() => setSeats((s) => Math.max(0, s - 1))}>−</button>
                <b>{seats}</b>
                <button type="button" onClick={() => setSeats((s) => Math.min(8, s + 1))}>+</button>
              </div>
            </>
          )}
          {role === 'rider' && <div className="hint">You&apos;ll be matched with a driver, who gets your address for the pickup.</div>}
        </div>

        <div className="field">
          <span className="lbl">Food you&apos;re into</span>
          <div className="opts">
            {FOOD.map((c) => (
              <button type="button" key={c.key} className={`opt ${likes.includes(c.key) ? 'on' : ''}`} onClick={() => toggle(c.key)}>{c.icon} {c.key}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="lbl">Activities you&apos;re into</span>
          <div className="opts">
            {ACTIVITIES.map((c) => (
              <button type="button" key={c.key} className={`opt ${likes.includes(c.key) ? 'on' : ''}`} onClick={() => toggle(c.key)}>{c.icon} {c.key}</button>
            ))}
          </div>
        </div>

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
