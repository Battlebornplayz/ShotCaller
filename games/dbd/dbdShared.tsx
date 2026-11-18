import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { DbdData, DbdState } from '../../shared/dbd';

/** Small pieces shared by the DbD hub's tabs. */

export function useDbdState(): DbdState | null {
  const [s, setS] = useState<DbdState | null>(null);
  useEffect(() => {
    let live = true;
    void window.shotcaller.getDbd().then((v) => live && setS(v));
    const off = window.shotcaller.onDbd((v) => setS(v));
    return () => {
      live = false;
      off();
    };
  }, []);
  return s;
}

export function useDbdData(): DbdData | null {
  const [d, setD] = useState<DbdData | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => window.shotcaller.onDbdData(() => setVersion((v) => v + 1)), []);
  useEffect(() => {
    let live = true;
    void window.shotcaller.getDbdData().then((v) => live && setD(v));
    return () => {
      live = false;
    };
  }, [version]);
  return d;
}

/** The time the component first drew (render must not read the clock). */
export function useNow(): number {
  const [now] = useState(() => Date.now());
  return now;
}

export const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export function daysAgo(ms: number): string {
  const d = Math.round((Date.now() - ms) / 86_400_000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 60 ? `${d} days ago` : `${Math.round(d / 30)} months ago`;
}

/** "MovementSpeed" → "Movement speed". */
export function tagLabel(tag: string): string {
  const known: Record<string, string> = { Generators: 'Gens', TerrorRadius: 'Terror radius', ExitGates: 'Exit gates', DeepWound: 'Deep wound', SelfHeal: 'Self-heal' };
  if (known[tag]) return known[tag];
  const words = tag.replace(/([a-z])([A-Z])/g, '$1 $2');
  return words[0] + words.slice(1).toLowerCase();
}

/** An icon from the wiki, saved on this PC; a dim square while it loads or if there is none. */
export function Icon({ src, size = 48, alt = '', style, dim }: { src: string | null; size?: number; alt?: string; style?: CSSProperties; dim?: boolean }) {
  // Remembers which address failed, so a new address gets a fresh try.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = failedSrc !== null && failedSrc === src;
  const box: CSSProperties = { width: size, height: size, flex: 'none', ...style };
  if (!src || failed) return <span className="dbd-icon-empty" style={box} />;
  return <img src={src} alt={alt} width={size} height={size} loading="lazy" style={{ ...box, objectFit: 'contain', opacity: dim ? 0.45 : 1 }} onError={() => setFailedSrc(src)} />;
}

export function NewTag() {
  return <span className="dbd-new">New</span>;
}

/** Text from the wiki or Steam: already cleaned to b/i/br/ul/li in the main process. */
export function RichText({ html, style }: { html: string; style?: CSSProperties }) {
  return <div className="dbd-rich" style={style} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Switch({ label, help, on, onChange }: { label: string; help?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="fn-switch">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span style={{ fontWeight: 600 }}>{label}</span>
        {help && (
          <span className="muted" style={{ display: 'block', fontSize: 12 }}>
            {help}
          </span>
        )}
      </span>
    </label>
  );
}

export function Section({ title, count, children, right }: { title: string; count?: number; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="card" style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="section-label">
          {title}
          {count !== undefined ? ` · ${count}` : ''}
        </div>
        <div style={{ marginLeft: 'auto' }}>{right}</div>
      </div>
      {children}
    </section>
  );
}
