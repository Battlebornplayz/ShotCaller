import { app } from 'electron';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { DotTracker, MINIMAP_SPAN, minimapArea, minimapGrey } from '../../shared/fortniteMap';
import type { FnChestKind, FnChestPin, FnDrop, FnMapState, FnMatchRecord, FnPoint, FnRoute } from '../../shared/fortnite';
import { captureScreen, type WindowArea } from '../skillshot/screenCapture';
import { getLocator, getSeasonMapStatus, onSeasonMap } from './seasonMap';
import { currentMatchInfo, onMatchSaved } from './tracker';

/**
 * Your dot on the season map, read from the minimap about once a second while a match is on and Fortnite is in
 * front. Also keeps this match's route, landing and death spots and a pin for each chest (where the dot was),
 * and saves them with the match in userData/fortnite/routes/. Teammates' arrows are copied from the minimap
 * in team modes. Screen copies only.
 */

const READ_EVERY_MS = 500;
/** A route point is added when you've moved this far (map px) or this long has passed. */
const ROUTE_STEP_PX = 2;
const ROUTE_STEP_MS = 5000;
/** A chest pin needs a sure dot from no longer ago than this. */
const PIN_MAX_AGE_MS = 4000;

type IndexEntry = FnDrop;

const routesDir = () => path.join(app.getPath('userData'), 'fortnite', 'routes');
const indexFile = () => path.join(routesDir(), 'index.json');

let tracker: DotTracker | null = null;
let trackerFor: unknown = null;
let lastReadAt = 0;
let matchStartedAt: number | null = null;
let points: [number, number, number][] = [];
let pins: FnChestPin[] = [];
let landing: FnPoint | null = null;
let death: FnPoint | null = null;
let lastLife: 'alive' | 'down' | null = null;
let index: IndexEntry[] = [];
let state: FnMapState = emptyState();
const listeners = new Set<(s: FnMapState) => void>();

function emptyState(): FnMapState {
  return { map: getSeasonMapStatus(), dot: null, teammates: [], route: [], chests: [], landing: null, squad: [] };
}

export function getLiveMap(): FnMapState {
  return state;
}

/** Squad-link friends changed (from squad.ts). */
export function setSquadDots(squad: FnMapState['squad']): void {
  push({ squad });
}

