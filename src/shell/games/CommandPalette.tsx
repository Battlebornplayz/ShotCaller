import { useEffect, useMemo, useState } from 'react';
import type { LibraryGame } from '../../../shared/types';
import { useLibrary } from '../../hooks/useLive';
import type { SectionId } from '../SectionNav';
import { play, StoreBadge, mainSource } from './common';

interface Item {
  id: string;
  label: string;
  hint: string;
  game?: LibraryGame;
  run: () => void;
}

/** Pages and settings Ctrl+K can jump to. */
const PLACES: { label: string; section: SectionId; words: string }[] = [
  { label: 'Home', section: 'home', words: 'home start continue' },
  { label: 'Games', section: 'games', words: 'games library launcher stores' },
  { label: 'Timeline', section: 'timeline', words: 'timeline unlocks history' },
  { label: 'Profile', section: 'profile', words: 'profile account xp' },
  { label: 'Friends', section: 'friends', words: 'friends social' },
  { label: 'Settings', section: 'settings', words: 'settings options preferences' },
  { label: 'Settings › Game stores', section: 'settings', words: 'stores steam epic xbox folder steamgriddb art key' },
  { label: 'Settings › Overlay', section: 'settings', words: 'overlay corner monitor opacity' },
  { label: 'Settings › Hotkeys', section: 'settings', words: 'hotkeys shortcuts keys' },
  { label: 'Settings › Unlock popups', section: 'settings', words: 'popups sound unlock corner' },
  { label: 'Settings › Startup', section: 'settings', words: 'startup windows tray launch' },
  { label: 'Settings › Updates', section: 'settings', words: 'updates beta stable channel version' },
];

/** Ctrl+K anywhere in the app: find a game (Enter plays it, Shift+Enter opens its page), a page or a setting. */
export function CommandPalette({ onOpenGame, onSection }: { onOpenGame: (key: string) => void; onSection: (s: SectionId) => void }) {
  const library = useLibrary();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
        setQ('');
        setSel(0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const items = useMemo<Item[]>(() => {
    const t = q.trim().toLowerCase();
    const games = (library?.games ?? [])
      .filter((g) => !g.hidden && (!t || g.name.toLowerCase().includes(t)))
      .sort((a, b) => {
        const sa = a.name.toLowerCase().startsWith(t) ? 0 : 1;
        const sb = b.name.toLowerCase().startsWith(t) ? 0 : 1;
        return sa - sb || Number(b.installed) - Number(a.installed) || (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0);
      })
      .slice(0, t ? 8 : 5)
      .map<Item>((g) => ({
        id: g.key,
        label: g.name,
        hint: g.installed ? 'Enter to play · Shift+Enter for its page' : 'Open its page',
        game: g,
        run: () => (g.installed ? void play(g) : onOpenGame(g.key)),
      }));
    const places = PLACES.filter((p) => !t || p.label.toLowerCase().includes(t) || p.words.includes(t))
      .slice(0, 6)
      .map<Item>((p) => ({ id: p.label, label: p.label, hint: 'Go to', run: () => onSection(p.section) }));
    return [...games, ...places];
  }, [library, q, onOpenGame, onSection]);

  if (!open) return null;
  const close = () => setOpen(false);
  const pick = (it: Item | undefined, page = false) => {
    if (!it) return;
    close();
    if (page && it.game) onOpenGame(it.game.key);
    else it.run();
  };

  return (
    <div className="palette" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="card palette-box enter">
        <input
          autoFocus
          placeholder="Find a game, page or setting"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close();
            else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSel((s) => Math.min(items.length - 1, s + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSel((s) => Math.max(0, s - 1));
            } else if (e.key === 'Enter') pick(items[sel], e.shiftKey);
          }}
        />
        <div style={{ display: 'grid', gap: 2, marginTop: 8, maxHeight: '50vh', overflowY: 'auto' }}>
          {items.map((it, i) => (
            <button key={it.id} className={`palette-item${i === sel ? ' active' : ''}`} onMouseEnter={() => setSel(i)} onClick={(e) => pick(it, e.shiftKey)}>
              {it.game ? <StoreBadge source={mainSource(it.game)} size={20} /> : <span className="games-glyph">↪</span>}
              <span style={{ flex: 1, fontWeight: 600 }}>{it.label}</span>
              <span className="muted" style={{ fontSize: 11 }}>
                {i === sel ? it.hint : ''}
              </span>
            </button>
          ))}
          {items.length === 0 && <div className="muted" style={{ padding: 10 }}>Nothing found.</div>}
        </div>
      </div>
    </div>
  );
}
