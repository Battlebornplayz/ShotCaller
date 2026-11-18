import { Component, useEffect, useMemo, useState, type ReactNode } from 'react';
import { allBlocks, findBlock, optionValues, type ModuleDoc, type ModulesState, type StoredModule } from '../../shared/modules';
import type { DetectionState } from '../../shared/types';
import { useDetection } from '../hooks/useLive';
import { assetUrl, BlockList, BlockView, ModContext, type ModCtx } from './blocks';
import './modules.css';

/** Live AI modules state. */
export function useModules(): ModulesState | null {
  const [s, set] = useState<ModulesState | null>(null);
  useEffect(() => {
    let live = true;
    void window.shotcaller.getModules().then((v) => live && set(v));
    const off = window.shotcaller.onModules((v) => live && set(v));
    return () => {
      live = false;
      off();
    };
  }, []);
  return s;
}

export function useModuleStorage(id: string): Record<string, unknown> | null {
  const [s, set] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    let live = true;
    void window.shotcaller.getModuleStorage(id).then((v) => live && set(v));
    const off = window.shotcaller.onModuleStorage((c) => live && c.id === id && set(c.storage));
    return () => {
      live = false;
      off();
    };
  }, [id]);
  return s;
}

export function moduleRunning(doc: ModuleDoc, detection: DetectionState | null): boolean {
  return !!detection?.running.some((r) => (doc.game?.key && r.key === doc.game.key) || (doc.addOnFor && r.moduleId === doc.addOnFor));
}

/** Modules that show now: on, not in safe mode, not broken. */
export function liveModules(s: ModulesState | null): StoredModule[] {
  if (!s || s.safeMode) return [];
  return s.modules.filter((m) => m.enabled && !m.broken);
}

