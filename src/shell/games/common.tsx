import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { GameSource, LibraryGame } from '../../../shared/types';

/** Plain names for where a game comes from. */
export const SOURCE_LABEL: Record<GameSource, string> = {
  module: 'Supported',
  steam: 'Steam',
  epic: 'Epic Games',
  xbox: 'Xbox',
  manual: 'Added by you',
  anker: 'Anker Games',
  emulator: 'Found on this PC',
  gog: 'GOG',
  ea: 'EA app',
  ubisoft: 'Ubisoft Connect',
  battlenet: 'Battle.net',
  riot: 'Riot Games',
  rockstar: 'Rockstar Games',
  amazon: 'Amazon Games',
  itch: 'itch.io',
  rpcs3: 'RPCS3 (PS3)',
  ryujinx: 'Ryujinx (Switch)',
  mgba: 'mGBA (Game Boy Advance)',
};

/** Small coloured store badge (letters, not the stores' own logos). */
const BADGE: Record<GameSource, { text: string; bg: string; fg: string }> = {
  steam: { text: 'S', bg: '#1b2838', fg: '#66c0f4' },
  epic: { text: 'E', bg: '#2a2a2a', fg: '#ffffff' },
  xbox: { text: 'X', bg: '#107c10', fg: '#ffffff' },
  anker: { text: 'A', bg: '#3a2a6a', fg: '#d6c8ff' },
  manual: { text: '+', bg: '#2b2f5a', fg: '#c7cbff' },
  module: { text: 'SC', bg: '#4f8cff', fg: '#ffffff' },
  emulator: { text: 'PC', bg: '#2b2f5a', fg: '#c7cbff' },
  gog: { text: 'G', bg: '#5c2d91', fg: '#ffffff' },
  ea: { text: 'EA', bg: '#ff4747', fg: '#ffffff' },
  ubisoft: { text: 'U', bg: '#0070ff', fg: '#ffffff' },
  battlenet: { text: 'B', bg: '#0e86ca', fg: '#ffffff' },
  riot: { text: 'R', bg: '#d13639', fg: '#ffffff' },
  rockstar: { text: 'R*', bg: '#fcaf17', fg: '#111111' },
  amazon: { text: 'a', bg: '#232f3e', fg: '#ff9900' },
  itch: { text: 'i', bg: '#fa5c5c', fg: '#ffffff' },
  rpcs3: { text: 'P3', bg: '#1b1b1b', fg: '#ffd400' },
  ryujinx: { text: 'NS', bg: '#e60012', fg: '#ffffff' },
  mgba: { text: 'GB', bg: '#6a5acd', fg: '#ffffff' },
};

export function StoreBadge({ source, size = 20, title }: { source: GameSource; size?: number; title?: string }) {
  const b = BADGE[source];
  return (
    <span
      title={title ?? SOURCE_LABEL[source]}
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        display: 'inline-grid',
        placeItems: 'center',
        background: b.bg,
        color: b.fg,
        fontSize: size * (b.text.length > 1 ? 0.42 : 0.55),
        fontWeight: 900,
        flex: 'none',
        boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
      }}
    >
      {b.text}
    </span>
  );
}

/** The store a card shows: the installed copy Play would use, else the first one. */
export function mainSource(g: LibraryGame): GameSource {
  const copies = g.copies ?? [];
  return (copies.find((c) => c.installed && c.source !== 'module') ?? copies.find((c) => c.source !== 'module') ?? copies[0])?.source ?? g.source;
}

