'use client';

import { useState } from 'react';
import { personalLink } from '@/lib/client';

/**
 * Shows this person's private "get back in" link, with ways to keep it:
 * copy, email it to yourself, or share it (phones).
 */
export default function MyLinkSheet({
  slug,
  title,
  justJoined,
  isHost,
  onClose,
}: {
  slug: string;
  title: string;
  justJoined: boolean;
  isHost: boolean;
  onClose: () => void;
}) {
  const link = personalLink(slug) ?? '';
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const subject = `My GOING OUT link: ${title}`;
  const body = `My personal link for "${title}" on GOING OUT. Opening it on any device signs me back in:\n\n${link}\n\nKeep it to yourself. Anyone with it can change my details.`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* the link is selectable in the box */
    }
  }

  async function share() {
    try {
      await navigator.share({ title: subject, text: `My personal GOING OUT link for "${title}"`, url: link });
    } catch {
      /* cancelled */
    }
  }

  return (
    <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <h2>{justJoined ? "You're in" : 'Your link'}</h2>
        <p className="lead">
          {justJoined ? 'One last thing. ' : ''}Save your personal link. Open it on any phone or computer to get straight back in as you
          {isHost ? ', with your host controls' : ''}. No need to join again.
        </p>
        <div className="field">
          <span className="lbl">🔑 Your personal link</span>
          <input type="text" readOnly value={link} onFocus={(e) => e.target.select()} />
          <div className="hint warn">Keep it to yourself. It works like a key: anyone with it can act as you{isHost ? ' and as the host' : ''}.</div>
        </div>
        <div className="linkbtns">
          <button className="btn" onClick={copy}>{copied ? 'Copied ✓' : 'Copy link'}</button>
          <a className="btn ghost" href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>Email it to myself</a>
          {canShare && <button className="btn ghost" onClick={share}>Share…</button>}
        </div>
        <p className="hint" style={{ marginTop: 14 }}>
          Lost it? Open the outing on a device you&apos;ve already used and tap <b>🔑 My link</b> under your name.
        </p>
        <div className="actions">
          <span />
          <button className="btn ghost" onClick={onClose}>{justJoined ? 'Done, take me to the plan' : 'Close'}</button>
        </div>
      </div>
    </div>
  );
}
