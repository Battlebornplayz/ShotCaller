import { createContext, Fragment, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { blockVisible, type Block, type ModuleDoc } from '../../shared/modules';
import type { GameAchievements } from '../../shared/types';
import { useLibrary } from '../hooks/useLive';

/**
 * The building-block kit for AI modules (Phase M1): every block type drawn in ShotCaller's look. Blocks read the
 * module's data and keep the player's own things (ticks, notes, journal...) in the module's storage under
 * "b:<block id>".
 */

export interface ModCtx {
  id: string;
  doc: ModuleDoc;
  storage: Record<string, unknown>;
  set(key: string, value: unknown): void;
  running: boolean;
  options: Record<string, unknown>;
  /** In the AI's preview: nothing is saved. */
  preview: boolean;
}

export const ModContext = createContext<ModCtx | null>(null);
export const useMod = () => useContext(ModContext)!;

export function assetUrl(moduleId: string, src: string): string {
  if (/^https:\/\//i.test(src)) return src;
  return `scmod://asset/${encodeURIComponent(moduleId)}/${encodeURIComponent(src)}`;
}

function useBlockStore<T>(id: string, initial: T): [T, (v: T) => void] {
  const ctx = useMod();
  const key = `b:${id}`;
  const value = (ctx.storage[key] as T | undefined) ?? initial;
  return [value, (v: T) => ctx.set(key, v)];
}

const openLink = (url: string) => {
  if (/^https:\/\//i.test(url)) void window.shotcaller.openExternal(url);
};

const PALETTE = ['#4f8cff', '#3ddc97', '#f5c451', '#b07cff', '#ff9f5a', '#5ad1ff', '#ff6bb5', '#9aa3ff'];

// ---------------------------------------------------------------------------------------------
// Words: **bold**, "- " bullets, blank lines between paragraphs

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
  );
}

export function RichText({ text }: { text: string }) {
  const paras = String(text ?? '').split(/\n{2,}/);
  return (
    <div className="mod-text">
      {paras.map((p, i) => {
        const lines = p.split('\n');
        if (lines.every((l) => /^\s*[-•]\s+/.test(l)))
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*[-•]\s+/, ''))}</li>
              ))}
            </ul>
          );
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The frame every block sits in

