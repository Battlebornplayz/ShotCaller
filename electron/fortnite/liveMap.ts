import { app } from 'electron';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { DotTracker, MINIMAP_SPAN, minimapArea, minimapGrey } from '../../shared/fortniteMap';
import type { FnChestKind, FnChestPin, FnDotCheck, FnKillPin, FnDrop, FnMapPanel, FnMapState, FnMapView, FnMatchRecord, FnPoint, FnRoute, FnStorm } from '../../shared/fortnite';
import { hueGap, readMinimapMarkers, type Circle, type FullMapMarks, type SquadColor } from '../../shared/fortniteFullMap';
import { type WindowArea } from '../skillshot/screenCapture';
import { gameSpace, grabGame } from './gameArea';
import { resizeBgra } from '../../shared/fortniteVision';
import { getLocator, getPlaces, getSeasonMapStatus, onSeasonMap } from './seasonMap';
import { currentMatchInfo, onMatchSaved } from './tracker';

/**
 * Your dot on the season map, read from the minimap about once a second while a match is on and Fortnite is in
 * front. Also keeps this match's route, landing and death spots and a pin for each chest (where the dot was),
 * and saves them with the match in userData/fortnite/routes/. Teammates' arrows are copied from the minimap
 * in team modes. Screen copies only.
 */

const READ_EVERY_MS = 500;
/** Fastest believable travel between route points, map px per second (~90 m/s: launch pads, fast cars). */
const MAX_STEP_PX_PER_S = 60;
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
let kills: FnKillPin[] = [];
let plan: FnPoint[] = [];
let planStep = 0;
/** You reached a planned stop when your dot is this close (map px). */
const STOP_REACHED_PX = 28;
const planFile = () => path.join(app.getPath('userData'), 'fortnite', 'plan.json');
let lastLife: 'alive' | 'down' | null = null;
let checks: FnDotCheck[] = [];
let distance = 0;
/** Squad colours from the HUD list (settled: the same twice in a row). */
let colors: { me: SquadColor | null; mates: SquadColor[] } = { me: null, mates: [] };
let colorsSeen = '';
/** Squad-link friend id -> their squad colour, matched from arrows on your screen. */
const friendColors = new Map<string, string>();
/** A dot check counts as close within this many map px (~18 m). */
const CLOSE_PX = 12;
let index: IndexEntry[] = [];
let state: FnMapState = emptyState();
const listeners = new Set<(s: FnMapState) => void>();

function emptyState(): FnMapState {
  return {
    map: getSeasonMapStatus(),
    dot: null,
    teammates: [],
    route: [],
    chests: [],
    landing: null,
    death: null,
    kills: [],
    plan,
    planStep,
    squad: [],
    fullMap: { open: false, view: null, height: 1080 },
    markers: [],
    storm: null,
    colors: { me: null, mates: [] },
    accuracy: { checks: 0, close: 0, avgErr: null },
    distance: 0,
    panel: null,
  };
}

export function getLiveMap(): FnMapState {
  return state;
}

/** Squad-link friends changed (from squad.ts). */
export function setSquadDots(squad: FnMapState['squad']): void {
  push({ squad: withColors(squad) });
}

/** Friends get their real squad colour once it's been matched. */
function withColors(squad: FnMapState['squad']): FnMapState['squad'] {
  return squad.map((f) => (friendColors.has(f.id) ? { ...f, color: friendColors.get(f.id) } : f));
}

/** A teammate arrow seen at `p` in `color`: a linked friend whose own dot is right there gets that colour. */
function matchFriendColor(p: FnPoint, color: string): void {
  let best: { id: string; d: number } | null = null;
  for (const f of state.squad) {
    if (!f.dot || Date.now() - f.dot.at > 4000) continue;
    const d = Math.hypot(f.dot.x - p.x, f.dot.y - p.y);
    if (d <= 40 && (!best || d < best.d)) best = { id: f.id, d };
  }
  if (best && friendColors.get(best.id) !== color) {
    friendColors.set(best.id, color);
    push({ squad: withColors(state.squad) });
  }
}

/** Squad colours read from the HUD list (yours last). Kept once the same list is seen twice. */
export function setSquadColors(list: SquadColor[]): void {
  if (list.length < 2) return;
  const key = list.map((c) => c.color).join(',');
  if (key !== colorsSeen) {
    colorsSeen = key;
    return;
  }
  const me = list[list.length - 1];
  const mates = list.slice(0, -1);
  const same = (a: SquadColor[], b: SquadColor[]) => a.length === b.length && a.every((c, i) => Math.abs(c.hue - b[i].hue) < 12);
  if (colors.me && Math.abs(colors.me.hue - me.hue) < 12 && same(colors.mates, mates)) return;
  colors = { me, mates };
  push({ colors: { me: me.color, mates: mates.map((c) => c.color) } });
}