export function ModuleIcon({ doc, size = 36 }: { doc: ModuleDoc; size?: number }) {
  const isFile = /\.(png|jpe?g|webp|gif|svg)$/i.test(doc.icon);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        flex: 'none',
        display: 'grid',
        placeItems: 'center',
        overflow: 'hidden',
        background: `color-mix(in srgb, ${doc.color} 30%, #1a1c3a)`,
        border: `1px solid color-mix(in srgb, ${doc.color} 50%, transparent)`,
        fontWeight: 800,
        fontSize: size * 0.4,
      }}
    >
      {isFile ? <img src={assetUrl(doc.id, doc.icon)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : doc.icon.slice(0, 2)}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The error guard: a module that fails to draw is turned off (M-Q18)

class Guard extends Component<{ id: string; preview: boolean; onError?: (e: string) => void; children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  componentDidCatch(e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (this.props.onError) this.props.onError(msg);
    else if (!this.props.preview) window.shotcaller.reportModuleError(this.props.id, msg);
  }
  render() {
    if (this.state.error)
      return (
        <div className="tile" style={{ padding: 12, color: 'var(--red)', fontSize: 13 }}>
          This module couldn’t be drawn: {this.state.error}
        </div>
      );
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------------------------
// Options page (M-Q30): drawn from the module's option list

function OptionsPanel() {
  return (
    <ModContext.Consumer>
      {(ctx) =>
        ctx && (
          <div className="mod-block" style={{ ['--tier' as string]: ctx.doc.color, display: 'grid', gap: 12 }}>
            {ctx.doc.options.map((o) => {
              const v = ctx.options[o.key];
              const set = (val: unknown) => ctx.set('_options', { ...((ctx.storage._options as Record<string, unknown>) ?? {}), [o.key]: val });
              return (
                <div key={o.key} className="row" style={{ gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{o.label || o.key}</div>
                    {o.description && <div className="muted" style={{ fontSize: 12 }}>{o.description}</div>}
                  </div>
                  <div style={{ flex: 'none', marginLeft: 'auto' }}>
                    {o.type === 'switch' ? (
                      <button role="switch" aria-checked={!!v} aria-label={o.label} className="toggle" onClick={() => set(!v)} />
                    ) : o.type === 'choice' ? (
                      <select value={String(v ?? '')} onChange={(e) => set(e.target.value)}>
                        {(o.choices ?? []).map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    ) : o.type === 'number' ? (
                      <input type="number" value={Number(v ?? 0)} onChange={(e) => set(Number(e.target.value))} style={{ width: 100 }} />
                    ) : (
                      <input value={String(v ?? '')} onChange={(e) => set(e.target.value)} style={{ width: 200 }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      }
    </ModContext.Consumer>
  );
}

// ---------------------------------------------------------------------------------------------
// Guided tour of a new module (G3)

function Tour({ ctx }: { ctx: ModCtx }) {
  const steps = (ctx.doc.tour ?? []).filter((t) => findBlock(ctx.doc, t.block));
  const [i, setI] = useState(0);
  const done = ctx.storage._tourDone === true;
  useEffect(() => {
    if (done || ctx.preview) return;
    const el = document.querySelector(`[data-block="${CSS.escape(steps[i]?.block ?? '')}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.animate([{ outline: '2px solid var(--tier)' }, { outline: '2px solid transparent' }], { duration: 1600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, done, ctx.preview, steps[i]?.block]);
  if (done || !steps.length) return null;
  const step = steps[i];
  return (
    <div className="tile" style={{ padding: '10px 14px', marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center', borderColor: ctx.doc.color }}>
      <span className="pill">
        Tour {i + 1}/{steps.length}
      </span>
      <div style={{ flex: 1, fontSize: 13 }}>{step.text}</div>
      {i + 1 < steps.length ? (
        <button className="btn small primary" onClick={() => setI(i + 1)}>
          Next
        </button>
      ) : (
        <button className="btn small primary" onClick={() => ctx.set('_tourDone', true)}>
          Got it
        </button>
      )}
      <button className="btn small" onClick={() => ctx.set('_tourDone', true)}>
        Skip
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The module itself

export interface ModuleViewProps {
  id: string;
  doc: ModuleDoc;
  /** Where it's drawn: its page, a Home card, or the second-monitor window. */
  as?: 'page' | 'home' | 'monitor';
  /** Preview / side-by-side review: given storage, nothing saved. */
  preview?: { storage: Record<string, unknown>; running: boolean; page?: string | null; onError?: (e: string) => void };
}

export function ModuleView({ id, doc, as = 'page', preview }: ModuleViewProps) {
  const liveStorage = useModuleStorage(id);
  const detection = useDetection();
  const [local, setLocal] = useState<Record<string, unknown>>(preview?.storage ?? {});
  const storage = preview ? local : (liveStorage ?? {});
  const running = preview ? preview.running : moduleRunning(doc, detection);
  const options = useMemo(() => optionValues(doc, storage._options as Record<string, unknown> | undefined), [doc, storage._options]);
  const ctx: ModCtx = {
    id,
    doc,
    storage,
    running,
    options,
    preview: !!preview,
    set: (key, value) => {
      if (preview) setLocal((s) => ({ ...s, [key]: value }));
      else void window.shotcaller.setModuleStorage(id, key, value);
    },
  };
  const pages = doc.pages;
  const [pageId, setPageId] = useState<string>(preview?.page ?? pages[0]?.id ?? '');
  const page = pageId === '_options' ? null : (pages.find((p) => p.id === pageId) ?? pages[0]);

  if (!preview && liveStorage === null) return <div className="muted" style={{ fontSize: 13 }}>Loading…</div>;

  let body: ReactNode;
  if (as === 'home') {
    const ids = doc.homeBlocks?.length ? doc.homeBlocks : (pages[0]?.blocks ?? []).slice(0, 2).map((b) => b.id);
    const blocks = ids.map((x) => allBlocks(doc).find((y) => y.block.id === x)?.block).filter(Boolean) as ModuleDoc['pages'][number]['blocks'];
    body = <BlockList blocks={blocks.map((b) => ({ ...b, width: 'full' }))} />;
  } else {
    body = (
      <>
        {(pages.length > 1 || doc.options.length > 0) && (
          <div className="mod-tabs" style={{ ['--tier' as string]: doc.color }}>
            {pages.map((p) => (
              <button key={p.id} className={page?.id === p.id ? 'active' : ''} onClick={() => setPageId(p.id)}>
                {p.title || p.id}
              </button>
            ))}
            {doc.options.length > 0 && (
              <button className={pageId === '_options' ? 'active' : ''} onClick={() => setPageId('_options')} style={{ marginLeft: 'auto' }}>
                Options
              </button>
            )}
          </div>
        )}
        {as === 'page' && <Tour ctx={ctx} />}
        {pageId === '_options' ? <OptionsPanel /> : page ? <BlockList blocks={page.blocks} /> : <div className="muted">This module has no pages.</div>}
      </>
    );
  }
  return (
    <ModContext.Provider value={ctx}>
      <div style={{ ['--tier' as string]: doc.color }}>
        <Guard id={id} preview={!!preview} onError={preview?.onError}>
          {body}
        </Guard>
      </div>
    </ModContext.Provider>
  );
}

/** One block drawn on its own (the side-by-side review). */
export function SingleBlock({ id, doc, blockId }: { id: string; doc: ModuleDoc; blockId: string }) {
  const block = findBlock(doc, blockId);
  const ctx: ModCtx = { id, doc, storage: {}, running: false, options: optionValues(doc, undefined), preview: true, set: () => undefined };
  if (!block) return <div className="muted" style={{ fontSize: 12 }}>—</div>;
  return (
    <ModContext.Provider value={ctx}>
      <Guard id={id} preview>
        <div className="mod-grid">
          <BlockView b={{ ...block, width: 'full' }} />
        </div>
      </Guard>
    </ModContext.Provider>
  );
}
