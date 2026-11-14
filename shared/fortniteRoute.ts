// Route planner maths shared by the main process and the renderer. Pure: no Electron, no files.
import { MAP_PX_METRES, type FnChestSpot, type FnDrop, type FnPoint, type FnStop, type FnStopGoal } from './fortnite';

export const STOP_GOALS: { id: FnStopGoal; label: string; color: string }[] = [
  { id: 'loot', label: 'Loot', color: '#ffcf3f' },
  { id: 'fight', label: 'Fight', color: '#ff4d5e' },
  { id: 'heal', label: 'Heal', color: '#3ddc84' },
  { id: 'rotate', label: 'Rotate', color: '#4f8cff' },
];

export const goalColor = (g: FnStopGoal | undefined): string => STOP_GOALS.find((s) => s.id === g)?.color ?? '#dfe2f5';

/** Rough on-foot speed used for the time estimates, metres per second. An estimate, not a measured figure. */
export const RUN_MPS = 7;

/** Cleans one stop from anywhere (a saved file, a friend's message, the UI): numbers inside the map, short text. */
export function cleanStop(o: unknown): FnStop | null {
  const s = o as Partial<FnStop> | null;
  if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) return null;
  const stop: FnStop = { x: Math.round(Math.min(2048, Math.max(0, s.x as number))), y: Math.round(Math.min(2048, Math.max(0, s.y as number))) };
  const name = typeof s.name === 'string' ? s.name.trim().slice(0, 24) : '';
  if (name) stop.name = name;
  if (STOP_GOALS.some((g) => g.id === s.goal)) stop.goal = s.goal;
  const note = typeof s.note === 'string' ? s.note.trim().slice(0, 80) : '';
  if (note) stop.note = note;
  return stop;
}

export function cleanStops(a: unknown, max = 30): FnStop[] {
  return (Array.isArray(a) ? a : []).slice(0, max).flatMap((o) => {
    const s = cleanStop(o);
    return s ? [s] : [];
  });
}

const dist = (a: FnPoint, b: FnPoint) => Math.hypot(a.x - b.x, a.y - b.y);

/** Metres between two spots on the map. */
export const metres = (a: FnPoint, b: FnPoint): number => dist(a, b) * MAP_PX_METRES;

/** Each leg's length in metres (the first stop's leg is from `from`, when you give one). */
export function legs(stops: FnStop[], from?: FnPoint | null): number[] {
  return stops.map((s, i) => (i === 0 ? (from ? metres(from, s) : 0) : metres(stops[i - 1], s)));
}

export const totalMetres = (stops: FnStop[]): number => legs(stops).reduce((a, b) => a + b, 0);

