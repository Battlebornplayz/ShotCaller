import { useEffect, useRef, useState, type ComponentType } from 'react';
import type { HotkeyAction, RunningGame, Settings } from '../shared/types';

/**
 * Renderer-side registry of overlay panels, keyed "<moduleId>/<panelId>" to match the
 * `overlayPanels` in each module's manifest. Kept apart from the manifests so the main process
 * never imports React.
 */

export interface PanelProps {
  game: RunningGame | null;
  hotkeys: Settings['hotkeys'] | null;
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

function useToast(): [string | null, (msg: string) => void] {
  const [toast, setToast] = useState<{ msg: string; id: number } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);
  return [toast?.msg ?? null, (msg) => setToast({ msg, id: Date.now() })];
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

/** Skillshot City placeholder: round tracker and picks, driven by the hotkeys. The real advisor comes in Phase 8. */
function SkillshotRoundPanel({ hotkeys }: PanelProps) {
  const [round, setRound] = useState(1);
  const [picks, setPicks] = useState<string[]>([]);
  const [hunt, setHunt] = useState(false);
  const [toast, showToast] = useToast();

  useOverlayActions((action) => {
    if (action === 'pick1' || action === 'pick2') {
      const label = action === 'pick1' ? 'Left skill' : 'Right skill';
      setPicks((p) => [...p, label].slice(-6));
      showToast(`Picked: ${label}`);
    } else if (action === 'nextRound') {
      showToast(round >= 3 ? 'Already on the final round' : `Round ${round + 1} of 3`);
      setRound(Math.min(3, round + 1));
    } else if (action === 'endMatch') {
      setRound(1);
      setPicks([]);
      showToast('Match ended. Recaps arrive in Phase 8');
    } else if (action === 'huntList') {
      setHunt((h) => !h);
    }
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="section-label">Round</div>
        <span className="pill muted" style={{ fontSize: 11 }}>
          Placeholder
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
        <span style={{ fontSize: 30, fontWeight: 800 }}>{round}</span>
        <span className="muted" style={{ fontWeight: 600 }}>
          / 3
        </span>
        <div style={{ display: 'flex', gap: 5, marginLeft: 'auto', alignSelf: 'center' }}>
          {[1, 2, 3].map((r) => (
            <span
              key={r}
              style={{
                width: 26,
                height: 6,
                borderRadius: 6,
                background: r <= round ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
                transition: 'background 0.25s',
              }}
            />
          ))}
        </div>
      </div>

      <div className="section-label" style={{ marginTop: 12 }}>
        Build
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, minHeight: 24 }}>
        {picks.length === 0 ? (
          <span className="muted" style={{ fontSize: 12 }}>
            No skills picked yet
          </span>
        ) : (
          picks.map((p, i) => (
            <span key={i} className="pill toast" style={{ fontSize: 11 }}>
              {p}
            </span>
          ))
        )}
      </div>

      {hunt && <HuntListPlaceholder />}

      {toast && (
        <div className="toast pill green" style={{ marginTop: 10, fontSize: 12 }}>
          {toast}
        </div>
      )}

      <div className="muted" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 10px', marginTop: 12, fontSize: 11 }}>
        <span>
          <Keycap accel={hotkeys?.pick1} /> <Keycap accel={hotkeys?.pick2} /> pick
        </span>
        <span>
          <Keycap accel={hotkeys?.nextRound} /> next round
        </span>
        <span>
          <Keycap accel={hotkeys?.endMatch} /> end match
        </span>
        <span>
          <Keycap accel={hotkeys?.huntList} /> hunt list
        </span>
      </div>
    </div>
  );
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
