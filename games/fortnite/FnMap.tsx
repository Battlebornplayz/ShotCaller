import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useSettings } from '../../src/hooks/useLive';
import type { FnChestPin, FnCircle, FnDrop, FnFriendMarks, FnKillPin, FnMapLayers, FnMapState, FnPoint } from '../../shared/fortnite';

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
  kills?: FnKillPin[];
  /** Plan mode: click the map to add a stop to your route, right-click to take the last one off. */
  planning?: boolean;
  /** Which layers to draw (all when left out). */
  layers?: Partial<FnMapLayers>;
  className?: string;
}

/** Linked friends' colours (yours is the blue dot). */
const FRIEND_COLORS = ['#3ddc84', '#ffcf3f', '#ff7ad9', '#ff9b3f'];

export function FnMap({ live, follow, route, chests, landing, death, drops, kills, planning, layers, className }: FnMapProps) {
  const image = useMapImage(live?.map.id ?? null);
  const fnSettings = useSettings()?.fortnite;
  const look = fnSettings?.marker === 'image' && !fnSettings.markerImage ? 'arrow' : (fnSettings?.marker ?? 'arrow');
  const dot = live?.dot ?? null;
  const path = route ?? live?.route ?? [];
  const pins = chests ?? live?.chests ?? [];
  const land = landing !== undefined ? landing : (live?.landing ?? null);
  const died = death !== undefined ? death : (live?.death ?? null);
  const killPins = kills ?? (route ? [] : (live?.kills ?? []));
  const plan = live?.plan ?? [];
  const step = route ? 0 : (live?.planStep ?? 0);
  const squad = live?.squad ?? [];
  // With no dot of your own (e.g. in the lobby), the map window follows your linked friend instead.
  const center = dot ?? squad.find((f) => f.dot)?.dot ?? null;
  const view = useMemo(() => {
    if (!follow || !center) return { x: 0, y: 0, w: SIZE };
    const w = 640;
    const x = Math.min(SIZE - w, Math.max(0, center.x - w / 2));
    const y = Math.min(SIZE - w, Math.max(0, center.y - w / 2));
    return { x, y, w };
  }, [follow, center]);
  const smooth = useSmoothView(view);
  // Your own zoom/pan (scroll wheel, hold right-click and drag), like Fortnite's full map. Null = automatic view.
  const [manual, setManual] = useState<{ x: number; y: number; w: number } | null>(null);
  const cur = manual ?? view;
  const shown = manual ?? smooth;
  // Marks keep the same size on screen whatever the zoom.
  const u = cur.w / 1024;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ x: number; y: number; view: { x: number; y: number; w: number }; moved: boolean } | null>(null);
  const curRef = useRef(cur);
  useEffect(() => {
    curRef.current = cur;
  });
  // The wheel needs a non-passive listener so the page doesn't scroll while you zoom.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = curRef.current;
      const r = el.getBoundingClientRect();
      const side = Math.min(r.width, r.height);
      // Point under the mouse, in map pixels (the map is centred in the box).
      const mx = v.x + ((e.clientX - r.left - (r.width - side) / 2) / side) * v.w;
      const my = v.y + ((e.clientY - r.top - (r.height - side) / 2) / side) * v.w;
      const w = Math.min(SIZE, Math.max(160, v.w * (e.deltaY > 0 ? 1.2 : 1 / 1.2)));
      setManual(w >= SIZE ? null : clampView({ x: mx - ((mx - v.x) / v.w) * w, y: my - ((my - v.y) / v.w) * w, w }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [image, live?.map.status]);

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
  const toMap = (e: React.MouseEvent<SVGSVGElement>): FnPoint | null => {
    const m = e.currentTarget.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const addStop = (e: React.MouseEvent<SVGSVGElement>) => {
    const p = planning ? toMap(e) : null;
    if (p) void window.shotcaller.setFortnitePlan([...plan, p]);
  };
  // Right button: hold and drag to move the map; a plain right-click (no drag) in plan mode takes the last stop off.
  const onDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button === 2) drag.current = { x: e.clientX, y: e.clientY, view: cur, moved: false };
  };
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    const r = e.currentTarget.getBoundingClientRect();
    const k = d.view.w / Math.min(r.width, r.height);
    setManual(clampView({ x: d.view.x - dx * k, y: d.view.y - dy * k, w: d.view.w }));
  };
  const onUp = (e: React.MouseEvent<SVGSVGElement>) => {
    const d = drag.current;
    drag.current = null;
    if (e.button === 2 && d && !d.moved && planning) void window.shotcaller.setFortnitePlan(plan.slice(0, -1));
  };
  return (
    <svg
      className={`fn-map ${className ?? ''}`}
      data-planning={planning ? 'yes' : undefined}
      ref={svgRef}
      onClick={addStop}
      onMouseDown={onDown}
      onMouseMove={onMove}
      onMouseUp={onUp}
      onMouseLeave={() => (drag.current = null)}
      onContextMenu={(e) => e.preventDefault()}
      onDoubleClick={() => setManual(null)}
      viewBox={`${shown.x} ${shown.y} ${shown.w} ${shown.w}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Season map">
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
            <text x={i * cell + cell / 2} y={cur.y + 26 * u} textAnchor="middle">
              {COLS[i]}
            </text>
            <text x={cur.x + 10 * u} y={i * cell + cell / 2 + 8 * u}>
              {i + 1}
            </text>
          </g>
        ))}
      </g>

      <FnMapLayers
        live={live}
        u={u}
        look={look}
        markerImage={fnSettings?.markerImage ?? null}
        path={path}
        pins={pins}
        land={land}
        died={died}
        killPins={killPins}
        plan={plan}
        step={step}
        recap={!!route}
        drops={drops}
        show={layers}
      />
    </svg>
  );
}

/** Everything drawn on the map in map pixels, each layer with its own switch. Shared by every map view. */
export function FnMapLayers({
  live,
  u,
  look,
  markerImage,
  path,
  pins,
  land,
  died,
  killPins,
  plan,
  step,
  recap,
  drops,
  show,
}: {
  live: FnMapState;
  u: number;
  look: 'dot' | 'arrow' | 'image';
  markerImage: string | null;
  path: [number, number][];
  pins: FnChestPin[];
  land: FnPoint | null;
  died: FnPoint | null;
  killPins: FnKillPin[];
  plan: FnPoint[];
  step: number;
  /** A past match's recap: no live dot. */
  recap: boolean;
  drops?: FnDrop[];
  show?: Partial<FnMapLayers>;
}) {
  const on = (k: keyof FnMapLayers) => show?.[k] !== false;
  const dot = live.dot;
  const squad = live.squad;
  const ahead = plan.slice(step);
  const gpsFrom = dot && !recap && ahead.length ? dot : null;
  return (
    <>
      {on('storm') && live.storm && !recap && <StormLayer next={live.storm.next} edge={live.storm.edge} u={u} />}
      {on('deaths') && drops && <DeathHeat drops={drops} u={u} />}
      {on('drops') && drops?.map((d) => (
        <g key={d.matchId}>
          {d.landing && <LandIcon p={d.landing} s={0.8 * u} win={d.placement === 1} />}
          {d.death && <DeathIcon p={d.death} s={0.75 * u} />}
        </g>
      ))}

      {on('route') && path.length > 1 && <polyline points={path.map(([x, y]) => `${x},${y}`).join(' ')} className="fn-route" strokeWidth={4 * u} />}

      {on('plan') && plan.length > 0 && (
        <g className="fn-plan" pointerEvents="none">
          {step > 0 && <polyline points={plan.slice(0, step + 1).map((p) => `${p.x},${p.y}`).join(' ')} className="fn-plan-done" strokeWidth={3 * u} />}
          {ahead.length > 0 && (
            <polyline points={[...(step > 0 ? [plan[step - 1]] : []), ...ahead].map((p) => `${p.x},${p.y}`).join(' ')} className="fn-plan-line" strokeWidth={4 * u} strokeDasharray={`${12 * u} ${9 * u}`} />
          )}
          {gpsFrom && <line x1={gpsFrom.x} y1={gpsFrom.y} x2={ahead[0].x} y2={ahead[0].y} className="fn-plan-gps" strokeWidth={6 * u} />}
          {plan.map((p, i) => (
            <g key={i} transform={`translate(${p.x} ${p.y})`} opacity={i < step ? 0.45 : 1}>
              <circle r={13 * u} className="fn-plan-stop" data-next={i === step ? 'yes' : undefined} strokeWidth={3 * u} />
              <text y={6 * u} textAnchor="middle" fontSize={17 * u} fontWeight={800} fill="#0b0c1c">
                {i < step ? '✓' : i + 1}
              </text>
            </g>
          ))}
        </g>
      )}

      {on('landing') && land && <LandIcon p={land} s={u} />}
      {on('chests') && pins.map((p) => (
        <ChestIcon key={p.at} p={p} s={u} color={KIND_COLOR[p.kind]} />
      ))}
      {on('kills') && killPins.map((k) => (
        <KillIcon key={k.at} p={k} s={u} />
      ))}
      {on('death') && died && <DeathIcon p={died} s={u} />}
      {on('teammates') && live.teammates.map((t, i) => (
        <circle key={i} cx={t.x} cy={t.y} r={9 * u} fill={t.color} stroke="#0b0c1c" strokeWidth={3 * u} />
      ))}
      {on('squad') && squad.map((f, i) => (
        <g key={f.id} opacity={f.dot?.state === 'sure' ? 1 : 0.55}>
          {f.route.length > 1 && (
            <polyline points={f.route.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke={friendColor(f, i)} strokeOpacity={0.75} strokeWidth={3 * u} strokeLinejoin="round" />
          )}
          {f.marks && <FriendMarks m={f.marks} color={friendColor(f, i)} u={u} />}
          {f.dot && (
            <g style={glide(f.dot)}>
              {f.look === 'image' && f.pic ? (
                <>
                  <clipPath id={`fn-clip-${f.id}`}>
                    <circle r={14 * u} />
                  </clipPath>
                  <image href={f.pic} x={-14 * u} y={-14 * u} width={28 * u} height={28 * u} clipPath={`url(#fn-clip-${f.id})`} preserveAspectRatio="xMidYMid slice" />
                  <circle r={14 * u} fill="none" stroke={friendColor(f, i)} strokeWidth={4 * u} />
                </>
              ) : (f.look ?? look) === 'dot' ? (
                <circle r={10 * u} fill={friendColor(f, i)} stroke="#0b0c1c" strokeWidth={4 * u} />
              ) : (
                <path d={ARROW} transform={`scale(${u})`} fill={friendColor(f, i)} stroke="#0b0c1c" strokeWidth={3} strokeLinejoin="round" style={turn(heading(f.route), f.id)} />
              )}
              <text y={-16 * u} textAnchor="middle" fontSize={22 * u} fontWeight={700} fill="#fff" stroke="#0b0c1c" strokeWidth={5 * u} paintOrder="stroke">
                {f.name}
              </text>
            </g>
          )}
        </g>
      ))}
      {on('me') && dot && !recap && (
        <g style={glide(dot)}>
          <circle r={22 * u} className="fn-dot-halo" data-state={dot.state} />
          {look === 'dot' && <circle r={10 * u} className="fn-dot-me" data-state={dot.state} strokeWidth={4 * u} />}
          {look === 'arrow' && <path d={ARROW} transform={`scale(${u})`} className="fn-dot-me" data-state={dot.state} strokeWidth={3} strokeLinejoin="round" style={turn(heading(path))} />}
          {look === 'image' && (
            <g opacity={dot.state === 'sure' ? 1 : 0.6}>
              <clipPath id="fn-me-clip">
                <circle r={16 * u} />
              </clipPath>
              <image href={markerImage!} x={-16 * u} y={-16 * u} width={32 * u} height={32 * u} clipPath="url(#fn-me-clip)" preserveAspectRatio="xMidYMid slice" />
              <circle r={16 * u} fill="none" stroke="#fff" strokeWidth={3 * u} />
            </g>
          )}
        </g>
      )}
      {on('markers') && !recap && live.markers.map((m, i) => <MarkerIcon key={i} p={m} color={m.color} s={u} />)}
    </>
  );
}