export function getSquadColors(): { me: SquadColor | null; mates: SquadColor[] } {
  return colors;
}

/** Fortnite's full map opened, moved or closed (from fullMap.ts). */
export function setFullMapView(view: FnMapView | null, open: boolean, height = 1080): void {
  push({ fullMap: { open, view: open ? view : null, height } });
}

/** The full map's left panel was read (from fullMap.ts). */
export function setMapPanel(panel: FnMapPanel): void {
  const info = currentMatchInfo();
  if (!info) return;
  if (info.startedAt !== matchStartedAt) resetMatch(info.startedAt);
  push({ panel });
}

/** A storm read from a full map (yours, or a linked friend's): the newest wins. */
export function offerStorm(storm: FnStorm | null | undefined): void {
  if (!storm || (!storm.next && !storm.edge)) return;
  if (state.storm && state.storm.at >= storm.at) return;
  push({ storm });
}

/**
 * What Fortnite's full map shows (from fullMap.ts): your arrow checks the dot and puts it right, teammates'
 * arrows and markers come in their squad colours, and the storm is kept until the next look.
 */
export function fromFullMap(marks: FullMapMarks, storm: { next: Circle | null; edge: Circle | null } | null): void {
  const info = currentMatchInfo();
  if (!info) return;
  if (info.startedAt !== matchStartedAt) resetMatch(info.startedAt);
  const now = Date.now();
  const patch: Partial<FnMapState> = {};
  // Your arrow far from a sure dot is only believed when it's seen in the same spot twice in a row.
  let me = marks.me;
  // A strong, fresh minimap match beats an M "arrow" that disagrees: on the bus Fortnite draws a big ship icon
  // instead of your arrow, and its white outline reads as an arrow (75-130 px off, a different spot each look).
  if (me && miniStrong && now - miniStrong.at < 1500 && Math.hypot(miniStrong.x - me.x, miniStrong.y - me.y) > DISAGREE_PX) me = null;
  if (me && state.dot?.state === 'sure' && now - state.dot.at < 3000 && Math.hypot(state.dot.x - me.x, state.dot.y - me.y) > FAR_ARROW_PX) {
    const same = farArrow && Math.hypot(farArrow.x - me.x, farArrow.y - me.y) < 12;
    farArrow = { x: me.x, y: me.y };
    if (!same) me = null;
  } else farArrow = null;
  if (me) {
    const x = Math.round(me.x);
    const y = Math.round(me.y);
    const dot = state.dot;
    // How far off the dot was (only when it was a sure, fresh read from the minimap).
    const err = dot && dot.state === 'sure' && now - dot.at < 2500 ? Math.hypot(dot.x - x, dot.y - y) : null;
    const last = checks[checks.length - 1];
    // One check per opening of the map (or every 5 s while it stays open).
    if (!last || now - last.at > 5000) {
      checks.push({ at: now, err: err === null ? null : Math.round(err) });
      patch.accuracy = accuracyOf(checks);
    }
    tracker?.fix(x, y, now);
    patch.dot = { x, y, state: 'sure', at: now };
  }
  // Your own colour can't be a teammate's arrow (yours is white), only your marker.
  const mates = marks.mates.filter((m) => !colors.me || hueGap(m.hue, colors.me.hue) >= 12);
  if (mates.length) {
    patch.teammates = mates.map((m) => ({ x: Math.round(m.x), y: Math.round(m.y), color: m.color }));
    for (const m of mates) matchFriendColor(m, m.color);
  }
  // M shows every marker: what it shows is the whole list (one marker per player).
  if (marks.markers.length || state.markers.length) patch.markers = marks.markers.map((m) => ({ x: Math.round(m.x), y: Math.round(m.y), color: m.color, at: now }));
  if (storm && (storm.next || storm.edge)) patch.storm = { next: round(storm.next), edge: round(storm.edge), at: now };
  push(patch);
}

/** A minimap match this strong is trusted over a disagreeing M arrow (on-foot matches are 0.33-0.9). */
const STRONG_MINI = 0.6;
/** An M arrow this far (map px, ~58 m) from a strong minimap match is not taken. */
const DISAGREE_PX = 40;
let miniStrong: { x: number; y: number; at: number } | null = null;

/** A full-map arrow this far (map px, ~290 m) from a sure dot needs a second look to be taken. */
const FAR_ARROW_PX = 200;
let farArrow: FnPoint | null = null;

