import { useEffect, useRef, useState, type ComponentType } from 'react';
import type { HotkeyAction, RunningGame, Settings } from '../shared/types';
import { SkillshotPanel } from './skillshot-city/overlay';

/**
 * Renderer-side registry of overlay panels, keyed "<moduleId>/<panelId>" to match the
 * `overlayPanels` in each module's manifest. Kept apart from the manifests so the main process
 * never imports React.
 */

export interface PanelProps {
  game: RunningGame | null;
  hotkeys: Settings['hotkeys'] | null;
  /** Second-monitor window: room for the richer layout. */
  wide: boolean;
}

/** Runs `fn` for every hotkey action sent to the overlay. */
export function useOverlayActions(fn: (action: HotkeyAction) => void): void {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => window.shotcaller.onOverlayAction((e) => ref.current(e.action)), []);
}

function Keycap({ accel }: { accel: string | undefined }) {
  if (!accel) return <span className="muted">unbound</span>;
  return (
    <span style={{ fontWeight: 700, fontSize: 11, padding: '1px 6px', borderRadius: 5, background: 'rgba(255,255,255,0.08)', color: 'var(--text)' }}>
      {accel}
    </span>
  );
}

function HuntListPlaceholder() {
  return (
    <div className="toast" style={{ marginTop: 10, padding: 10, borderRadius: 10, background: 'rgba(245,196,81,0.08)' }}>
      <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--gold)' }}>Hunt list</div>
      <div className="muted" style={{ fontSize: 12 }}>
        Pinned achievements show here from Phase 6.
      </div>
    </div>
  );
}

/** Skillshot City: live advice, round strip, build and synergies (games/skillshot-city/overlay.tsx). */
function SkillshotRoundPanel({ hotkeys, wide }: PanelProps) {
  return <SkillshotPanel hotkeys={hotkeys} wide={wide} />;
}

function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/** Any game: session timer and the hunt list placeholder. */
function GenericSessionPanel({ game, hotkeys }: PanelProps) {
  const [now, setNow] = useState(() => Date.now());
  const [hunt, setHunt] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useOverlayActions((action) => {
    if (action === 'huntList') setHunt((h) => !h);
  });
  return (
    <div>
      <div className="section-label">This session</div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 2 }}>{game ? formatDuration(now - game.since) : '0:00'}</div>
      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        Achievement progress for this game arrives in Phase 5.
      </div>
      {hunt && <HuntListPlaceholder />}
      <div className="muted" style={{ fontSize: 11, marginTop: 10 }}>
        <Keycap accel={hotkeys?.huntList} /> hunt list
      </div>
    </div>
  );
}

export const overlayPanels: Record<string, ComponentType<PanelProps>> = {
  'skillshot-city/round': SkillshotRoundPanel,
  'generic/session': GenericSessionPanel,
};
