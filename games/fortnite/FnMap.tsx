import { useEffect, useMemo, useState } from 'react';
import type { FnChestPin, FnDrop, FnMapState, FnPoint } from '../../shared/fortnite';

/**
 * The season map with the A-J / 1-10 grid, your dot (sure = solid, not sure = hollow), your route, chest pins,
 * teammates and, in the lobby, landing/death pins. Drawn as one SVG in map pixels (0-2048), so everything lines
 * up whatever the size. `follow` zooms in around your dot during a match.
 */

const SIZE = 2048;
const COLS = 'ABCDEFGHIJ';

let cachedImage: { id: string | null; url: string | null } = { id: null, url: null };

/** The map picture with place names; fetched once per window and again when the season map changes. */
export function useMapImage(mapId: string | null): string | null {
  const [loaded, setLoaded] = useState<{ id: string | null; url: string | null }>(cachedImage);
  useEffect(() => {
    if (!mapId || (cachedImage.id === mapId && cachedImage.url)) return;
    let active = true;
    void window.shotcaller.getFortniteMapImage().then((u) => {
      cachedImage = { id: mapId, url: u };
      if (active) setLoaded(cachedImage);
    });
    return () => {
      active = false;
    };
  }, [mapId]);
  if (cachedImage.id === mapId) return cachedImage.url;
  return loaded.id === mapId ? loaded.url : null;
}

const KIND_COLOR: Record<FnChestPin['kind'], string> = {
  chest: 'var(--fn-legendary)',
  rare: 'var(--fn-rare)',
  sprite: 'var(--fn-epic)',
  manual: '#dfe2f5',
};

export interface FnMapProps {
  live: FnMapState | null;
  /** Zoom around your dot (match in progress). */
  follow?: boolean;
  /** Override the route/pins (a past match's recap). */
  route?: [number, number][];
  chests?: FnChestPin[];
  landing?: FnPoint | null;
  death?: FnPoint | null;
  /** Lobby: landing (and death) pins from past matches on this map. */
  drops?: FnDrop[];
  className?: string;
}

export function FnMap({ live, follow, route, chests, landing, death, drops, className }: FnMapProps) {
  const image = useMapImage(live?.map.id ?? null);
  const dot = live?.dot ?? null;
  const path = route ?? live?.route ?? [];
  const pins = chests ?? live?.chests ?? [];
  const land = landing !== undefined ? landing : (live?.landing ?? null);
  const view = useMemo(() => {
    if (!follow || !dot) return { x: 0, y: 0, w: SIZE };
    const w = 640;
    const x = Math.min(SIZE - w, Math.max(0, dot.x - w / 2));
    const y = Math.min(SIZE - w, Math.max(0, dot.y - w / 2));
    return { x, y, w };
  }, [follow, dot]);
  // Marks keep the same size on screen whatever the zoom.
  const u = view.w / 1024;

  if (!live || live.map.status !== 'ready' || !image) {
    return (
      <div className={`fn-map fn-map-empty ${className ?? ''}`}>
        {live?.map.status === 'error' ? (
          <span>The season map couldn’t be downloaded: {live.map.error}</span>
        ) : (
          <span>
            <span className="spinner" /> Getting the season map…
          </span>
        )}
      </div>
    );
  }

  const cell = SIZE / 10;
  return (
    <svg className={`fn-map ${className ?? ''}`} viewBox={`${view.x} ${view.y} ${view.w} ${view.w}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Season map">
      <image href={image} x={0} y={0} width={SIZE} height={SIZE} />
      {/* Grid: columns A-J left to right, rows 1-10 top to bottom. */}
      <g className="fn-grid">
        {Array.from({ length: 11 }, (_, i) => (
          <g key={i}>
            <line x1={i * cell} y1={0} x2={i * cell} y2={SIZE} strokeWidth={1.2 * u} />
            <line x1={0} y1={i * cell} x2={SIZE} y2={i * cell} strokeWidth={1.2 * u} />
          </g>
        ))}
        {Array.from({ length: 10 }, (_, i) => (
          <g key={`l${i}`} fontSize={22 * u}>
            <text x={i * cell + cell / 2} y={view.y + 26 * u} textAnchor="middle">
              {COLS[i]}
            </text>
            <text x={view.x + 10 * u} y={i * cell + cell / 2 + 8 * u}>
              {i + 1}
            </text>
          </g>
        ))}
      </g>

      {drops?.map((d) => (
        <g key={d.matchId}>
          {d.landing && <circle cx={d.landing.x} cy={d.landing.y} r={7 * u} className="fn-pin-land" data-win={d.placement === 1 ? 'yes' : 'no'} />}
          {d.death && <path d={cross(d.death, 6 * u)} className="fn-pin-death" strokeWidth={3 * u} />}
        </g>
      ))}

      {path.length > 1 && <polyline points={path.map(([x, y]) => `${x},${y}`).join(' ')} className="fn-route" strokeWidth={4 * u} />}
      {land && <circle cx={land.x} cy={land.y} r={9 * u} className="fn-pin-land" data-win="no" />}
      {death && <path d={cross(death, 8 * u)} className="fn-pin-death" strokeWidth={4 * u} />}
      {pins.map((p) => (
        <rect key={p.at} x={p.x - 6 * u} y={p.y - 6 * u} width={12 * u} height={12 * u} rx={2 * u} fill={KIND_COLOR[p.kind]} stroke="#0b0c1c" strokeWidth={2 * u} />
      ))}
      {live.teammates.map((t, i) => (
        <circle key={i} cx={t.x} cy={t.y} r={9 * u} fill={t.color} stroke="#0b0c1c" strokeWidth={3 * u} />
      ))}
      {dot && !route && (
        <g>
          <circle cx={dot.x} cy={dot.y} r={22 * u} className="fn-dot-halo" data-state={dot.state} />
          <circle cx={dot.x} cy={dot.y} r={10 * u} className="fn-dot-me" data-state={dot.state} strokeWidth={4 * u} />
        </g>
      )}
    </svg>
  );
}

function cross(p: FnPoint, r: number): string {
  return `M${p.x - r},${p.y - r} L${p.x + r},${p.y + r} M${p.x + r},${p.y - r} L${p.x - r},${p.y + r}`;
}

/** "D6" for a map spot. */
export function gridCell(p: FnPoint): string {
  const c = Math.min(9, Math.max(0, Math.floor(p.x / (SIZE / 10))));
  const r = Math.min(9, Math.max(0, Math.floor(p.y / (SIZE / 10))));
  return `${COLS[c]}${r + 1}`;
}