const round = (c: Circle | null) => (c ? { x: Math.round(c.x), y: Math.round(c.y), r: Math.round(c.r) } : null);

function accuracyOf(list: FnDotCheck[]): FnMapState['accuracy'] {
  const known = list.filter((c) => c.err !== null).map((c) => c.err!);
  return {
    checks: list.length,
    close: known.filter((e) => e <= CLOSE_PX).length,
    avgErr: known.length ? Math.round(known.reduce((a, b) => a + b, 0) / known.length) : null,
  };
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
  kills = [];
  planStep = 0;
  lastLife = null;
  checks = [];
  distance = 0;
  miniStrong = null;
  tracker?.reset();
  push({ dot: null, teammates: [], route: [], chests: [], landing: null, death: null, kills: [], planStep, markers: [], storm: null, accuracy: accuracyOf([]), distance: 0, panel: null });
}

/** Called by the screen reader on each look while a match is on and Fortnite is in front. */
export function readLiveMap(area: WindowArea, life: 'alive' | 'down' | null, enabled: boolean): void {
  const info = currentMatchInfo();
  if (!info) return;
  if (info.startedAt !== matchStartedAt) resetMatch(info.startedAt);
  // You went down: the last good spot is where you died.
  if (lastLife === 'alive' && life === 'down' && state.dot) {
    death = { x: state.dot.x, y: state.dot.y };
    push({ death });
  }
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
  const g = gameSpace(area);
  const screenBox = minimapArea(g.width, g.height);
  const raw = grabGame(area, g, screenBox);
  if (!raw) return;
  // Same size on every screen, so the map matching and teammate arrows see what they were tuned on.
  const at1080 = minimapArea(1920, 1080);
  const box = { width: at1080.width, height: at1080.height };
  const pixels = resizeBgra(raw, screenBox.width, screenBox.height, box.width, box.height);
  const fix = tracker!.update(minimapGrey(pixels, box.width, box.height), now);
  if (!fix) return;
  const x = Math.round(fix.x);
  const y = Math.round(fix.y);
  const patch: Partial<FnMapState> = { dot: { x, y, state: fix.state, at: now } };
  miniStrong = fix.state === 'sure' && fix.score >= STRONG_MINI ? { x, y, at: now } : null;
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
      // Distance: add each step, but not a jump faster than anything you can travel (a bad read).
      if (prev) {
        const step = Math.hypot(prev[0] - x, prev[1] - y);
        if (step <= MAX_STEP_PX_PER_S * Math.max(1, secs - prev[2])) {
          distance += step;
          patch.distance = Math.round(distance);
        }
      }
      points.push([x, y, secs]);
      patch.route = points.map(([px, py]) => [px, py] as [number, number]);
    }
    // GPS: move on to the next planned stop once you get close to this one.
    if (planStep < plan.length && Math.hypot(plan[planStep].x - x, plan[planStep].y - y) <= STOP_REACHED_PX) {
      planStep++;
      patch.planStep = planStep;
    }
    const mk = markersFromMinimap(pixels, box.width, box.height, x, y, now);
    if (mk) patch.markers = mk;
    if (info.teamSize && info.teamSize !== 'solo') {
      const mates = readTeammates(pixels, box.width, box.height, x, y);
      patch.teammates = mates;
      for (const m of mates) matchFriendColor(m, m.color);
    } else patch.teammates = [];
  }
  push(patch);
}

/**
 * Marker pins on the minimap (yours and teammates'), put on the map from your sure dot. Each player has one
 * marker, so a pin in a colour replaces that colour's last one. A kept marker that should be in view but
 * hasn't been seen on 3 looks in a row was taken down.
 */
function markersFromMinimap(bgra: Uint8Array, w: number, h: number, meX: number, meY: number, now: number): FnMapState['markers'] | null {
  const squad = colors.me ? [...colors.mates, colors.me] : colors.mates;
  const seen = readMinimapMarkers(bgra, w, h, squad);
  const scale = MINIMAP_SPAN / 252;
  let list = state.markers;
  let changed = false;
  for (const m of seen) {
    const x = Math.round(meX + m.dx * scale);
    const y = Math.round(meY + m.dy * scale);
    const old = list.find((o) => o.color === m.color);
    if (old && Math.hypot(old.x - x, old.y - y) < 6) {
      missed.delete(old.color);
      continue;
    }
    list = [...list.filter((o) => o.color !== m.color), { x, y, color: m.color, at: now }];
    missed.delete(m.color);
    changed = true;
  }
  // Markers well inside the minimap's view but not seen.
  const inside = (MINIMAP_SPAN / 2) * 0.6;
  for (const o of list) {
    if (seen.some((m) => m.color === o.color)) continue;
    if (Math.abs(o.x - meX) > inside || Math.abs(o.y - meY) > inside) continue;
    const n = (missed.get(o.color) ?? 0) + 1;
    missed.set(o.color, n);
    if (n >= 3) {
      list = list.filter((k) => k !== o);
      missed.delete(o.color);
      changed = true;
    }
  }
  return changed ? list : null;
}

