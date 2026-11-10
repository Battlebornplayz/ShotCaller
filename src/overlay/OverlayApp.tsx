import { useEffect, useLayoutEffect, useRef } from 'react';
import { games, moduleById } from '../../games';
import { overlayPanels } from '../../games/panels';
import { Logo } from '../components/Logo';
import { TitleBar } from '../components/TitleBar';
import { useOverlayState, useSettings } from '../hooks/useLive';

const params = new URLSearchParams(window.location.search);
const kind = params.get('mode') === 'monitor' ? 'monitor' : 'corner';
if (params.get('window') === 'overlay' && kind === 'corner') document.documentElement.classList.add('overlay-corner');

/**
 * The overlay window. Corner kind: a floating, see-through card (click-through until Alt is held,
 * dragged by its header). Monitor kind: the same panels in an ordinary window.
 */
export function OverlayApp() {
  const state = useOverlayState();
  const settings = useSettings();
  const rootRef = useRef<HTMLDivElement>(null);

  // A preview with nothing running shows the first module so there's something to look at.
  const mod = state?.game ? moduleById(state.game.moduleId) : games[0];
  const title = state?.game?.name ?? `${mod.name} (preview)`;
  const interactive = state?.interactive ?? false;
  // Fortnite's card has its own opacity (60% by default) and size, set in its hub's Options.
  const isFortnite = mod.id === 'fortnite';
  const idle = isFortnite ? (settings?.fortnite.cardOpacity ?? 0.6) : (state?.idleOpacity ?? 0.7);
  const opacity = kind === 'monitor' || interactive ? 1 : idle;
  const scale = isFortnite && kind === 'corner' ? (settings?.fortnite.cardScale ?? 1) : 1;

  // Keep the corner window exactly as big as the card.
  useLayoutEffect(() => {
    if (kind !== 'corner' || !rootRef.current) return;
    const el = rootRef.current;
    const report = () => {
      const r = el.getBoundingClientRect();
      window.shotcaller.reportOverlaySize(Math.ceil(r.width), Math.ceil(r.height));
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    document.title = 'ShotCaller overlay';
  }, []);

  const panels = mod.overlayPanels.map((p) => ({ def: p, Component: overlayPanels[`${mod.id}/${p.id}`] }));

  const body = (
    <div style={{ padding: 14, display: 'grid', gap: 14 }}>
      {panels.map(({ def, Component }) =>
        Component ? (
          <Component key={def.id} game={state?.game ?? null} hotkeys={settings?.hotkeys ?? null} wide={kind === 'monitor'} />
        ) : (
          <div key={def.id} className="muted">
            {def.title}
          </div>
        ),
      )}
    </div>
  );

  if (kind === 'monitor') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <TitleBar
          canMaximize={false}
          title={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Logo size={18} /> {title}
            </span>
          }
        />
        <div className="enter" style={{ flex: 1, overflowY: 'auto' }}>
          {body}
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} style={{ width: mod.id === 'skillshot-city' ? 360 : isFortnite ? 230 : 300, padding: 8, zoom: scale }}>
      <div className={`overlay-panel enter${interactive ? ' interactive' : ''}`} style={{ opacity }}>
        <div
          className={interactive ? 'drag-region' : undefined}
          title={interactive ? 'Drag to move' : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '9px 12px',
            borderBottom: '1px solid var(--border)',
            cursor: interactive ? 'grab' : 'default',
          }}
        >
          <Logo size={20} />
          <span style={{ fontWeight: 700, fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </span>
          {interactive ? (
            <button
              className="no-drag"
              onClick={() => void window.shotcaller.openMainWindow()}
              style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', padding: '2px 6px', borderRadius: 6 }}
            >
              Open app
            </button>
          ) : (
            <span className="muted" style={{ fontSize: 11 }}>
              {state?.altHook === false ? '' : 'Hold Alt'}
            </span>
          )}
        </div>
        {body}
      </div>
    </div>
  );
}