/** A friend's colour: their real squad colour once matched, else one of ours. */
function friendColor(f: { color?: string }, i: number): string {
  return f.color ?? FRIEND_COLORS[i % FRIEND_COLORS.length];
}

/** The storm: purple outside the current edge, a white ring for the next safe zone. */
function StormLayer({ next, edge, u }: { next: FnCircle | null; edge: FnCircle | null; u: number }) {
  return (
    <g pointerEvents="none">
      {edge && (
        <path
          d={`M-4000,-4000 H6000 V6000 H-4000 Z M${edge.x - edge.r},${edge.y} a${edge.r},${edge.r} 0 1,0 ${edge.r * 2},0 a${edge.r},${edge.r} 0 1,0 ${-edge.r * 2},0 Z`}
          fill="#b43cff"
          fillOpacity={0.28}
          fillRule="evenodd"
        />
      )}
      {edge && <circle cx={edge.x} cy={edge.y} r={edge.r} fill="none" stroke="#d47bff" strokeWidth={3 * u} />}
      {next && <circle cx={next.x} cy={next.y} r={next.r} fill="none" stroke="#fff" strokeWidth={3 * u} strokeDasharray={`${14 * u} ${8 * u}`} />}
    </g>
  );
}

/** Where you went down over past matches on this map: soft red spots that add up where you die a lot. */
function DeathHeat({ drops, u }: { drops: FnDrop[]; u: number }) {
  const deaths = drops.filter((d) => d.death).map((d) => d.death!);
  if (!deaths.length) return null;
  return (
    <g pointerEvents="none">
      <defs>
        <radialGradient id="fn-heat">
          <stop offset="0%" stopColor="#ff3048" stopOpacity={0.55} />
          <stop offset="100%" stopColor="#ff3048" stopOpacity={0} />
        </radialGradient>
      </defs>
      {deaths.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={Math.max(45, 40 * u)} fill="url(#fn-heat)" />
      ))}
    </g>
  );
}