const missed = new Map<string, number>();

/** A chest just counted: pin it where your dot is, if the dot is sure and fresh. */
export function pinChest(kind: FnChestKind): void {
  const dot = state.dot;
  if (!dot || dot.state !== 'sure' || Date.now() - dot.at > PIN_MAX_AGE_MS) return;
  pins.push({ x: dot.x, y: dot.y, kind, at: Date.now() });
  push({ chests: [...pins] });
}

/** Your eliminations count went up: pin it where your dot is (if the dot is fresh). */
export function pinKill(): void {
  const dot = state.dot;
  if (!dot || Date.now() - dot.at > PIN_MAX_AGE_MS) return;
  kills.push({ x: dot.x, y: dot.y, at: Date.now() });
  push({ kills: [...kills] });
}

/** Sets your planned route (an empty list clears it). Kept between matches. */
export function setPlan(next: FnPoint[]): void {
  plan = next.slice(0, 30).map((p) => ({ x: Math.round(Math.min(2048, Math.max(0, p.x))), y: Math.round(Math.min(2048, Math.max(0, p.y))) }));
  planStep = 0;
  push({ plan, planStep });
  void fsp.mkdir(path.dirname(planFile()), { recursive: true }).then(() => fsp.writeFile(planFile(), JSON.stringify(plan))).catch(() => {});
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

/** Hue inside a range that may wrap round 0/360. */
function inHue(h: number, [a, b]: [number, number]): boolean {
  if (a < 0) return h >= a + 360 || h <= b;
  if (b > 360) return h >= a || h <= b - 360;
  return h >= a && h <= b;
}

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
  // Your teammates' real colours from the HUD list when known (matched closely, so even pink works);
  // otherwise the usual yellow / green / blue.
  const list = colors.mates.length ? colors.mates.map((c) => ({ name: c.color, color: c.color, hue: [c.hue - 12, c.hue + 12] as [number, number] })) : SQUAD;
  for (const sq of list) {
    const hit = new Uint8Array(w * h);
    for (let y = Math.round(h * 0.14); y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        const i = (y * w + x) * 4;
        const [hu, s, v] = hsv(bgra[i + 2], bgra[i + 1], bgra[i]);
        if (s > 0.6 && v > 0.75 && inHue(hu, sq.hue)) hit[y * w + x] = 1;
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
  const route: FnRoute = { matchId: m.id, mapId, points, chests: pins, landing, death, kills, checks, distance: Math.round(distance) };
  const entry: IndexEntry = { matchId: m.id, mapId, startedAt: m.startedAt, placement: m.placement, landing, death, chests: m.chests, distance: Math.round(distance) };
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
  const places = getPlaces();
  return index
    .filter((e) => e.mapId === id)
    .map((e) => {
      if (!e.landing || !places.length) return e;
      // The nearest named place, if you landed within ~230 m of it.
      let best: { name: string; d: number } | null = null;
      for (const p of places) {
        const d = Math.hypot(p.x - e.landing.x, p.y - e.landing.y);
        if (d <= PLACE_RADIUS_PX && (!best || d < best.d)) best = { name: p.name, d };
      }
      return best ? { ...e, place: best.name } : e;
    });
}

/** A landing counts for a place within this many map px of its centre (~230 m). */
const PLACE_RADIUS_PX = 160;

export function initLiveMap(): void {
  try {
    const raw = JSON.parse(fs.readFileSync(indexFile(), 'utf8')) as unknown;
    index = Array.isArray(raw) ? (raw as IndexEntry[]) : [];
  } catch {
    index = [];
  }
  try {
    const raw = JSON.parse(fs.readFileSync(planFile(), 'utf8')) as unknown;
    if (Array.isArray(raw)) plan = (raw as FnPoint[]).filter((p) => typeof p?.x === 'number' && typeof p?.y === 'number');
  } catch {
    plan = [];
  }
  push({ plan, planStep: 0 });
  onSeasonMap(() => push({}));
  onMatchSaved((m) => {
    void saveRoute(m).then(() => resetMatch(null));
  });
}
