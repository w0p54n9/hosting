'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';

interface Suggestion {
  placeId: string;
  main: string;
  secondary: string;
}

export interface AddressValue {
  placeId: string | null;
  label: string;
}

/** Address search box backed by Google Places autocomplete (through our server). */
export default function AddressInput({
  value,
  onChange,
  sessionToken,
  label = 'Home address',
  placeholder = 'Start typing your address',
  bare = false,
}: {
  value: AddressValue;
  onChange: (v: AddressValue) => void;
  sessionToken: string;
  label?: string;
  placeholder?: string;
  bare?: boolean; // no label / field wrapper spacing (for inline use)
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
    <div className="field" style={bare ? { margin: 0 } : undefined}>
      {!bare && <span className="lbl">{label}</span>}
      <input
        type="text"
        value={q}
        placeholder={placeholder}
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
                const text = [s.main, s.secondary].filter(Boolean).join(', ');
                setQ(text);
                setOpen(false);
                onChange({ placeId: s.placeId, label: text });
              }}
            >
              {s.main}
              <small>{s.secondary}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