/** A map marker (pin) placed in Fortnite, in the squad colour of whoever placed it. */
function MarkerIcon({ p, color, s }: { p: FnPoint; color: string; s: number }) {
  return (
    <g transform={`translate(${p.x} ${p.y}) scale(${s})`} pointerEvents="none">
      <title>Marker</title>
      <path d="M0,0 C-3,-7 -10,-11 -10,-19 A10,10 0 1 1 10,-19 C10,-11 3,-7 0,0 Z" fill={color} stroke={OUTLINE} strokeWidth={2.5} />
      <circle cy={-19} r={4} fill={OUTLINE} />
    </g>
  );
}

/** Keeps a zoomed view on the map. */
function clampView(v: { x: number; y: number; w: number }) {
  return { x: Math.min(SIZE - v.w, Math.max(0, v.x)), y: Math.min(SIZE - v.w, Math.max(0, v.y)), w: v.w };
}

/** The camera pans smoothly to each new view instead of jumping. */
function useSmoothView(target: { x: number; y: number; w: number }) {
  const [shown, setShown] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    let raf = 0;
    const from = { ...cur.current };
    const start = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 550);
      const next = { x: from.x + (target.x - from.x) * k, y: from.y + (target.y - from.y) * k, w: from.w + (target.w - from.w) * k };
      cur.current = next;
      setShown(next);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target.x, target.y, target.w]);
  return shown;
}