export function formatSize(bytes?: number): string | null {
  if (!bytes) return null;
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb >= 10 ? Math.round(gb) : gb.toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

export function formatPlaytime(min?: number): string | null {
  if (!min) return null;
  if (min < 60) return `${min} min`;
  const h = min / 60;
  return `${h < 10 ? h.toFixed(1) : Math.round(h)} h`;
}

// ---------- Toasts ----------

/** Shows a short message at the bottom of the window (rendered by ShellApp). */
export function toast(text: string, kind: 'info' | 'error' = 'info'): void {
  window.dispatchEvent(new CustomEvent('sc-toast', { detail: { text, kind } }));
}

export function Toasts() {
  const [items, setItems] = useState<{ id: number; text: string; kind: string }[]>([]);
  useEffect(() => {
    let n = 0;
    const onToast = (e: Event) => {
      const { text, kind } = (e as CustomEvent<{ text: string; kind: string }>).detail;
      const id = ++n;
      setItems((list) => [...list.slice(-2), { id, text, kind }]);
      setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 4500);
    };
    window.addEventListener('sc-toast', onToast);
    return () => window.removeEventListener('sc-toast', onToast);
  }, []);
  if (!items.length) return null;
  return (
    <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', display: 'grid', gap: 8, zIndex: 60 }}>
      {items.map((t) => (
        <div
          key={t.id}
          className="card enter"
          style={{ padding: '10px 18px', fontWeight: 600, ['--tier' as string]: t.kind === 'error' ? 'var(--red)' : 'var(--green)' }}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

/** Play from anywhere: through the store, with a toast when it can't. */
export async function play(g: LibraryGame, source?: GameSource): Promise<void> {
  const r = await window.shotcaller.playGame(g.key, source);
  if (!r.ok) toast(r.error ?? 'Couldn’t start it.', 'error');
}

// ---------- Menus ----------

export interface MenuItem {
  label: string;
  onClick?: () => void;
  checked?: boolean;
  danger?: boolean;
  disabled?: boolean;
  /** A heading row (not clickable). */
  heading?: boolean;
  separator?: boolean;
}

/** A small menu at a screen point (right-click) that closes on any outside click or Escape. */
export function PopMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: Math.min(x, window.innerWidth - r.width - 8), y: Math.min(y, window.innerHeight - r.height - 8) });
  }, [x, y]);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', key);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', key);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);
  return (
    <div ref={ref} className="pop-menu" style={{ left: pos.x, top: pos.y }} role="menu">
      {items.map((it, i) =>
        it.separator ? (
          <div key={i} className="pop-sep" />
        ) : it.heading ? (
          <div key={i} className="pop-head">
            {it.label}
          </div>
        ) : (
          <button
            key={i}
            role="menuitem"
            disabled={it.disabled}
            className={it.danger ? 'danger' : undefined}
            onClick={() => {
              onClose();
              it.onClick?.();
            }}
          >
            <span style={{ width: 14, display: 'inline-block' }}>{it.checked ? '✓' : ''}</span>
            {it.label}
          </button>
        ),
      )}
    </div>
  );
}

// ---------- Ask for a line of text (Electron has no window.prompt) ----------

export function TextPrompt({
  title,
  initial = '',
  placeholder,
  okLabel = 'Save',
  onDone,
}: {
  title: string;
  initial?: string;
  placeholder?: string;
  okLabel?: string;
  onDone: (value: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <Modal onClose={() => onDone(null)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onDone(value);
        }}
        style={{ display: 'grid', gap: 14, width: 380 }}
      >
        <div style={{ fontWeight: 800, fontSize: 16 }}>{title}</div>
        <input autoFocus value={value} placeholder={placeholder} onChange={(e) => setValue(e.target.value)} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={() => onDone(null)}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            {okLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function Confirm({ title, body, okLabel, danger, onDone }: { title: string; body: ReactNode; okLabel: string; danger?: boolean; onDone: (ok: boolean) => void }) {
  return (
    <Modal onClose={() => onDone(false)}>
      <div style={{ display: 'grid', gap: 14, width: 400 }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>{title}</div>
        <div className="muted">{body}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={() => onDone(false)}>
            Cancel
          </button>
          <button className="btn primary" style={danger ? { background: 'var(--red)', boxShadow: 'none' } : undefined} onClick={() => onDone(true)} autoFocus>
            {okLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function Modal({ children, onClose, wide }: { children: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card enter" style={{ padding: 22, maxWidth: wide ? 640 : 460, width: wide ? '92%' : undefined }}>
        {children}
      </div>
    </div>
  );
}

/** "today", "yesterday", "3 days ago", "2 weeks ago", else a date. */
export function ago(ms: number): string {
  const days = Math.floor((Date.now() - ms) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
