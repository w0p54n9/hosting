'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { api, setStored } from '@/lib/client';
import { ACTIVITIES, FOOD, ROLES } from '@/lib/categories';
import type { Me, Role } from '@/lib/types';

interface Props {
  slug: string;
  me: Me | null;
  onClose: () => void;
  onSaved: () => void;
}

interface Suggestion {
  placeId: string;
  main: string;
  secondary: string;
}

export default function JoinForm({ slug, me, onClose, onSaved }: Props) {
  const isNew = !me;
  const [name, setName] = useState(me?.name ?? '');
  const [role, setRole] = useState<Role>(me?.role ?? 'transit');
  const [seats, setSeats] = useState(me?.seats ?? 0);
  const [likes, setLikes] = useState<string[]>(me?.likes ?? []);
  const [address, setAddress] = useState<{ placeId: string | null; label: string }>({ placeId: null, label: me?.address ?? '' });
  const [share, setShare] = useState(me ? me.shareLocation : true);
  const [forget, setForget] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One Places "session" per form, which keeps autocomplete billing low.
  const sessionToken = useMemo(() => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random())), []);

  const toggle = (k: string) => setLikes((l) => (l.includes(k) ? l.filter((x) => x !== k) : [...l, k]));

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Add your name');
    const hasSaved = !!me?.address && !forget;
    if (share && !address.placeId && !hasSaved) return setError('Pick your address from the suggestions, or turn off "Use my address"');
    setBusy(true);
    try {
      const body = {
        name,
        role,
        seats: role === 'driver' ? seats : 0,
        likes,
        shareLocation: share,
        ...(share && address.placeId ? { placeId: address.placeId, sessionToken } : {}),
        ...(!share && forget ? { forgetAddress: true } : {}),
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
    if (!window.confirm('Leave this outing? Your address will be deleted.')) return;
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
        <h2>{isNew ? 'Join the outing' : 'Your details'}</h2>
        <p className="lead">{isNew ? 'Takes 30 seconds. Your address stays private, and adding it is up to you.' : 'Changes update the plan for everyone.'}</p>

        <div className="field">
          <span className="lbl">Name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="First name" maxLength={40} autoFocus={isNew} />
        </div>

        <div className="field">
          <label className="switch big">
            <input type="checkbox" checked={share} onChange={(e) => { setShare(e.target.checked); setForget(false); }} />
            <span className="track" />
            Use my address to find the meeting spot
          </label>
          {!share && (
            <div className="hint">
              You&apos;ll still count for the food and activity picks, but not for the meeting spot, carpools or directions.
              You can turn this on any time.
              {me?.address && (
                <label className="forget">
                  <input type="checkbox" checked={forget} onChange={(e) => setForget(e.target.checked)} /> Also delete my saved address
                </label>
              )}
            </div>
          )}
        </div>

        {share && <AddressInput value={address} onChange={setAddress} sessionToken={sessionToken} />}

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
          {role === 'rider' && share && <div className="hint">You&apos;ll be matched with a driver. Only that driver sees your address.</div>}
          {role === 'rider' && !share && <div className="hint" style={{ color: 'var(--warn)' }}>Drivers need a pickup spot, so turn on &ldquo;Use my address&rdquo; to get matched with a ride.</div>}
          {role === 'driver' && !share && <div className="hint" style={{ color: 'var(--warn)' }}>Without your address, Hosting can&apos;t plan pickups along your route, so riders won&apos;t be matched with you.</div>}
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

function AddressInput({
  value,
  onChange,
  sessionToken,
}: {
  value: { placeId: string | null; label: string };
  onChange: (v: { placeId: string | null; label: string }) => void;
  sessionToken: string;
}) {
  const [q, setQ] = useState(value.label);
  const [list, setList] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 3) {
      setList([]);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const r = await api<{ suggestions: Suggestion[] }>(
          `/api/places/autocomplete?q=${encodeURIComponent(q)}&session=${encodeURIComponent(sessionToken)}`,
          null,
        );
        setList(r.suggestions);
      } catch {
        setList([]);
      }
    }, 250);
  }, [q, open, sessionToken]);

  return (
    <div className="field">
      <span className="lbl">Home address 🔒</span>
      <input
        type="text"
        value={q}
        placeholder="Start typing your address"
        autoComplete="off"
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          onChange({ placeId: null, label: e.target.value });
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && list.length > 0 && (
        <div className="suggest">
          {list.map((s) => (
            <button
              type="button"
              key={s.placeId}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const label = [s.main, s.secondary].filter(Boolean).join(', ');
                setQ(label);
                setOpen(false);
                onChange({ placeId: s.placeId, label });
              }}
            >
              {s.main}
              <small>{s.secondary}</small>
            </button>
          ))}
        </div>
      )}
      <div className="hint">
        Only you see this, plus your driver if you ask for a ride. It&apos;s used on the server to find the fair midpoint and is never shown to the group.
      </div>
    </div>
  );
}