/** A Fortnite-style arrow pointing up (north), about 24 units tall; turned to face where you're heading. */
const ARROW = 'M0,-14 L11,11 L0,5 L-11,11 Z';

/** Which way you're moving (degrees, 0 = north), from the last stretch of the path that's long enough to trust. */
function heading(route: [number, number][]): number | null {
  const last = route[route.length - 1];
  if (!last) return null;
  for (let i = route.length - 2; i >= 0; i--) {
    const dx = last[0] - route[i][0];
    const dy = last[1] - route[i][1];
    if (Math.hypot(dx, dy) >= 8) return (Math.atan2(dx, -dy) * 180) / Math.PI;
  }
  return null;
}

const turned = new Map<string, number>();
/** Rotates the arrow, taking the short way round (so 350° → 10° turns 20°, not 340°). */
function turn(deg: number | null, key = 'me'): CSSProperties {
  if (deg === null) return {};
  const prev = turned.get(key) ?? deg;
  const next = prev + ((((deg - prev) % 360) + 540) % 360) - 180;
  turned.set(key, next);
  return { rotate: `${next}deg`, transition: 'rotate 0.4s ease-out' };
}

/** Dots slide to each new reading instead of jumping (readings come about twice a second). */
function glide(p: FnPoint): CSSProperties {
  return { transform: `translate(${p.x}px, ${p.y}px)`, transition: 'transform 0.55s linear' };
}