export function onLiveMap(fn: (s: FnMapState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function push(patch: Partial<FnMapState>): void {
  state = { ...state, ...patch, map: getSeasonMapStatus() };
  for (const fn of listeners) fn(state);
}

/** Starts a fresh match: forgets the last match's dot, route and pins. */
function resetMatch(startedAt: number | null): void {
  matchStartedAt = startedAt;
  points = [];
  pins = [];
  landing = null;
  death = null;
  lastLife = null;
  tracker?.reset();
  push({ dot: null, teammates: [], route: [], chests: [], landing: null });
}

/** Called by the screen reader on each look while a match is on and Fortnite is in front. */
export function readLiveMap(area: WindowArea, life: 'alive' | 'down' | null, enabled: boolean): void {
  const info = currentMatchInfo();
  if (!info) return;
  if (info.startedAt !== matchStartedAt) resetMatch(info.startedAt);
  // You went down: the last good spot is where you died.
  if (lastLife === 'alive' && life === 'down' && state.dot) death = { x: state.dot.x, y: state.dot.y };
  if (life) lastLife = life;
  if (!enabled || life === 'down') return;
  const locator = getLocator();
  if (!locator) return;
  if (trackerFor !== locator) {
    tracker = new DotTracker(locator);
    trackerFor = locator;
  }
  const now = Date.now();
  if (now - lastReadAt < READ_EVERY_MS) return;
  lastReadAt = now;
  const box = minimapArea(area.width, area.height);
  const pixels = captureScreen({ x: area.x + box.x, y: area.y + box.y, width: box.width, height: box.height });
  if (!pixels) return;
  const fix = tracker!.update(minimapGrey(pixels, box.width, box.height), now);
  if (!fix) return;
  const x = Math.round(fix.x);
  const y = Math.round(fix.y);
  const patch: Partial<FnMapState> = { dot: { x, y, state: fix.state, at: now } };
  if (fix.state === 'sure') {
    // The first sure spot after the bus is where you landed (the skydive zoom doesn't match, so this comes
    // once you're on foot).
    if (!landing && info.busAt !== null) {
      landing = { x, y };
      patch.landing = landing;
    }
    const prev = points[points.length - 1];
    const secs = Math.round((now - info.startedAt) / 1000);
    if (!prev || Math.hypot(prev[0] - x, prev[1] - y) >= ROUTE_STEP_PX || secs - prev[2] >= ROUTE_STEP_MS / 1000) {
      points.push([x, y, secs]);
      patch.route = points.map(([px, py]) => [px, py] as [number, number]);
    }
    patch.teammates = !info.teamSize || info.teamSize === 'solo' ? [] : readTeammates(pixels, box.width, box.height, x, y);
  }
  push(patch);
}

/** A chest just counted: pin it where your dot is, if the dot is sure and fresh. */
export function pinChest(kind: FnChestKind): void {
  const dot = state.dot;
  if (!dot || dot.state !== 'sure' || Date.now() - dot.at > PIN_MAX_AGE_MS) return;
  pins.push({ x: dot.x, y: dot.y, kind, at: Date.now() });
  push({ chests: [...pins] });
}

// ---------- Teammates (team modes only) ----------

/**
 * Teammates show on your minimap as small arrows in their squad colour. Strongly coloured blobs of arrow size
 * in the squad colours (yellow, blue, green) are taken; pink/purple is skipped because the storm tints
 * everything that colour. Not checked on a real team match yet.
 */
const SQUAD: { name: string; color: string; hue: [number, number] }[] = [
  { name: 'yellow', color: '#ffd84a', hue: [40, 62] },
  { name: 'green', color: '#6cc24a', hue: [85, 150] },
  { name: 'blue', color: '#3da5ff', hue: [190, 215] },
];

function hsv(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx / 255];
}

function readTeammates(bgra: Uint8Array, w: number, h: number, meX: number, meY: number): (FnPoint & { color: string })[] {
  const k = w / 252;
  const minPx = Math.round(25 * k * k);
  const maxPx = Math.round(260 * k * k);
  const out: (FnPoint & { color: string })[] = [];
  for (const sq of SQUAD) {
    const hit = new Uint8Array(w * h);
    for (let y = Math.round(h * 0.14); y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        const i = (y * w + x) * 4;
        const [hu, s, v] = hsv(bgra[i + 2], bgra[i + 1], bgra[i]);
        if (s > 0.6 && v > 0.75 && hu >= sq.hue[0] && hu <= sq.hue[1]) hit[y * w + x] = 1;
      }
    }
    // Blobs by flood fill.
    const seen = new Uint8Array(w * h);
    for (let start = 0; start < hit.length; start++) {
      if (!hit[start] || seen[start]) continue;
      const stack = [start];
      seen[start] = 1;
      let n = 0;
      let sx = 0;
      let sy = 0;
      while (stack.length) {
        const p = stack.pop()!;
        n++;
        sx += p % w;
        sy += Math.floor(p / w);
        for (const q of [p - 1, p + 1, p - w, p + w]) {
          if (q >= 0 && q < hit.length && hit[q] && !seen[q]) {
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
      if (n < minPx || n > maxPx) continue;
      const cx = sx / n;
      const cy = sy / n;
      // Your own arrow sits in the middle.
      if (Math.hypot(cx - w / 2, cy - h / 2) < w * 0.06) continue;
      const scale = MINIMAP_SPAN / w;
      out.push({ x: Math.round(meX + (cx - w / 2) * scale), y: Math.round(meY + (cy - h / 2) * scale), color: sq.color });
    }
  }
  return out.slice(0, 3);
}

// ---------- Saving ----------

async function saveRoute(m: FnMatchRecord): Promise<void> {
  const mapId = getSeasonMapStatus().id;
  if (!mapId || (!points.length && !pins.length)) return;
  const route: FnRoute = { matchId: m.id, mapId, points, chests: pins, landing, death };
  const entry: IndexEntry = { matchId: m.id, mapId, startedAt: m.startedAt, placement: m.placement, landing, death, chests: m.chests };
  index.push(entry);
  try {
    await fsp.mkdir(routesDir(), { recursive: true });
    await fsp.writeFile(path.join(routesDir(), `${m.id}.json`), JSON.stringify(route));
    await fsp.writeFile(indexFile(), JSON.stringify(index));
  } catch (err) {
    console.error('[fortnite] could not save the route:', err);
  }
}

/** One match's route, for the recap (null when none was saved). */
export async function getRoute(matchId: string): Promise<FnRoute | null> {
  if (!/^[\w-]+$/.test(matchId)) return null;
  try {
    return JSON.parse(await fsp.readFile(path.join(routesDir(), `${matchId}.json`), 'utf8')) as FnRoute;
  } catch {
    return null;
  }
}

/** Landing and death spots on the current season's map, for drop stats. Older maps' pins stay archived. */
export function getDrops(): IndexEntry[] {
  const id = getSeasonMapStatus().id;
  return index.filter((e) => e.mapId === id);
}

export function initLiveMap(): void {
  try {
    const raw = JSON.parse(fs.readFileSync(indexFile(), 'utf8')) as unknown;
    index = Array.isArray(raw) ? (raw as IndexEntry[]) : [];
  } catch {
    index = [];
  }
  onSeasonMap(() => push({}));
  onMatchSaved((m) => {
    void saveRoute(m).then(() => resetMatch(null));
  });
}