function Frame({ b, children, bare }: { b: Block; children: ReactNode; bare?: boolean }) {
  const ctx = useMod();
  return (
    <section
      className={`mod-block${bare ? ' bare' : ''}${b.width === 'half' ? ' half' : ''}`}
      data-block={b.id}
      style={{ ['--tier' as string]: b.color ?? ctx.doc.color }}
    >
      {(b.title || b.help) && (
        <div className="mod-block-head">
          {b.title && <div className="mod-block-title">{b.title}</div>}
          {b.help && (
            <span className="mod-help" title={b.help} aria-label={b.help}>
              ?
            </span>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

export function BlockList({ blocks }: { blocks: Block[] }) {
  const ctx = useMod();
  const shown = (Array.isArray(blocks) ? blocks : []).filter((b) => b && blockVisible(b, ctx.running, ctx.options));
  return (
    <div className="mod-grid">
      {shown.map((b) => (
        <BlockView key={b.id} b={b} />
      ))}
    </div>
  );
}

export function BlockView({ b }: { b: Block }) {
  switch (b.type) {
    case 'heading':
      return (
        <Frame b={{ ...b, title: undefined }} bare>
          <h3 className="mod-heading">{b.text}</h3>
        </Frame>
      );
    case 'text':
      return (
        <Frame b={b}>
          <RichText text={b.text} />
        </Frame>
      );
    case 'image':
      return (
        <Frame b={b}>
          <Img src={b.src} alt={b.caption ?? b.title ?? ''} style={{ width: '100%', borderRadius: 10 }} />
          {b.caption && <div className="muted mod-caption">{b.caption}</div>}
        </Frame>
      );
    case 'cards':
      return (
        <Frame b={b}>
          <div className="mod-cards">
            {(b.items ?? []).map((c, i) => (
              <div key={i} className="mod-card">
                {c.image && <Img src={c.image} alt="" style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: 8 }} />}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ fontWeight: 700 }}>{c.title}</div>
                  {c.tag && <span className="pill" style={{ marginLeft: 'auto' }}>{c.tag}</span>}
                </div>
                {c.text && <RichText text={c.text} />}
              </div>
            ))}
          </div>
        </Frame>
      );
    case 'list':
      return <ListBlock b={b} />;
    case 'table':
      return <TableBlock b={b} />;
    case 'search':
      return <SearchBlock b={b} />;
    case 'timer':
      return <TimerBlock b={b} />;
    case 'chart':
      return <ChartBlock b={b} />;
    case 'checklist':
      return <ChecklistBlock b={b} />;
    case 'links':
      return (
        <Frame b={b}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(b.links ?? []).map((l, i) => (
              <button key={i} className="btn small" onClick={() => openLink(l.url)} title={l.url}>
                {l.label} ↗
              </button>
            ))}
          </div>
        </Frame>
      );
    case 'notes':
      return <NotesBlock b={b} />;
    case 'tierlist':
      return (
        <Frame b={b}>
          <div style={{ display: 'grid', gap: 6 }}>
            {(b.tiers ?? []).map((t, i) => (
              <div key={i} className="mod-tier">
                <div className="mod-tier-label" style={{ background: t.color ?? PALETTE[i % PALETTE.length] }}>
                  {t.label}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '6px 8px', alignItems: 'center' }}>
                  {(t.items ?? []).length ? t.items.map((x, j) => <span key={j} className="pill muted">{x}</span>) : <span className="muted" style={{ fontSize: 12 }}>—</span>}
                </div>
              </div>
            ))}
          </div>
        </Frame>
      );
    case 'tabs':
      return <TabsBlock b={b} />;
    case 'progress':
      return <ProgressBlock b={b} />;
    case 'build':
      return <BuildBlock b={b} />;
    case 'gallery':
      return <GalleryBlock b={b} />;
    case 'map':
      return <MapBlock b={b} />;
    case 'calendar':
      return <CalendarBlock b={b} />;
    case 'countdown':
      return <CountdownBlock b={b} />;
    case 'flashcards':
      return <FlashcardsBlock b={b} />;
    case 'compare':
      return (
        <Frame b={b}>
          <div className="mod-table-wrap">
            <table className="mod-table">
              <thead>
                <tr>
                  <th />
                  {(b.columns ?? []).map((c, i) => (
                    <th key={i}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(b.rows ?? []).map((r, i) => (
                  <tr key={i}>
                    <th style={{ textAlign: 'left' }}>{r.label}</th>
                    {(b.columns ?? []).map((_, j) => (
                      <td key={j}>{r.values?.[j] ?? '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Frame>
      );
    case 'wheel':
      return <WheelBlock b={b} />;
    case 'counter':
      return <CounterBlock b={b} />;
    case 'video':
      return <VideoBlock b={b} />;
    case 'journal':
      return <JournalBlock b={b} />;
    case 'bests':
      return <BestsBlock b={b} />;
    case 'goals':
      return <GoalsBlock b={b} />;
    case 'backlog':
      return <BacklogBlock b={b} />;
    case 'achievements':
      return <AchievementsBlock b={b} />;
    case 'sessions':
      return <SessionsBlock b={b} />;
    default:
      throw new Error(`Unknown block type "${(b as { type?: string }).type}" in block "${(b as { id?: string }).id}".`);
  }
}

type B<T extends Block['type']> = Extract<Block, { type: T }>;

function Img({ src, alt, style }: { src: string; alt: string; style?: React.CSSProperties }) {
  const ctx = useMod();
  const [bad, setBad] = useState(false);
  if (!src) return null;
  if (bad)
    return (
      <div className="tile muted" style={{ ...style, display: 'grid', placeItems: 'center', minHeight: 60, fontSize: 12 }}>
        Picture missing: {src}
      </div>
    );
  return <img src={assetUrl(ctx.id, src)} alt={alt} style={style} onError={() => setBad(true)} draggable={false} />;
}

/** A data set as a list of objects, or strings. */
function useData(name: string | undefined): unknown[] {
  const ctx = useMod();
  const d = name ? ctx.doc.data[name] : undefined;
  return Array.isArray(d) ? d : [];
}

const cell = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

// ---------------------------------------------------------------------------------------------
// Lists, tables, search

function ListBlock({ b }: { b: B<'list'> }) {
  const data = useData(b.data);
  const items = (b.items ?? data).map((x) => (typeof x === 'string' ? x : isObj(x) ? cell(Object.values(x)[0]) : cell(x)));
  const Tag = b.numbered ? 'ol' : 'ul';
  return (
    <Frame b={b}>
      <Tag className="mod-list">
        {items.map((x, i) => (
          <li key={i}>{inline(x)}</li>
        ))}
      </Tag>
    </Frame>
  );
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function TableBlock({ b }: { b: B<'table'> }) {
  const data = useData(b.data);
  const columns = b.data ? (b.columns ?? [...new Set(data.flatMap((r) => (isObj(r) ? Object.keys(r) : [])))]) : (b.columns ?? []);
  const rows: string[][] = b.data ? data.map((r) => columns.map((c) => cell(isObj(r) ? r[c] : ''))) : (b.rows ?? []).map((r) => r.map(cell));
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const [filter, setFilter] = useState('');
  const [limit, setLimit] = useState(100);
  const fi = b.filter ? columns.indexOf(b.filter) : -1;
  const filterValues = fi >= 0 ? [...new Set(rows.map((r) => r[fi]).filter(Boolean))].sort() : [];
  const shown = (() => {
    let out = rows;
    if (q) out = out.filter((r) => r.some((c) => c.toLowerCase().includes(q.toLowerCase())));
    if (fi >= 0 && filter) out = out.filter((r) => r[fi] === filter);
    if (sort)
      out = [...out].sort((x, y) => {
        const a = x[sort.col] ?? '';
        const c = y[sort.col] ?? '';
        const na = Number(a);
        const nc = Number(c);
        return (a !== '' && c !== '' && !Number.isNaN(na) && !Number.isNaN(nc) ? na - nc : a.localeCompare(c)) * sort.dir;
      });
    return out;
  })();
  return (
    <Frame b={b}>
      {(b.search || fi >= 0) && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          {b.search && <input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />}
          {fi >= 0 && (
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">Any {b.filter}</option>
              {filterValues.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          )}
        </div>
      )}
      <div className="mod-table-wrap">
        <table className="mod-table">
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th
                  key={i}
                  onClick={b.sort ? () => setSort((s) => (s?.col === i ? { col: i, dir: s.dir === 1 ? -1 : 1 } : { col: i, dir: 1 })) : undefined}
                  style={{ cursor: b.sort ? 'pointer' : undefined }}
                >
                  {c}
                  {sort?.col === i ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, limit).map((r, i) => (
              <tr key={i}>
                {columns.map((_, j) => (
                  <td key={j}>{r[j] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown.length > limit && (
        <button className="btn small" style={{ marginTop: 8 }} onClick={() => setLimit((n) => n + 200)}>
          Show more ({shown.length - limit})
        </button>
      )}
      {!shown.length && <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>Nothing matches.</div>}
    </Frame>
  );
}

function SearchBlock({ b }: { b: B<'search'> }) {
  const data = useData(b.data);
  const [q, setQ] = useState('');
  const fields = b.fields?.length ? b.fields : undefined;
  const hits = q.trim()
    ? data
        .filter((r) => {
          const vals = isObj(r) ? (fields ?? Object.keys(r)).map((k) => cell(r[k])) : [cell(r)];
          return vals.some((v) => v.toLowerCase().includes(q.trim().toLowerCase()));
        })
        .slice(0, 30)
    : [];
  return (
    <Frame b={b}>
      <input placeholder={b.placeholder ?? 'Search'} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: '100%' }} />
      <div className="mod-cards" style={{ marginTop: 8 }}>
        {hits.map((r, i) => {
          if (!isObj(r))
            return (
              <div key={i} className="mod-card">
                {cell(r)}
              </div>
            );
          const [first, ...rest] = Object.entries(r);
          return (
            <div key={i} className="mod-card">
              <div style={{ fontWeight: 700 }}>{cell(first?.[1])}</div>
              {rest.slice(0, 6).map(([k, v]) => (
                <div key={k} style={{ fontSize: 13 }}>
                  <span className="muted">{k}: </span>
                  {cell(v)}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {q.trim() && !hits.length && <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>Nothing found.</div>}
    </Frame>
  );
}

// ---------------------------------------------------------------------------------------------
// Timer, countdown, counter, progress

function Ring({ value, size, color, label }: { value: number; size: number; color: string; label: string }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} style={{ display: 'block' }}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={6} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={6}
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.25s linear' }}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fill="var(--text)" fontSize={size / 5} fontWeight={800}>
        {label}
      </text>
    </svg>
  );
}

const mmss = (s: number) => {
  const t = Math.max(0, Math.ceil(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};

function TimerBlock({ b }: { b: B<'timer'> }) {
  const total = Math.max(1, Number(b.seconds) || 60);
  const [left, setLeft] = useState(total);
  const [running, setRunning] = useState(false);
  const end = useRef(0);
  useEffect(() => {
    if (!running) return;
    end.current = Date.now() + left * 1000;
    const t = setInterval(() => {
      const l = (end.current - Date.now()) / 1000;
      setLeft(Math.max(0, l));
      if (l <= 0) setRunning(false);
    }, 200);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);
  const warn = left <= (b.warnAt ?? Math.min(10, total * 0.2));
  return (
    <Frame b={b}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Ring value={left / total} size={86} color={warn ? 'var(--red)' : 'var(--tier)'} label={mmss(left)} />
        <div style={{ display: 'grid', gap: 8 }}>
          {b.label && <div style={{ fontWeight: 700 }}>{b.label}</div>}
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn small primary" onClick={() => (left <= 0 ? (setLeft(total), setRunning(true)) : setRunning((r) => !r))}>
              {running ? 'Pause' : left <= 0 ? 'Again' : 'Start'}
            </button>
            <button className="btn small" onClick={() => (setRunning(false), setLeft(total))}>
              Reset
            </button>
          </div>
        </div>
      </div>
    </Frame>
  );
}

function CountdownBlock({ b }: { b: B<'countdown'> }) {
  // A plain date means midnight where the player is, not midnight UTC.
  const to = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(b.to ?? '') ? `${b.to}T00:00` : b.to);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = (to - now) / 1000;
  const d = Math.floor(left / 86400);
  return (
    <Frame b={b}>
      {b.label && <div className="muted" style={{ fontSize: 13 }}>{b.label}</div>}
      {Number.isNaN(to) ? (
        <div className="muted">No date set.</div>
      ) : left <= 0 ? (
        <div style={{ fontSize: 22, fontWeight: 800 }}>It’s here</div>
      ) : (
        <div style={{ fontSize: 26, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
          {d > 0 && <>{d} d </>}
          {mmss(left % 86400)}
        </div>
      )}
      <div className="muted" style={{ fontSize: 12 }}>{Number.isNaN(to) ? '' : new Date(to).toLocaleString()}</div>
    </Frame>
  );
}

function CounterBlock({ b }: { b: B<'counter'> }) {
  const [n, setN] = useBlockStore<number>(b.id, 0);
  const step = b.step ?? 1;
  const clamp = (v: number) => Math.min(b.max ?? Infinity, Math.max(b.min ?? -Infinity, v));
  return (
    <Frame b={b}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn small" onClick={() => setN(clamp(n - step))} aria-label="Less">
          −
        </button>
        <div style={{ fontSize: 28, fontWeight: 800, minWidth: 60, textAlign: 'center' }}>{n}</div>
        <button className="btn small primary" onClick={() => setN(clamp(n + step))} aria-label="More">
          +
        </button>
        {b.label && <div className="muted">{b.label}</div>}
        <button className="btn small" style={{ marginLeft: 'auto' }} onClick={() => setN(0)}>
          Reset
        </button>
      </div>
    </Frame>
  );
}

function ProgressBlock({ b }: { b: B<'progress'> }) {
  const [vals, setVals] = useBlockStore<Record<string, number>>(b.id, {});
  return (
    <Frame b={b}>
      <div style={{ display: 'grid', gap: 10 }}>
        {(b.items ?? []).map((it, i) => {
          const v = vals[it.label] ?? 0;
          const max = Math.max(1, it.max);
          const set = (n: number) => setVals({ ...vals, [it.label]: Math.max(0, Math.min(max, n)) });
          return (
            <div key={i}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{ fontWeight: 600 }}>{it.label}</div>
                <div className="muted" style={{ marginLeft: 'auto', fontSize: 13 }}>
                  {v} / {max}
                </div>
                <button className="btn small" onClick={() => set(v - 1)} aria-label="Less">
                  −
                </button>
                <button className="btn small" onClick={() => set(v + 1)} aria-label="More">
                  +
                </button>
              </div>
              <div className="progress">
                <span style={{ width: `${(v / max) * 100}%`, background: v >= max ? 'var(--green)' : undefined }} />
              </div>
            </div>
          );
        })}
      </div>
    </Frame>
  );
}

// ---------------------------------------------------------------------------------------------
// Chart

function ChartBlock({ b }: { b: B<'chart'> }) {
  const labels = b.labels ?? [];
  const series = b.series ?? [];
  const W = 520;
  const H = 200;
  const max = Math.max(1, ...series.flatMap((s) => s.values ?? []).map(Number).filter(Number.isFinite));
  if (b.kind === 'pie') {
    const vals = (series[0]?.values ?? []).map((v) => Math.max(0, Number(v) || 0));
    const sum = vals.reduce((a, c) => a + c, 0) || 1;
    // Each slice's start and end angle, from the top.
    const angles = vals.map((_, i) => -Math.PI / 2 + (vals.slice(0, i).reduce((a, c) => a + c, 0) / sum) * Math.PI * 2);
    return (
      <Frame b={b}>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          <svg width={160} height={160} viewBox="-1 -1 2 2">
            {vals.map((v, i) => {
              const a0 = angles[i];
              const a1 = a0 + (v / sum) * Math.PI * 2;
              const large = a1 - a0 > Math.PI ? 1 : 0;
              const d = `M0 0 L${Math.cos(a0)} ${Math.sin(a0)} A1 1 0 ${large} 1 ${Math.cos(a1)} ${Math.sin(a1)} Z`;
              return <path key={i} d={d} fill={PALETTE[i % PALETTE.length]} stroke="#1a1c3a" strokeWidth={0.02} />;
            })}
          </svg>
          <Legend items={labels.map((l, i) => ({ label: `${l} (${Math.round((vals[i] / sum) * 100)}%)`, color: PALETTE[i % PALETTE.length] }))} />
        </div>
      </Frame>
    );
  }
  const n = Math.max(1, labels.length);
  const bw = (W - 30) / n;
  return (
    <Frame b={b}>
      <svg viewBox={`0 0 ${W} ${H + 24}`} style={{ width: '100%', height: 'auto' }}>
        <line x1={30} y1={H} x2={W} y2={H} stroke="rgba(255,255,255,0.15)" />
        <text x={26} y={10} textAnchor="end" fontSize={10} fill="var(--muted)">
          {max}
        </text>
        {labels.map((l, i) => (
          <text key={i} x={30 + bw * i + bw / 2} y={H + 16} textAnchor="middle" fontSize={10} fill="var(--muted)">
            {String(l).slice(0, 12)}
          </text>
        ))}
        {b.kind === 'line'
          ? series.map((s, si) => (
              <polyline
                key={si}
                fill="none"
                stroke={PALETTE[si % PALETTE.length]}
                strokeWidth={2.5}
                points={(s.values ?? []).map((v, i) => `${30 + bw * i + bw / 2},${H - (Number(v) / max) * (H - 10)}`).join(' ')}
              />
            ))
          : series.map((s, si) =>
              (s.values ?? []).map((v, i) => {
                const w = (bw * 0.75) / Math.max(1, series.length);
                const h = (Math.max(0, Number(v)) / max) * (H - 10);
                return <rect key={`${si}-${i}`} x={30 + bw * i + bw * 0.125 + w * si} y={H - h} width={w} height={h} rx={3} fill={PALETTE[si % PALETTE.length]} />;
              }),
            )}
      </svg>
      {series.length > 1 && <Legend items={series.map((s, i) => ({ label: s.name, color: PALETTE[i % PALETTE.length] }))} />}
    </Frame>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 12 }}>
      {items.map((it, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Checklist (with daily / weekly reset)

function period(reset: string | undefined): string {
  const d = new Date();
  if (reset === 'daily') return d.toISOString().slice(0, 10);
  if (reset === 'weekly') {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return `${t.getUTCFullYear()}-W${Math.ceil(((t.getTime() - y.getTime()) / 86400000 + 1) / 7)}`;
  }
  return 'always';
}

function ChecklistBlock({ b }: { b: B<'checklist'> }) {
  const [saved, setSaved] = useBlockStore<{ p: string; done: Record<string, boolean> }>(b.id, { p: '', done: {} });
  const p = period(b.reset);
  const done = saved.p === p ? saved.done : {};
  const items = b.items ?? [];
  const count = items.filter((x) => done[x]).length;
  return (
    <Frame b={b}>
      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
        {count}/{items.length} done{b.reset === 'daily' ? ' today' : b.reset === 'weekly' ? ' this week' : ''}
      </div>
      <div style={{ display: 'grid', gap: 4 }}>
        {items.map((x, i) => (
          <label key={i} className="mod-check">
            <input type="checkbox" checked={!!done[x]} onChange={(e) => setSaved({ p, done: { ...done, [x]: e.target.checked } })} />
            <span style={{ textDecoration: done[x] ? 'line-through' : undefined, opacity: done[x] ? 0.6 : 1 }}>{inline(x)}</span>
          </label>
        ))}
      </div>
    </Frame>
  );
}

// ---------------------------------------------------------------------------------------------
// Notes, journal

function NotesBlock({ b }: { b: B<'notes'> }) {
  const [saved, setSaved] = useBlockStore<string>(b.id, '');
  const [text, setText] = useState(saved);
  const [view, setView] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  // Saved from elsewhere (another window): show it.
  const [last, setLast] = useState(saved);
  if (saved !== last) {
    setLast(saved);
    setText(saved);
  }
  useEffect(() => {
    if (text === saved) return;
    const t = setTimeout(() => setSaved(text), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  const wrap = (before: string, after = before) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    setText(text.slice(0, s) + before + text.slice(s, e) + after + text.slice(e));
  };
  return (
    <Frame b={b}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        <button className="btn small" onClick={() => wrap('**')} disabled={view} title="Bold">
          <strong>B</strong>
        </button>
        <button className="btn small" onClick={() => wrap('\n- ', '')} disabled={view} title="Bullet">
          • List
        </button>
        <button className="btn small" style={{ marginLeft: 'auto' }} onClick={() => setView((v) => !v)}>
          {view ? 'Edit' : 'View'}
        </button>
      </div>
      {view ? (
        text.trim() ? <RichText text={text} /> : <div className="muted">Nothing written yet.</div>
      ) : (
        <textarea ref={ref} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => setSaved(text)} placeholder={b.placeholder ?? 'Write here…'} rows={6} style={{ width: '100%', resize: 'vertical' }} />
      )}
    </Frame>
  );
}

function JournalBlock({ b }: { b: B<'journal'> }) {
  const [entries, setEntries] = useBlockStore<{ at: number; text: string }[]>(b.id, []);
  const [text, setText] = useState('');
  return (
    <Frame b={b}>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={b.prompt ?? 'How did it go?'} rows={3} style={{ width: '100%', resize: 'vertical' }} />
      <button
        className="btn small primary"
        style={{ marginTop: 6 }}
        disabled={!text.trim()}
        onClick={() => {
          setEntries([{ at: Date.now(), text: text.trim() }, ...entries].slice(0, 300));
          setText('');
        }}
      >
        Add entry
      </button>
      <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
        {entries.slice(0, 20).map((e) => (
          <div key={e.at} className="mod-card">
            <div style={{ display: 'flex' }}>
              <div className="muted" style={{ fontSize: 12 }}>{new Date(e.at).toLocaleString()}</div>
              <button className="mod-x" onClick={() => setEntries(entries.filter((x) => x.at !== e.at))} aria-label="Delete entry">
                ×
              </button>
            </div>
            <RichText text={e.text} />
          </div>
        ))}
      </div>
    </Frame>
  );
}

// ---------------------------------------------------------------------------------------------
// Tabs, build, gallery, map

function TabsBlock({ b }: { b: B<'tabs'> }) {
  const [i, setI] = useState(0);
  const tabs = b.tabs ?? [];
  const tab = tabs[Math.min(i, tabs.length - 1)];
  return (
    <Frame b={b}>
      <div className="mod-tabs">
        {tabs.map((t, j) => (
          <button key={j} className={j === i ? 'active' : ''} onClick={() => setI(j)}>
            {t.title}
          </button>
        ))}
      </div>
      {tab && <BlockList blocks={tab.blocks ?? []} />}
    </Frame>
  );
}

function BuildBlock({ b }: { b: B<'build'> }) {
  const [copied, setCopied] = useState(false);
  return (
    <Frame b={{ ...b, title: b.title ?? b.name }}>
      {b.title && <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>{b.name}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {(b.items ?? []).map((x, i) => (
          <span key={i} className="pill">
            {x}
          </span>
        ))}
      </div>
      {b.notes && (
        <div style={{ marginTop: 8 }}>
          <RichText text={b.notes} />
        </div>
      )}
      {b.code && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
          <code className="mod-code">{b.code}</code>
          <button
            className="btn small"
            onClick={() =>
              void navigator.clipboard.writeText(b.code!).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              })
            }
          >
            {copied ? 'Copied' : 'Copy code'}
          </button>
        </div>
      )}
    </Frame>
  );
}

function GalleryBlock({ b }: { b: B<'gallery'> }) {
  const [big, setBig] = useState<number | null>(null);
  const images = b.images ?? [];
  return (
    <Frame b={b}>
      {big !== null && images[big] ? (
        <div>
          <Img src={images[big].src} alt={images[big].caption ?? ''} style={{ width: '100%', borderRadius: 10 }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
            <div className="muted" style={{ fontSize: 13 }}>{images[big].caption}</div>
            <button className="btn small" style={{ marginLeft: 'auto' }} onClick={() => setBig(null)}>
              Back to all
            </button>
          </div>
        </div>
      ) : (
        <div className="mod-gallery">
          {images.map((im, i) => (
            <button key={i} onClick={() => setBig(i)} style={{ padding: 0, textAlign: 'left' }}>
              <Img src={im.src} alt={im.caption ?? ''} style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 8 }} />
              {im.caption && <div className="muted mod-caption">{im.caption}</div>}
            </button>
          ))}
        </div>
      )}
    </Frame>
  );
}

function MapBlock({ b }: { b: B<'map'> }) {
  const [hover, setHover] = useState<number | null>(null);
  const pins = b.pins ?? [];
  return (
    <Frame b={b}>
      <div style={{ position: 'relative' }}>
        <Img src={b.image} alt={b.title ?? 'Map'} style={{ width: '100%', borderRadius: 10, display: 'block' }} />
        {pins.map((p, i) => (
          <button
            key={i}
            className="mod-pin"
            style={{ left: `${p.x}%`, top: `${p.y}%`, background: p.color ?? 'var(--tier)' }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onClick={() => setHover(hover === i ? null : i)}
            aria-label={p.label}
          >
            {i + 1}
          </button>
        ))}
        {hover !== null && pins[hover] && (
          <div className="mod-pin-note" style={{ left: `${Math.min(70, pins[hover].x)}%`, top: `${pins[hover].y}%` }}>
            <strong>{pins[hover].label}</strong>
            {pins[hover].note && <div style={{ fontSize: 12 }}>{pins[hover].note}</div>}
          </div>
        )}
      </div>
      <ol className="mod-list" style={{ marginTop: 8, fontSize: 13 }}>
        {pins.map((p, i) => (
          <li key={i}>
            <strong>{p.label}</strong>
            {p.note ? ` — ${p.note}` : ''}
          </li>
        ))}
      </ol>
    </Frame>
  );
}

// ---------------------------------------------------------------------------------------------
// Calendar

function CalendarBlock({ b }: { b: B<'calendar'> }) {
  const today = new Date();
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const events = (b.events ?? []).filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date));
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const first = (month.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  const todayKey = key(today);
  const upcoming = events.filter((e) => e.date >= todayKey).sort((a, c) => a.date.localeCompare(c.date)).slice(0, 5);
  return (
    <Frame b={b}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <button className="btn small" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Last month">
          ‹
        </button>
        <div style={{ fontWeight: 700, flex: 1, textAlign: 'center' }}>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
        <button className="btn small" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month">
          ›
        </button>
      </div>
      <div className="mod-cal">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <div key={i} className="muted" style={{ fontSize: 11, textAlign: 'center' }}>
            {d}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const k = key(d);
          const ev = events.filter((e) => e.date === k);
          return (
            <div key={i} className={`mod-cal-day${k === todayKey ? ' today' : ''}${ev.length ? ' has' : ''}`} title={ev.map((e) => e.title).join(', ')}>
              {d.getDate()}
            </div>
          );
        })}
      </div>
      {upcoming.length > 0 && (
        <div style={{ display: 'grid', gap: 4, marginTop: 10 }}>
          {upcoming.map((e, i) => (
            <div key={i} style={{ fontSize: 13 }}>
              <span className="pill muted" style={{ marginRight: 8 }}>
                {new Date(`${e.date}T00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
              <strong>{e.title}</strong>
              {e.note ? <span className="muted"> — {e.note}</span> : null}
            </div>
          ))}
        </div>
      )}
    </Frame>
  );
}

// ---------------------------------------------------------------------------------------------
// Flashcards, wheel, video

function FlashcardsBlock({ b }: { b: B<'flashcards'> }) {
  const cards = b.cards ?? [];
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  const [score, setScore] = useState({ right: 0, seen: 0 });
  const [best, setBest] = useBlockStore<number>(b.id, 0);
  const card = cards[i % Math.max(1, cards.length)];
  if (!card) return <Frame b={b}><div className="muted">No cards.</div></Frame>;
  const next = (right?: boolean) => {
    if (b.quiz && right !== undefined) {
      const s = { right: score.right + (right ? 1 : 0), seen: score.seen + 1 };
      setScore(s);
      if (s.seen === cards.length && s.right > best) setBest(s.right);
    }
    setFlip(false);
    setI((n) => (n + 1) % cards.length);
  };
  return (
    <Frame b={b}>
      <button className="mod-flash" onClick={() => setFlip((f) => !f)}>
        <div className="muted" style={{ fontSize: 11 }}>
          {i + 1} / {cards.length} · {flip ? 'answer' : 'click to flip'}
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>{flip ? card.back : card.front}</div>
      </button>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
        {b.quiz && flip ? (
          <>
            <button className="btn small primary" onClick={() => next(true)}>
              Got it
            </button>
            <button className="btn small" onClick={() => next(false)}>
              Missed
            </button>
          </>
        ) : (
          <button className="btn small" onClick={() => next()}>
            Next
          </button>
        )}
        {b.quiz && (
          <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>
            {score.right}/{score.seen} right · best {best}/{cards.length}
          </span>
        )}
      </div>
    </Frame>
  );
}

function WheelBlock({ b }: { b: B<'wheel'> }) {
  const items = (b.items ?? []).slice(0, 24);
  const [angle, setAngle] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const n = Math.max(1, items.length);
  const seg = 360 / n;
  const spin = () => {
    const pick = Math.floor(Math.random() * n);
    // The pointer is at the top: land the picked segment's middle there.
    const target = 360 * 5 + (360 - (pick * seg + seg / 2));
    setResult(null);
    setAngle((a) => a - (a % 360) + target);
    setTimeout(() => setResult(items[pick] ?? null), 2600);
  };
  const r = 90;
  return (
    <Frame b={b}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: 200, height: 210 }}>
          <div className="mod-wheel-pointer" />
          <svg width={200} height={200} viewBox="-100 -100 200 200" style={{ transform: `rotate(${angle}deg)`, transition: 'transform 2.5s cubic-bezier(0.2, 0.8, 0.2, 1)', marginTop: 10 }}>
            {items.map((it, i) => {
              const a0 = ((i * seg - 90) * Math.PI) / 180;
              const a1 = (((i + 1) * seg - 90) * Math.PI) / 180;
              const mid = (a0 + a1) / 2;
              return (
                <g key={i}>
                  <path d={`M0 0 L${r * Math.cos(a0)} ${r * Math.sin(a0)} A${r} ${r} 0 ${seg > 180 ? 1 : 0} 1 ${r * Math.cos(a1)} ${r * Math.sin(a1)} Z`} fill={PALETTE[i % PALETTE.length]} stroke="#1a1c3a" />
                  <text x={r * 0.6 * Math.cos(mid)} y={r * 0.6 * Math.sin(mid)} fontSize={9} fill="#0f1023" fontWeight={700} textAnchor="middle" dominantBaseline="central">
                    {it.slice(0, 12)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <button className="btn primary" onClick={spin} disabled={!items.length}>
            Spin
          </button>
          {result && <div style={{ fontSize: 18, fontWeight: 800 }}>{result}</div>}
        </div>
      </div>
    </Frame>
  );
}

function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}

function VideoBlock({ b }: { b: B<'video'> }) {
  const ctx = useMod();
  const yt = youtubeId(b.url ?? '');
  return (
    <Frame b={b}>
      {yt ? (
        <button onClick={() => openLink(`https://www.youtube.com/watch?v=${yt}`)} style={{ padding: 0, position: 'relative', width: '100%' }} title="Opens on YouTube">
          <img src={`https://i.ytimg.com/vi/${yt}/hqdefault.jpg`} alt={b.caption ?? 'Video'} style={{ width: '100%', borderRadius: 10, display: 'block' }} />
          <span className="mod-play">▶</span>
        </button>
      ) : /^https:/i.test(b.url ?? '') ? (
        <button className="btn" onClick={() => openLink(b.url)}>
          Watch ↗
        </button>
      ) : (
        <video src={assetUrl(ctx.id, b.url)} controls style={{ width: '100%', borderRadius: 10 }} />
      )}
      {b.caption && <div className="muted mod-caption">{b.caption}</div>}
    </Frame>
  );
}

// ---------------------------------------------------------------------------------------------
// The player's progress: bests, goals, backlog

function BestsBlock({ b }: { b: B<'bests'> }) {
  const [bests, setBests] = useBlockStore<Record<string, { value: number; at: number }>>(b.id, {});
  const [input, setInput] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<string | null>(null);
  return (
    <Frame b={b}>
      <div style={{ display: 'grid', gap: 8 }}>
        {(b.stats ?? []).map((s) => {
          const cur = bests[s.label];
          const submit = () => {
            const v = Number(input[s.label]);
            if (!Number.isFinite(v)) return;
            const better = !cur || (s.lowerIsBetter ? v < cur.value : v > cur.value);
            if (better) {
              setBests({ ...bests, [s.label]: { value: v, at: Date.now() } });
              setFlash(s.label);
              setTimeout(() => setFlash(null), 2500);
            }
            setInput({ ...input, [s.label]: '' });
          };
          return (
            <div key={s.label} className="mod-card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{s.label}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {cur ? `Best ${cur.value}${s.unit ? ` ${s.unit}` : ''} · ${new Date(cur.at).toLocaleDateString()}` : 'No best yet'}
                  {flash === s.label && <span style={{ color: 'var(--green)', fontWeight: 700 }}> · New best!</span>}
                </div>
              </div>
              <input type="number" value={input[s.label] ?? ''} onChange={(e) => setInput({ ...input, [s.label]: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="This time" style={{ width: 110 }} />
              <button className="btn small" onClick={submit}>
                Save
              </button>
            </div>
          );
        })}
      </div>
    </Frame>
  );
}

interface Goal {
  id: string;
  text: string;
  due?: string;
  done: boolean;
}

function GoalsBlock({ b }: { b: B<'goals'> }) {
  const ctx = useMod();
  const stored = ctx.storage[`b:${b.id}`] as Goal[] | undefined;
  const goals: Goal[] = stored ?? (b.goals ?? []).map((g, i) => ({ id: `s${i}`, text: g.text, due: g.due, done: false }));
  const save = (g: Goal[]) => ctx.set(`b:${b.id}`, g);
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Frame b={b}>
      <div style={{ display: 'grid', gap: 4 }}>
        {goals.map((g) => {
          const late = !g.done && g.due && g.due < today;
          return (
            <label key={g.id} className="mod-check">
              <input type="checkbox" checked={g.done} onChange={(e) => save(goals.map((x) => (x.id === g.id ? { ...x, done: e.target.checked } : x)))} />
              <span style={{ flex: 1, textDecoration: g.done ? 'line-through' : undefined, opacity: g.done ? 0.6 : 1 }}>{g.text}</span>
              {g.due && (
                <span className="pill muted" style={late ? { color: 'var(--red)' } : undefined}>
                  {late ? 'Late: ' : 'By '}
                  {new Date(`${g.due}T00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              )}
              <button className="mod-x" onClick={(e) => (e.preventDefault(), save(goals.filter((x) => x.id !== g.id)))} aria-label="Remove goal">
                ×
              </button>
            </label>
          );
        })}
        {!goals.length && <div className="muted" style={{ fontSize: 13 }}>No goals yet.</div>}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="New goal" style={{ flex: 1 }} />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        <button
          className="btn small primary"
          disabled={!text.trim()}
          onClick={() => {
            save([...goals, { id: String(Date.now()), text: text.trim(), due: due || undefined, done: false }]);
            setText('');
            setDue('');
          }}
        >
          Add
        </button>
      </div>
    </Frame>
  );
}

function BacklogBlock({ b }: { b: B<'backlog'> }) {
  const library = useLibrary();
  const [keys, setKeys] = useBlockStore<string[]>(b.id, []);
  const [pick, setPick] = useState('');
  const games = (library?.games ?? []).filter((g) => !g.hidden && !g.isTool);
  const byKey = new Map(games.map((g) => [g.key, g]));
  const move = (i: number, d: number) => {
    const next = [...keys];
    const [x] = next.splice(i, 1);
    next.splice(Math.max(0, Math.min(next.length, i + d)), 0, x);
    setKeys(next);
  };
  return (
    <Frame b={b}>
      <div style={{ display: 'grid', gap: 4 }}>
        {keys.map((k, i) => {
          const g = byKey.get(k);
          return (
            <div key={k} className="mod-card" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px' }}>
              <span className="muted" style={{ width: 18 }}>{i + 1}</span>
              <span style={{ flex: 1, fontWeight: 600 }}>{g?.name ?? k}</span>
              {g && !g.installed && <span className="pill muted">Not installed</span>}
              <button className="btn small" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Up">
                ↑
              </button>
              <button className="btn small" onClick={() => move(i, 1)} disabled={i === keys.length - 1} aria-label="Down">
                ↓
              </button>
              <button className="mod-x" onClick={() => setKeys(keys.filter((x) => x !== k))} aria-label="Remove">
                ×
              </button>
            </div>
          );
        })}
        {!keys.length && <div className="muted" style={{ fontSize: 13 }}>Add games you want to play next.</div>}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <select value={pick} onChange={(e) => setPick(e.target.value)} style={{ flex: 1 }}>
          <option value="">Pick a game…</option>
          {games
            .filter((g) => !keys.includes(g.key))
            .sort((a, c) => a.name.localeCompare(c.name))
            .map((g) => (
              <option key={g.key} value={g.key}>
                {g.name}
              </option>
            ))}
        </select>
        <button className="btn small primary" disabled={!pick} onClick={() => (setKeys([...keys, pick]), setPick(''))}>
          Add
        </button>
      </div>
    </Frame>
  );
}

// ---------------------------------------------------------------------------------------------
// The module's game: achievements with tips, sessions

function useGameData(allowed: boolean): { data: GameAchievements | null; error: string | null } {
  const ctx = useMod();
  const key = ctx.doc.game?.key ?? null;
  const [state, setState] = useState<{ data: GameAchievements | null; error: string | null }>({ data: null, error: null });
  useEffect(() => {
    if (!allowed || !key) return;
    let live = true;
    window.shotcaller
      .getGameAchievements(key)
      .then((d) => live && setState({ data: d, error: d ? null : 'This game isn’t in your library any more.' }))
      .catch((e) => live && setState({ data: null, error: String(e) }));
    return () => {
      live = false;
    };
  }, [allowed, key]);
  if (!allowed) return { data: null, error: 'This module isn’t allowed to read that.' };
  if (!key) return { data: null, error: 'This module has no game.' };
  return state;
}

function AchievementsBlock({ b }: { b: B<'achievements'> }) {
  const ctx = useMod();
  const { data, error } = useGameData(ctx.doc.permissions.achievements);
  const tips = new Map(Object.entries(b.tips ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  const list = (data?.achievements ?? [])
    .filter((a) => (b.show ?? 'locked') === 'all' || !a.unlocked)
    .sort((x, y) => (y.rarity ?? -1) - (x.rarity ?? -1))
    .slice(0, b.limit ?? 40);
  return (
    <Frame b={b}>
      {error ? (
        <div className="muted" style={{ fontSize: 13 }}>{error}</div>
      ) : !data ? (
        <div className="muted" style={{ fontSize: 13 }}>Loading…</div>
      ) : (
        <>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
            {data.unlocked}/{data.total} unlocked · easiest first
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {list.map((a) => {
              const tip = tips.get(a.name.toLowerCase());
              return (
                <div key={a.id} className="mod-card" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', opacity: a.unlocked ? 0.6 : 1 }}>
                  {a.icon && <img src={a.unlocked ? a.icon : (a.iconGray ?? a.icon)} alt="" width={36} height={36} style={{ borderRadius: 6, flex: 'none' }} />}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>
                      {a.name} {a.unlocked && <span className="pill green">Got it</span>}
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {a.hidden && !a.unlocked ? 'Hidden achievement' : a.description}
                      {a.rarity !== null ? ` · ${a.rarity.toFixed(1)}% of players` : ''}
                      {a.progress ? ` · ${a.progress.current}/${a.progress.max}` : ''}
                    </div>
                    {tip && <div style={{ fontSize: 13, marginTop: 4 }}>💡 {tip}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Frame>
  );
}

function SessionsBlock({ b }: { b: B<'sessions'> }) {
  const ctx = useMod();
  const { data, error } = useGameData(ctx.doc.permissions.library);
  const sessions = [...(data?.sessions ?? [])].sort((x, y) => y.start - x.start);
  const mins = (s: { start: number; end: number }) => Math.max(1, Math.round((s.end - s.start) / 60000));
  const avg = sessions.length ? Math.round(sessions.reduce((n, s) => n + mins(s), 0) / sessions.length) : 0;
  const fmt = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
  return (
    <Frame b={b}>
      {error ? (
        <div className="muted" style={{ fontSize: 13 }}>{error}</div>
      ) : !sessions.length ? (
        <div className="muted" style={{ fontSize: 13 }}>{data ? 'No sessions recorded yet. They’re counted from when ShotCaller sees the game running.' : 'Loading…'}</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
            <div>
              <div className="section-label">Sessions</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{sessions.length}</div>
            </div>
            <div>
              <div className="section-label">Average</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{fmt(avg)}</div>
            </div>
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            {sessions.slice(0, b.limit ?? 8).map((s) => (
              <div key={s.start} style={{ display: 'flex', fontSize: 13 }}>
                <span>{new Date(s.start).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                <span className="muted" style={{ marginLeft: 'auto' }}>{fmt(mins(s))}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Frame>
  );
}