/** A linked friend's icons and planned route, each with a ring in their colour. */
function FriendMarks({ m, color, u }: { m: FnFriendMarks; color: string; u: number }) {
  const ring = (p: FnPoint, key: string | number, icon: React.ReactNode) => (
    <g key={key}>
      <circle cx={p.x} cy={p.y} r={15 * u} fill="none" stroke={color} strokeWidth={4 * u} pointerEvents="none" />
      {icon}
    </g>
  );
  return (
    <g>
      {m.plan.length > 1 && (
        <polyline points={m.plan.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={color} strokeOpacity={0.8} strokeWidth={4 * u} strokeDasharray={`${12 * u} ${9 * u}`} pointerEvents="none" />
      )}
      {m.plan.map((p, i) => (
        <g key={`s${i}`} transform={`translate(${p.x} ${p.y})`} pointerEvents="none">
          <circle r={11 * u} fill={color} stroke={OUTLINE} strokeWidth={3 * u} />
          <text y={5 * u} textAnchor="middle" fontSize={14 * u} fontWeight={800} fill={OUTLINE}>
            {i + 1}
          </text>
        </g>
      ))}
      {m.landing && ring(m.landing, 'l', <LandIcon p={m.landing} s={u} />)}
      {m.chests.map((c) => ring(c, `c${c.at}`, <ChestIcon p={c} s={u} color={KIND_COLOR[c.kind]} />))}
      {m.kills.map((k) => ring(k, `k${k.at}`, <KillIcon p={k} s={u} />))}
      {m.death && ring(m.death, 'd', <DeathIcon p={m.death} s={u} />)}
    </g>
  );
}

// ---------- Map icons (drawn 24 units across at s = 1, centred on the spot) ----------

const OUTLINE = '#0b0c1c';

/** Looted chest: a little chest in the chest kind's colour. */
function ChestIcon({ p, s, color }: { p: FnPoint; s: number; color: string }) {
  return (
    <g transform={`translate(${p.x} ${p.y}) scale(${s})`} pointerEvents="none">
      <title>Chest</title>
      <rect x={-10} y={-8} width={20} height={16} rx={3} fill={color} stroke={OUTLINE} strokeWidth={2.5} />
      <line x1={-10} y1={-2} x2={10} y2={-2} stroke={OUTLINE} strokeWidth={2.5} />
      <rect x={-2.5} y={-4.5} width={5} height={6} rx={1} fill={OUTLINE} />
    </g>
  );
}

/** Got a kill: a white skull. */
function KillIcon({ p, s }: { p: FnPoint; s: number }) {
  return (
    <g transform={`translate(${p.x} ${p.y}) scale(${s})`} pointerEvents="none">
      <title>Elimination</title>
      <path d="M0,-11 C7,-11 10,-6 10,-1 C10,3 8,5 6,6 L6,10 L-6,10 L-6,6 C-8,5 -10,3 -10,-1 C-10,-6 -7,-11 0,-11 Z" fill="#f4f5ff" stroke={OUTLINE} strokeWidth={2.5} />
      <circle cx={-4} cy={-1} r={2.8} fill={OUTLINE} />
      <circle cx={4} cy={-1} r={2.8} fill={OUTLINE} />
      <path d="M-2,10 L-2,7 M2,10 L2,7" stroke={OUTLINE} strokeWidth={1.8} />
    </g>
  );
}

/** Where you went down: a red X on a dark disc. */
function DeathIcon({ p, s }: { p: FnPoint; s: number }) {
  return (
    <g transform={`translate(${p.x} ${p.y}) scale(${s})`} pointerEvents="none">
      <title>Went down</title>
      <circle r={12} fill={OUTLINE} stroke="#ff4d5e" strokeWidth={2} />
      <path d="M-6,-6 L6,6 M6,-6 L-6,6" stroke="#ff4d5e" strokeWidth={4} strokeLinecap="round" />
    </g>
  );
}

/** Where you landed: a parachute (gold if you won that match). */
function LandIcon({ p, s, win }: { p: FnPoint; s: number; win?: boolean }) {
  const c = win ? '#ffcf3f' : '#4f8cff';
  return (
    <g transform={`translate(${p.x} ${p.y}) scale(${s})`} pointerEvents="none">
      <title>{win ? 'Landed (won)' : 'Landed'}</title>
      <path d="M-12,-2 A12,11 0 0 1 12,-2 Z" fill={c} stroke={OUTLINE} strokeWidth={2.5} strokeLinejoin="round" />
      <path d="M-11,-2 L0,9 L11,-2 M0,-2 L0,9" stroke={OUTLINE} strokeWidth={1.8} fill="none" />
      <circle cy={10} r={3} fill={OUTLINE} />
    </g>
  );
}

/** "D6" for a map spot. */
export function gridCell(p: FnPoint): string {
  const c = Math.min(9, Math.max(0, Math.floor(p.x / (SIZE / 10))));
  const r = Math.min(9, Math.max(0, Math.floor(p.y / (SIZE / 10))));
  return `${COLS[c]}${r + 1}`;
}
