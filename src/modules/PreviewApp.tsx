import { useEffect, useRef, useState } from 'react';
import type { ModulePreviewPayload } from '../../shared/modules';
import { ModuleIcon, ModuleView, liveModules, moduleRunning, useModules } from './ModuleView';
import { useDetection } from '../hooks/useLive';

/**
 * The unseen preview window (Phase M1): draws one module for the AI and reports the page text, any errors and how
 * long it took, so ShotCaller can take a picture.
 */
export function ModulePreviewApp() {
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const [p, setP] = useState<ModulePreviewPayload | null>(null);
  const errors = useRef<string[]>([]);
  const started = useRef(0);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onErr = (e: ErrorEvent) => errors.current.push(String(e.message));
    window.addEventListener('error', onErr);
    void window.shotcaller.getModulePreview(token).then((x) => {
      started.current = performance.now();
      setP(x);
    });
    return () => window.removeEventListener('error', onErr);
  }, [token]);

  useEffect(() => {
    if (!p) return;
    // Let pictures load and timers settle, then report.
    let cancelled = false;
    const ms = Math.round(performance.now() - started.current);
    const waitImages = () =>
      Promise.all(
        [...document.images].map((img) =>
          img.complete ? Promise.resolve() : new Promise((r) => ((img.onload = r), (img.onerror = r), setTimeout(r, 3000)))),
      );
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        void waitImages().then(() => {
          if (cancelled) return;
          const missing = [...document.querySelectorAll('.tile.muted')].map((el) => el.textContent ?? '').filter((t) => t.startsWith('Picture missing'));
          window.shotcaller.modulePreviewDone(token, {
            text: root.current?.innerText ?? '',
            errors: [...errors.current, ...missing],
            ms,
            height: (root.current?.scrollHeight ?? 0) + 40,
          });
        }),
      ),
    );
    return () => {
      cancelled = true;
    };
  }, [p, token]);

  if (!p) return null;
  return (
    <div ref={root} style={{ padding: p.as === 'home' ? 12 : 20 }}>
      {p.as === 'home' ? (
        <div className="card" style={{ ['--tier' as string]: p.doc.color, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <ModuleIcon doc={p.doc} size={28} />
            <div style={{ fontWeight: 800 }}>{p.doc.name}</div>
          </div>
          <ModuleView id={p.moduleId} doc={p.doc} as="home" preview={{ storage: p.storage, running: p.pretendRunning, onError: (e) => errors.current.push(e) }} />
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 }}>
            <ModuleIcon doc={p.doc} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{p.doc.name}</div>
              {p.doc.description && <div className="muted" style={{ fontSize: 13 }}>{p.doc.description}</div>}
            </div>
            {p.pretendRunning && <span className="pill green" style={{ marginLeft: 'auto' }}>Pretending the game runs</span>}
          </div>
          <ModuleView id={p.moduleId} doc={p.doc} as={p.as} preview={{ storage: p.storage, running: p.pretendRunning, page: p.page, onError: (e) => errors.current.push(e) }} />
        </>
      )}
    </div>
  );
}

/** The second-monitor window (M-Q10): modules placed there whose game is running. */
export function ModuleMonitorApp() {
  const state = useModules();
  const detection = useDetection();
  const shown = liveModules(state).filter((m) => m.doc.places.includes('monitor') && moduleRunning(m.doc, detection));
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="titlebar-drag" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--border)', WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div style={{ fontWeight: 800 }}>ShotCaller modules</div>
        <button className="btn small" style={{ marginLeft: 'auto', WebkitAppRegion: 'no-drag' } as React.CSSProperties} onClick={() => window.close()}>
          Close
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'grid', gap: 14, alignContent: 'start' }}>
        {shown.map((m) => (
          <section key={m.doc.id} className="card" style={{ ['--tier' as string]: m.doc.color }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
              <ModuleIcon doc={m.doc} size={26} />
              <div style={{ fontWeight: 800 }}>{m.doc.name}</div>
            </div>
            <ModuleView id={m.doc.id} doc={m.doc} as="monitor" />
          </section>
        ))}
        {!shown.length && <div className="muted">Nothing to show right now.</div>}
      </div>
    </div>
  );
}