/** "420 m" / "1.3 km". */
export function fmtMetres(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`;
}

/** "0:45" for a number of seconds. */
export function fmtSecs(s: number): string {
  const r = Math.round(s);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
}

/** The name shown for a stop: its label, or its number. */
export const stopLabel = (s: FnStop, i: number): string => s.name || `Stop ${i + 1}`;

// ---------- Score ----------

/** Share of the planned stops you reached counts for this many points; staying on the line for the rest. */
export const SCORE_STOPS_POINTS = 70;
export const SCORE_LINE_POINTS = 30;
/** A point of your path counts as "on the line" within this many map px (~60 m) of a planned leg. */
export const ON_LINE_PX = 40;

function distToSegment(p: FnPoint, a: FnPoint, b: FnPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export interface PlanScore {
  score: number;
  reached: number;
  total: number;
  /** Share (0-1) of your path, up to your last reached stop, that stayed on the planned line. */
  onLine: number;
}

/**
 * How well you followed your plan, 0-100: 70 points for the share of stops reached (in order), 30 for the share
 * of your path (up to the last stop you reached) that stayed within ~60 m of the planned line.
 */
export function scorePlan(stops: FnStop[], reached: number, path: [number, number, number][], reachedAt: number[]): PlanScore | null {
  if (!stops.length) return null;
  const r = Math.max(0, Math.min(stops.length, reached));
  let onLine = 0;
  if (r > 0 && path.length) {
    const until = reachedAt[r - 1] ?? Infinity;
    const used = path.filter((p) => p[2] <= until);
    if (used.length) {
      const line = stops.slice(0, r);
      const near = used.filter((p) => line.some((s, i) => distToSegment({ x: p[0], y: p[1] }, i ? line[i - 1] : s, s) <= ON_LINE_PX));
      onLine = near.length / used.length;
    }
  }
  const score = Math.round((SCORE_STOPS_POINTS * r) / stops.length + SCORE_LINE_POINTS * onLine);
  return { score, reached: r, total: stops.length, onLine };
}

// ---------- Suggestions from your own history ----------

/** Groups your looted-chest pins into spots ~50 m across, with how many you've opened there. Most-visited first. */
export function clusterChests(pins: FnPoint[], radius = 36): FnChestSpot[] {
  const spots: { x: number; y: number; n: number }[] = [];
  for (const p of pins) {
    const hit = spots.find((s) => dist(s, p) <= radius);
    if (hit) {
      hit.x = (hit.x * hit.n + p.x) / (hit.n + 1);
      hit.y = (hit.y * hit.n + p.y) / (hit.n + 1);
      hit.n++;
    } else spots.push({ x: p.x, y: p.y, n: 1 });
  }
  return spots.map((s) => ({ x: Math.round(s.x), y: Math.round(s.y), n: s.n })).sort((a, b) => b.n - a.n);
}

/** Your best drop: the landing area (within ~150 m) with the best average placement; ties go to the most visited. */
export function bestDrop(drops: FnDrop[]): FnPoint | null {
  const areas: { x: number; y: number; ps: number[]; n: number }[] = [];
  for (const d of drops) {
    if (!d.landing) continue;
    const hit = areas.find((a) => dist(a, d.landing!) <= 100);
    if (hit) {
      hit.x = (hit.x * hit.n + d.landing.x) / (hit.n + 1);
      hit.y = (hit.y * hit.n + d.landing.y) / (hit.n + 1);
      hit.n++;
      if (d.placement) hit.ps.push(d.placement);
    } else areas.push({ x: d.landing.x, y: d.landing.y, n: 1, ps: d.placement ? [d.placement] : [] });
  }
  const avg = (a: { ps: number[] }) => (a.ps.length ? a.ps.reduce((x, y) => x + y, 0) / a.ps.length : 99);
  const best = areas.sort((a, b) => avg(a) - avg(b) || b.n - a.n)[0];
  return best ? { x: Math.round(best.x), y: Math.round(best.y) } : null;
}

/**
 * A loot route from your own history: start at your best drop, then walk to the chest spots you open most, always
 * picking the closest of the busy ones next (within ~700 m of the start). `max` stops, the drop included.
 */
export function suggestLootRoute(drops: FnDrop[], spots: FnChestSpot[], max = 6): FnStop[] {
  const start = bestDrop(drops) ?? (spots[0] ? { x: spots[0].x, y: spots[0].y } : null);
  if (!start) return [];
  const route: FnStop[] = [{ ...start, name: 'Drop', goal: 'loot' }];
  const pool = spots.filter((s) => s.n >= 2 && dist(s, start) <= 480 && dist(s, start) > 40).slice(0, 24);
  let at: FnPoint = start;
  while (route.length < max && pool.length) {
    // Closest first, but a spot you've opened often is worth a longer walk.
    let bi = 0;
    let bs = Infinity;
    pool.forEach((s, i) => {
      const score = dist(at, s) / Math.sqrt(s.n);
      if (score < bs) {
        bs = score;
        bi = i;
      }
    });
    const [pick] = pool.splice(bi, 1);
    if (dist(at, pick) < 40) continue;
    route.push({ x: pick.x, y: pick.y, name: `Chests ×${pick.n}`, goal: 'loot' });
    at = pick;
  }
  return route;
}
