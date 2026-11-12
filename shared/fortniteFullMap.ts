/**
 * Fortnite's full map (the M screen): spots it, and works out where the season map is drawn on it (size and
 * position; you can zoom and pan it). With that, ShotCaller can draw its own layer exactly over Fortnite's map
 * and check the live dot against your arrow. Pure code, no Electron. Screen pixels are in "1920-wide" units:
 * the game picture scaled to 1920 across (1920x1080 on 16:9, 1920x1200 on 16:10). Fortnite lays the M screen
 * out by width: the top bar and side panels keep their spots, the bottom buttons stay on the bottom edge.
 *
 * Matching: both pictures are turned to grey, put on a coarse grid at the same scale, high-passed (fine detail
 * only, so the storm tint and the dark storm disc drop out) and compared with masked, brightness-normalised
 * correlation. Panels, the top bar and bright labels/icons are left out. A whole search tries ~30 zoom levels;
 * once found, the next look only searches close to the last view.
 */

import { type GreyImage, bgraToGrey, highPass, resize } from './fortniteMap';

/** Where the season map sits on screen: screen = map * scale + (x, y), in 1080p screen pixels. */
export interface MapView {
  scale: number;
  x: number;
  y: number;
}

export interface ViewFix extends MapView {
  score: number;
}

/**
 * The view after RESET for a picture `h` high (1920 wide): measured 0.590 at 1080 (your recording) and 0.660 at
 * 1200 (a 16:10 laptop); the map's middle sits at x 960, y ~47% down.
 */
export function defaultView(h = 1080): MapView {
  const scale = 0.59 + ((h - 1080) * (0.66 - 0.59)) / 120;
  return { scale, x: 960 - 1024 * scale, y: h * 0.4725 - 1024 * scale };
}

export const DEFAULT_VIEW: MapView = defaultView(1080);

const W = 1920;
/** Height of the picture being read (1080 on 16:9, 1200 on 16:10); set from the picture at each entry point. */
let H = 1080;
let PANELS = panelsFor(1080);

/** Sets H from a 1920-wide BGRA picture. */
function heightFrom(bgra: Uint8Array): void {
  const h = Math.round(bgra.length / (W * 4));
  if (h === H) return;
  H = h;
  PANELS = panelsFor(h);
}

/** Height of a game picture scaled to 1920 wide. */
export function heightAt1920(width: number, height: number): number {
  return Math.round((height * W) / width);
}

/**
 * Is this the full map screen? The top bar is flat dark navy and the "MAP" tab has a yellow line under it.
 * `bgra` is the whole game picture at 1920x1080.
 */
export function isFullMap(bgra: Uint8Array, width = W): boolean {
  // Works on any window size: the screen is laid out by its width.
  const k = width / W;
  const at = (x: number, y: number) => {
    const i = (Math.round(y * k) * width + Math.round(x * k)) * 4;
    return [bgra[i + 2], bgra[i + 1], bgra[i]];
  };
  let navy = 0;
  for (let x = 300; x <= 1300; x += 50) {
    const [r, g, b] = at(x, 30);
    if (r < 40 && g < 45 && b > 45 && b < 120) navy++;
  }
  let yellow = 0;
  for (let x = 30; x <= 110; x += 10) {
    const [r, g, b] = at(x, 67);
    if (r > 200 && g > 200 && b < 110) yellow++;
  }
  return navy >= 18 && yellow >= 6;
}

/**
 * Screen boxes that never show the map: top bar and side panels (from the top), the key hints and buttons
 * (from the bottom edge; measured at 1080 high).
 */
function panelsFor(h: number): [number, number, number, number][] {
  const b = h - 1080;
  return [
    [0, 0, 1920, 76],
    [50, 175, 465, 690],
    [1525, 170, 1885, 610],
    [1540, 800 + b, 1890, 960 + b],
    [1720, 1000 + b, 1890, 1070 + b],
    [890, 1000 + b, 1075, 1065 + b],
    [1880, 1015 + b, 1920, 1080 + b],
  ];
}

/** Grey screen + which pixels may be compared (labels, icons, panels left out). */
function screenGrey(bgra: Uint8Array): { img: GreyImage; ok: Uint8Array } {
  const img = bgraToGrey(bgra, W, H);
  const bright = new Uint8Array(W * H);
  for (let i = 0; i < bright.length; i++) {
    const r = bgra[i * 4 + 2];
    const g = bgra[i * 4 + 1];
    const b = bgra[i * 4];
    if (Math.min(r, g, b) > 170 && img.data[i] > 200) bright[i] = 1;
  }
  const ok = new Uint8Array(W * H).fill(1);
  const grow = 4;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!bright[y * W + x]) continue;
      for (let yy = Math.max(0, y - grow); yy <= Math.min(H - 1, y + grow); yy++) ok.fill(0, yy * W + Math.max(0, x - grow), yy * W + Math.min(W, x + grow + 1));
    }
  }
  for (const [x0, y0, x1, y1] of PANELS) for (let y = y0; y < y1; y++) ok.fill(0, y * W + x0, y * W + x1);
  return { img, ok };
}

/** The screen put on a grid of `g` px: values high-passed, plus which cells count. */
interface Grid {
  g: number;
  w: number;
  h: number;
  v: Float32Array;
  ok: Uint8Array;
}

const HP_CELLS = 3;

function toGrid(img: GreyImage, ok: Uint8Array, g: number): Grid {
  const w = Math.floor(W / g);
  const h = Math.floor(H / g);
  const small = resize(img, w, h);
  const okSmall = resize({ width: W, height: H, data: Float32Array.from(ok) }, w, h);
  const v = highPass(small, HP_CELLS).data;
  const cells = new Uint8Array(w * h);
  for (let i = 0; i < cells.length; i++) cells[i] = okSmall.data[i] > 0.8 ? 1 : 0;
  return { g, w, h, v, ok: cells };
}

/** The screen on the three grids; the 24 and 4 px ones are only made when needed. */
function prepare(bgra: Uint8Array): { mid: Grid; coarse: () => Grid; fine: () => Grid } {
  const { img, ok } = screenGrey(bgra);
  let coarse: Grid | null = null;
  let fine: Grid | null = null;
  return {
    mid: toGrid(img, ok, 8),
    coarse: () => (coarse ??= toGrid(img, ok, 24)),
    fine: () => (fine ??= toGrid(img, ok, 4)),
  };
}

/** The season map drawn at `scale` (screen px per map px), on the same grid, high-passed the same way. */
class MapScales {
  private readonly cache = new Map<string, GreyImage>();
  private readonly pyramid: GreyImage[];

  constructor(map: GreyImage) {
    this.pyramid = [map];
    while (this.pyramid[this.pyramid.length - 1].width > 64) {
      const last = this.pyramid[this.pyramid.length - 1];
      this.pyramid.push(resize(last, Math.round(last.width / 2), Math.round(last.height / 2)));
    }
  }

  /** The plain (not high-passed) pyramid level closest to `factor` map px per pixel. */
  level(factor: number): GreyImage {
    const i = Math.max(0, Math.min(this.pyramid.length - 1, Math.round(Math.log2(Math.max(1, factor)))));
    return this.pyramid[i];
  }

  get(scale: number, g: number): GreyImage {
    const size = Math.max(8, Math.round((this.pyramid[0].width * scale) / g));
    const key = `${size}`;
    let hit = this.cache.get(key);
    if (!hit) {
      // Start from the smallest pyramid level still bigger than the size wanted.
      let src = this.pyramid[0];
      for (const p of this.pyramid) if (p.width >= size) src = p;
      hit = highPass(resize(src, size, size), HP_CELLS);
      this.cache.set(key, hit);
      if (this.cache.size > 400) this.cache.delete(this.cache.keys().next().value!);
    }
    return hit;
  }
}

/**
 * Correlation of the screen grid with the map drawn at grid offset (ox, oy) (map cell (0,0) lands on screen cell
 * (ox, oy)). Only screen cells that fall on the map count; too little overlap scores -1.
 */
function scoreAt(grid: Grid, map: GreyImage, ox: number, oy: number, minCells: number): number {
  let n = 0;
  let sa = 0;
  let sb = 0;
  let saa = 0;
  let sbb = 0;
  let sab = 0;
  const x0 = Math.max(0, ox);
  const y0 = Math.max(0, oy);
  const x1 = Math.min(grid.w, ox + map.width);
  const y1 = Math.min(grid.h, oy + map.height);
  for (let y = y0; y < y1; y++) {
    const row = y * grid.w;
    const mrow = (y - oy) * map.width - ox;
    for (let x = x0; x < x1; x++) {
      if (!grid.ok[row + x]) continue;
      const a = grid.v[row + x];
      const b = map.data[mrow + x];
      n++;
      sa += a;
      sb += b;
      saa += a * a;
      sbb += b * b;
      sab += a * b;
    }
  }
  if (n < minCells) return -1;
  const va = saa - (sa * sa) / n;
  const vb = sbb - (sb * sb) / n;
  if (va <= 1e-3 || vb <= 1e-3) return -1;
  return (sab - (sa * sb) / n) / Math.sqrt(va * vb);
}

/** Zoom levels tried in a whole search: 0.3 to ~3 screen px per map px. */
const SCALES: number[] = [];
for (let s = 0.3; s <= 3.2; s *= 1.08) SCALES.push(s);

/** A view counts at this score or more (on the 8-px grid). */
export const VIEW_THRESHOLD = 0.35;
/** A view found this well needs no further search (real views score 0.76-0.90). */
const SURE_VIEW = 0.6;

export class FullMapLocator {
  private readonly scales: MapScales;
  readonly mapSize: number;

  /** `map` is the season map in grey at full size (2048). */
  constructor(map: GreyImage) {
    this.scales = new MapScales(map);
    this.mapSize = map.width;
  }

  /** Grey of the season map around a map pixel, smoothed to about one screen pixel at this view. */
  greySampler(view: MapView): (mx: number, my: number) => number {
    const img = this.scales.level(1 / view.scale);
    const k = img.width / this.mapSize;
    return (mx, my) => {
      const x = Math.min(img.width - 1, Math.max(0, Math.round(mx * k)));
      const y = Math.min(img.height - 1, Math.max(0, Math.round(my * k)));
      return img.data[y * img.width + x];
    };
  }

  /**
   * Where the map is drawn on this full-map screen (`bgra` at 1920x1080), searching near `near`. With
   * `quick`, only scores `near` itself (a few ms): to tell whether the map has moved since the last look.
   */
  locate(bgra: Uint8Array, near: MapView, quick = false): ViewFix | null {
    heightFrom(bgra);
    const grids = prepare(bgra);
    if (quick) {
      const map = this.scales.get(near.scale, grids.mid.g);
      const ox = Math.round(near.x / grids.mid.g);
      const oy = Math.round(near.y / grids.mid.g);
      const score = scoreAt(grids.mid, map, ox, oy, grids.mid.ok.reduce((a, b) => a + b, 0) * 0.3);
      return { ...near, score };
    }
    const f = this.refine(grids.mid, near, 0.12, 40);
    if (!f) return null;
    return this.refine(grids.fine(), f, 0.02, 8) ?? f;
  }

  /**
   * Searches every zoom level (about 1-3 s of work), giving the event loop a turn after each level so the
   * app never stalls. Used when the map was zoomed or moved too far for `locate`.
   */
  async locateAsync(bgra: Uint8Array, last?: MapView | null): Promise<ViewFix | null> {
    heightFrom(bgra);
    const grids = prepare(bgra);
    // Fortnite zooms in steps of 1.5x: after a zoom the map is nearly always one or two steps from the last view,
    // so those few zoom levels are tried first (a fraction of the whole search).
    if (last) {
      // One step in or out is the usual case: stop at the first zoom level that clearly fits.
      const steps = [1.5, 1 / 1.5, 1, 2.25, 1 / 2.25].map((k) => last.scale * k).filter((s) => s >= SCALES[0] * 0.95 && s <= SCALES[SCALES.length - 1] * 1.05);
      let best: ViewFix | null = null;
      for (const s of steps) {
        const f = await this.searchScales(grids, [s], 2);
        if (f && (!best || f.score > best.score)) best = f;
        if (best && best.score >= SURE_VIEW) return best;
      }
      if (best && best.score >= VIEW_THRESHOLD) return best;
    }
    return this.searchScales(grids, SCALES);
  }

  /** Every offset (or every `stride`th) at each of these zoom levels on the coarse grid, then the best few refined. */
  private async searchScales(grids: ReturnType<typeof prepare>, scales: number[], stride = 1): Promise<ViewFix | null> {
    const coarse = grids.coarse();
    const found: ViewFix[] = [];
    const minCells = coarse.ok.reduce((a, b) => a + b, 0) * 0.3;
    for (const s of scales) {
      await new Promise((r) => setImmediate(r));
      const map = this.scales.get(s, coarse.g);
      let best: ViewFix = { scale: s, x: 0, y: 0, score: -2 };
      for (let oy = -map.height + 4; oy < coarse.h - 4; oy += stride) {
        for (let ox = -map.width + 4; ox < coarse.w - 4; ox += stride) {
          const sc = scoreAt(coarse, map, ox, oy, minCells);
          if (sc > best.score) best = { scale: s, x: ox * coarse.g, y: oy * coarse.g, score: sc };
        }
      }
      found.push(best);
    }
    found.sort((a, b) => b.score - a.score);
    let best: ViewFix | null = null;
    for (const start of found.slice(0, 4)) {
      await new Promise((r) => setImmediate(r));
      const f = this.refine(grids.mid, start, 0.06, 30);
      if (f && (!best || f.score > best.score)) best = f;
    }
    if (!best) return null;
    return this.refine(grids.fine(), best, 0.02, 8) ?? best;
  }

  /** Searches scales within ±`ds` (relative) and offsets within ±`dxy` screen px around a view. */
  private refine(grid: Grid, v: MapView, ds: number, dxy: number): ViewFix | null {
    const minCells = grid.ok.reduce((a, b) => a + b, 0) * 0.3;
    let best: ViewFix | null = null;
    const steps = 6;
    for (let k = -steps; k <= steps; k++) {
      const s = v.scale * (1 + (ds * k) / steps);
      const map = this.scales.get(s, grid.g);
      // The map was rounded to whole cells: use its true scale.
      const sTrue = (map.width * grid.g) / this.mapSize;
      const r = Math.ceil(dxy / grid.g);
      const cx = Math.round(v.x / grid.g);
      const cy = Math.round(v.y / grid.g);
      for (let oy = cy - r; oy <= cy + r; oy++) {
        for (let ox = cx - r; ox <= cx + r; ox++) {
          const sc = scoreAt(grid, map, ox, oy, minCells);
          if (!best || sc > best.score) best = { scale: sTrue, x: ox * grid.g, y: oy * grid.g, score: sc };
        }
      }
    }
    return best && best.score > -1 ? best : null;
  }
}

/** Screen point (1080p) → season map pixel. */
export function screenToMap(v: MapView, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - v.x) / v.scale, y: (sy - v.y) / v.scale };
}

/** Season map pixel → screen point (1080p). */
export function mapToScreen(v: MapView, mx: number, my: number): { x: number; y: number } {
  return { x: mx * v.scale + v.x, y: my * v.scale + v.y };
}

// ---------- What Fortnite draws on its map: you, teammates, markers, the storm ----------

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

export const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

interface Blob {
  n: number;
  cx: number;
  cy: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Connected groups of set pixels in `mask` (w x h), with their size, centre and bounds. */
function blobs(mask: Uint8Array, w: number, h: number, minN: number, maxN: number): Blob[] {
  const seen = new Uint8Array(w * h);
  const out: Blob[] = [];
  const stack: number[] = [];
  const visit = (q: number) => {
    if (mask[q] && !seen[q]) {
      seen[q] = 1;
      stack.push(q);
    }
  };
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    seen[start] = 1;
    stack.push(start);
    const b: Blob = { n: 0, cx: 0, cy: 0, x0: w, y0: h, x1: 0, y1: 0 };
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % w;
      const y = (p - x) / w;
      b.n++;
      b.cx += x;
      b.cy += y;
      if (x < b.x0) b.x0 = x;
      if (x > b.x1) b.x1 = x;
      if (y < b.y0) b.y0 = y;
      if (y > b.y1) b.y1 = y;
      if (x > 0) visit(p - 1);
      if (x < w - 1) visit(p + 1);
      if (y > 0) visit(p - w);
      if (y < h - 1) visit(p + w);
    }
    if (b.n < minN || b.n > maxN) continue;
    b.cx /= b.n;
    b.cy /= b.n;
    out.push(b);
  }
  return out;
}

function inPanel(x: number, y: number): boolean {
  return PANELS.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1);
}

/** A squad colour as read from the HUD: hue for matching, plus the real colour to draw with. */
export interface SquadColor {
  hue: number;
  color: string;
}

/**
 * Squad colours from the list on the left of the HUD (`bgra` 1920x1080): each name has a small coloured diamond
 * in front. Teammates' rows have their portrait first (diamond at x ~68-77); your own row is last and has none
 * (x ~48-55). Returns the colours top to bottom; the last one is yours. Empty when the list isn't showing.
 */
export function readSquadColors(bgra: Uint8Array): SquadColor[] {
  heightFrom(bgra);
  // The list hangs from the bottom-left corner.
  const x0 = 40;
  const x1 = 84;
  const y0 = 560 + (H - 1080);
  const y1 = 990 + (H - 1080);
  const w = x1 - x0;
  const h = y1 - y0;
  const mask = new Uint8Array(w * h);
  const at = (x: number, y: number) => (y * W + x) * 4;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = at(x0 + x, y0 + y);
      const [, s, v] = hsv(bgra[i + 2], bgra[i + 1], bgra[i]);
      if (s > 0.45 && v > 0.55) mask[y * w + x] = 1;
    }
  }
  const found: { x: number; y: number; c: SquadColor }[] = [];
  for (const b of blobs(mask, w, h, 20, 220)) {
    const bw = b.x1 - b.x0 + 1;
    const bh = b.y1 - b.y0 + 1;
    if (bw < 5 || bh < 6 || bw > 17 || bh > 18 || Math.abs(bw - bh) > 6) continue;
    // A name follows it: bright text pixels to the right on the same line.
    const cy = Math.round(y0 + b.cy);
    let text = 0;
    for (let y = cy - 5; y <= cy + 5; y++) {
      for (let x = x0 + b.x1 + 4; x < x0 + b.x1 + 60; x++) {
        const i = at(x, y);
        if (0.299 * bgra[i + 2] + 0.587 * bgra[i + 1] + 0.114 * bgra[i] > 170) text++;
      }
    }
    if (text < 12) continue;
    let r = 0;
    let g = 0;
    let bl = 0;
    let n = 0;
    for (let y = b.y0; y <= b.y1; y++) {
      for (let x = b.x0; x <= b.x1; x++) {
        if (!mask[y * w + x]) continue;
        const i = at(x0 + x, y0 + y);
        r += bgra[i + 2];
        g += bgra[i + 1];
        bl += bgra[i];
        n++;
      }
    }
    r /= n;
    g /= n;
    bl /= n;
    const hex = '#' + [r, g, bl].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');
    found.push({ x: x0 + b.cx, y: cy, c: { hue: hsv(r, g, bl)[0], color: hex } });
  }
  // Your row is the lowest, its diamond at x ~44-58 (no portrait); teammates' rows go up from it ~56 px apart
  // with their diamond at x ~62-82. Anything else (the kill feed's coloured names) is left out.
  found.sort((a, b) => b.y - a.y);
  const self = found.find((f) => f.x >= 42 && f.x <= 60);
  if (!self) return [];
  const rows = [self];
  for (const f of found) {
    const top = rows[rows.length - 1];
    const gap = top.y - f.y;
    if (f.x >= 62 && f.x <= 82 && gap >= 45 && gap <= 70) rows.push(f);
  }
  return rows.reverse().map((r) => r.c);
}

/**
 * Your arrow on the full map at 1080p, pointing down-right (heading 135), as measured on a recording:
 * '#' = white. Matched at every 10 degrees against white shapes.
 */
const ARROW_ROWS = [
  '          #     ',
  '         ###    ',
  '         ###    ',
  '         ###    ',
  '         ####   ',
  '        #####   ',
  '        #####   ',
  '        #####   ',
  ' ############## ',
  ' ############## ',
  '   ############ ',
  '   ############ ',
  '     ########## ',
  '       #########',
  '        ########',
  '         #######',
  '           #####',
  '            ####',
  '             ###',
  '              ##',
];
const ARROW_HEADING = 135;
/** How well a white shape must fit the arrow (shared pixels / all pixels of both). */
const ARROW_FIT = 0.55;

/** The arrow's white pixels relative to their centre. */
const ARROW_PTS: [number, number][] = (() => {
  const pts: [number, number][] = [];
  ARROW_ROWS.forEach((row, y) => [...row].forEach((c, x) => c === '#' && pts.push([x, y])));
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  return pts.map(([x, y]) => [x - cx, y - cy]);
})();

/** Best fit of the arrow (turned every 10 degrees) on a white shape, and the way it then points. */
function arrowFit(white: Uint8Array, b: { cx: number; cy: number; n: number }): { score: number; heading: number } {
  let best = { score: 0, heading: 0 };
  for (let deg = 0; deg < 360; deg += 10) {
    const t = (deg * Math.PI) / 180;
    const c = Math.cos(t);
    const s = Math.sin(t);
    let hit = 0;
    for (const [x, y] of ARROW_PTS) {
      const px = Math.round(b.cx + x * c - y * s);
      const py = Math.round(b.cy + x * s + y * c);
      if (px >= 0 && py >= 0 && px < W && py < H && white[py * W + px]) hit++;
    }
    const score = hit / (ARROW_PTS.length + b.n - hit);
    if (score > best.score) best = { score, heading: (ARROW_HEADING + deg) % 360 };
  }
  return best;
}

/** Mean grey difference from the season map under which a coloured shape is the map's own art. */
const MAP_ART_DIFF = 40;

export interface MapMark {
  /** On screen (1080p) and on the season map. */
  sx: number;
  sy: number;
  x: number;
  y: number;
}

export interface FullMapMarks {
  /** Your arrow, with the way it points (degrees, 0 = north, clockwise). */
  me: (MapMark & { heading: number }) | null;
  /** Teammates' arrows, in their squad colour. */
  mates: (MapMark & SquadColor)[];
  /** Map markers (pins) in a squad colour. */
  markers: (MapMark & SquadColor)[];
}

/**
 * Finds your arrow, teammates' arrows and squad-coloured markers on the full-map screen (`bgra` 1920x1080).
 * `squad` = teammates' colours from the HUD list; without them only your arrow is taken (the map art has
 * strong colours too).
 */
export function readFullMapMarks(bgra: Uint8Array, view: MapView, squad: SquadColor[], mapGrey?: (mx: number, my: number) => number): FullMapMarks {
  heightFrom(bgra);
  const n = W * H;
  const sat = new Uint8Array(n);
  const hue = new Float32Array(n);
  const white = new Uint8Array(n);
  const dark = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = bgra[i * 4 + 2];
    const g = bgra[i * 4 + 1];
    const b = bgra[i * 4];
    const [hh, s, v] = hsv(r, g, b);
    hue[i] = hh;
    if (s > 0.5 && v > 0.55) sat[i] = 1;
    if (Math.min(r, g, b) > 215) white[i] = 1;
    if (0.299 * r + 0.587 * g + 0.114 * b < 70) dark[i] = 1;
  }
  for (const [x0, y0, x1, y1] of PANELS) {
    for (let y = y0; y < y1; y++) {
      sat.fill(0, y * W + x0, y * W + x1);
      white.fill(0, y * W + x0, y * W + x1);
    }
  }
  const toMark = (sx: number, sy: number): MapMark => ({ sx, sy, ...screenToMap(view, sx, sy) });

  // You: Fortnite's white chevron arrow (it turns with you; a coloured ring shows round it only some of the
  // time). Each solid white shape of about the right size is compared with the arrow at every turn; your mouse
  // pointer (a white pin with a dark hole), skulls and letters don't fit it.
  let me: FullMapMarks['me'] = null;
  let meScore = 0;
  for (const b of blobs(white, W, H, 70, 420)) {
    const bw = b.x1 - b.x0 + 1;
    const bh = b.y1 - b.y0 + 1;
    if (bw < 10 || bh < 10 || bw > 30 || bh > 30) continue;
    const fit = arrowFit(white, b);
    if (fit.score > meScore && fit.score >= ARROW_FIT) {
      meScore = fit.score;
      me = { ...toMark(b.cx, b.cy), heading: fit.heading };
    }
  }

  // Teammates and markers: arrow- or pin-sized shapes in a squad colour, outlined in black.
  const mates: FullMapMarks['mates'] = [];
  const markers: FullMapMarks['markers'] = [];
  if (!squad.length) return { me, mates, markers };
  for (const b of blobs(sat, W, H, 60, 900)) {
    const bw = b.x1 - b.x0 + 1;
    const bh = b.y1 - b.y0 + 1;
    if (bw < 9 || bh < 9 || bw > 48 || bh > 52) continue;
    // Not cut off by the screen edge (the storm's purple runs along it).
    if (b.x0 < 12 || b.y0 < 80 || b.x1 > W - 13 || b.y1 > H - 13) continue;
    if (me && Math.hypot(b.cx - me.sx, b.cy - me.sy) < 24) continue;
    // Average hue of the shape (circular mean).
    let hx = 0;
    let hy = 0;
    for (let y = b.y0; y <= b.y1; y++) {
      for (let x = b.x0; x <= b.x1; x++) {
        const i = y * W + x;
        if (!sat[i]) continue;
        hx += Math.cos((hue[i] * Math.PI) / 180);
        hy += Math.sin((hue[i] * Math.PI) / 180);
      }
    }
    const h = ((Math.atan2(hy, hx) * 180) / Math.PI + 360) % 360;
    const match = squad.reduce<SquadColor | null>((best, c) => (hueGap(c.hue, h) < 16 && (!best || hueGap(c.hue, h) < hueGap(best.hue, h)) ? c : best), null);
    if (!match) continue;
    // Black outline: many pixels just outside the shape are dark.
    let edge = 0;
    let edgeDark = 0;
    for (let y = Math.max(2, b.y0 - 3); y <= Math.min(H - 3, b.y1 + 3); y++) {
      for (let x = Math.max(2, b.x0 - 3); x <= Math.min(W - 3, b.x1 + 3); x++) {
        const i = y * W + x;
        if (sat[i]) continue;
        if (!(sat[i - 1] || sat[i + 1] || sat[i - W] || sat[i + W] || sat[i - 2] || sat[i + 2] || sat[i - 2 * W] || sat[i + 2 * W])) continue;
        edge++;
        if (dark[i]) edgeDark++;
      }
    }
    if (!edge || edgeDark / edge < 0.3) continue;
    // A marker pin is taller than wide with a dark hole in its upper middle; an arrow is solid there.
    const cx = Math.round((b.x0 + b.x1) / 2);
    const holeY = Math.round(b.y0 + bh * 0.38);
    let hole = 0;
    for (let y = holeY - 2; y <= holeY + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) if (dark[y * W + x]) hole++;
    if (hole >= 8 && bh >= bw) {
      markers.push({ ...toMark(cx, b.y1), ...match });
      continue;
    }
    // An arrow is drawn on top of the map, not part of it, not part of it: the screen there looks unlike the season map at that spot.
    if (mapGrey) {
      let diff = 0;
      let k = 0;
      for (let y = b.y0; y <= b.y1; y++) {
        for (let x = b.x0; x <= b.x1; x++) {
          const i = y * W + x;
          if (!sat[i]) continue;
          const m = screenToMap(view, x, y);
          diff += Math.abs(0.299 * bgra[i * 4 + 2] + 0.587 * bgra[i * 4 + 1] + 0.114 * bgra[i * 4] - mapGrey(m.x, m.y));
          k++;
        }
      }
      if (k && diff / k < MAP_ART_DIFF) continue;
    }
    mates.push({ ...toMark(b.cx, b.cy), ...match });
  }
  return { me, mates: mates.slice(0, 3), markers: markers.slice(0, 6) };
}

export interface Circle {
  x: number;
  y: number;
  r: number;
}

/** Best circle through screen points (random tries); `inl` = points within 2 px of it. */
function fitCircle(pts: number[], minR: number, maxR: number, minGap: number): (Circle & { inl: number; stride: number }) | null {
  const count = pts.length / 2;
  if (count < 30) return null;
  const stride = Math.max(1, Math.floor(count / 20000));
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let best: (Circle & { inl: number; stride: number }) | null = null;
  for (let t = 0; t < 600; t++) {
    const a = Math.floor(rnd() * count) * 2;
    const b = Math.floor(rnd() * count) * 2;
    const c = Math.floor(rnd() * count) * 2;
    const ax = pts[a];
    const ay = pts[a + 1];
    const bx = pts[b];
    const by = pts[b + 1];
    const cx = pts[c];
    const cy = pts[c + 1];
    if (Math.hypot(ax - bx, ay - by) < minGap || Math.hypot(ax - cx, ay - cy) < minGap || Math.hypot(bx - cx, by - cy) < minGap) continue;
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) < 1e-6) continue;
    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
    const r = Math.hypot(ax - ux, ay - uy);
    if (r < minR || r > maxR) continue;
    let inl = 0;
    for (let k = 0; k < count; k += stride) if (Math.abs(Math.hypot(pts[k * 2] - ux, pts[k * 2 + 1] - uy) - r) < 2) inl++;
    if (!best || inl > best.inl) best = { x: ux, y: uy, r, inl, stride };
  }
  return best;
}

/**
 * The storm as Fortnite draws it on the full map, in season-map pixels:
 * - `next`: the next safe zone, a thin white ring.
 * - `edge`: where the storm is now: the line between the purple storm and the clear map.
 * Each is null when it can't be seen clearly (off screen, not drawn yet).
 */
export function readStorm(bgra: Uint8Array, view: MapView): { next: Circle | null; edge: Circle | null } {
  heightFrom(bgra);
  // Next zone: pure white pixels (labels are white too, but they don't lie on one circle).
  const white: number[] = [];
  for (let y = 80; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (bgra[i] < 235 || bgra[i + 1] < 235 || bgra[i + 2] < 235 || inPanel(x, y)) continue;
      white.push(x, y);
    }
  }
  const ring = fitCircle(white, 30, 1400, 80);
  // Enough white pixels on it to draw a good part of the ring (it can run off screen or under panels).
  const next = ring && ring.inl * ring.stride >= ring.r * 2 ? ring : null;

  // Storm edge: on an 8-px grid, cells that are mostly storm purple; the edge is storm cells next to clear ones.
  const g = 8;
  const gw = Math.floor(W / g);
  const gh = Math.floor(H / g);
  const storm = new Uint8Array(gw * gh);
  const valid = new Uint8Array(gw * gh);
  for (let cy = 10; cy < gh; cy++) {
    for (let cx = 0; cx < gw; cx++) {
      if (inPanel(cx * g + 4, cy * g + 4)) continue;
      valid[cy * gw + cx] = 1;
      let purple = 0;
      for (let y = cy * g; y < cy * g + g; y += 2) {
        for (let x = cx * g; x < cx * g + g; x += 2) {
          const i = (y * W + x) * 4;
          const [h, s, v] = hsv(bgra[i + 2], bgra[i + 1], bgra[i]);
          if (h >= 265 && h <= 325 && s > 0.45 && v > 0.3) purple++;
        }
      }
      if (purple >= 13) storm[cy * gw + cx] = 1;
    }
  }
  // Keep the big storm area only (pink trees and purple icons are small).
  const big = blobs(storm, gw, gh, 400, gw * gh);
  const keep = new Uint8Array(gw * gh);
  if (big.length) {
    const mark = new Uint8Array(gw * gh);
    for (let i = 0; i < storm.length; i++) mark[i] = storm[i];
    for (const b of big) {
      // Flood from a storm cell inside this blob's bounds.
      for (let y = b.y0; y <= b.y1; y++) {
        for (let x = b.x0; x <= b.x1; x++) {
          const i = y * gw + x;
          if (!mark[i]) continue;
          const stack = [i];
          mark[i] = 0;
          const cells: number[] = [];
          while (stack.length) {
            const p = stack.pop()!;
            cells.push(p);
            for (const q of [p - 1, p + 1, p - gw, p + gw]) {
              if (q >= 0 && q < mark.length && mark[q]) {
                mark[q] = 0;
                stack.push(q);
              }
            }
          }
          if (cells.length >= 400) for (const c of cells) keep[c] = 1;
        }
      }
    }
  }
  const edgePts: number[] = [];
  for (let cy = 1; cy < gh - 1; cy++) {
    for (let cx = 1; cx < gw - 1; cx++) {
      const i = cy * gw + cx;
      if (!keep[i]) continue;
      const clear = [i - 1, i + 1, i - gw, i + gw].some((q) => valid[q] && !storm[q]);
      if (clear) edgePts.push(cx * g + g / 2, cy * g + g / 2);
    }
  }
  const e = fitCircle(edgePts, 40, 3000, 60);
  // Edge cells are 8 px apart, so a clear edge has about r / 4 of them on the circle (a quarter of the way round).
  const edge = e && e.inl * e.stride >= Math.max(25, e.r / 16) ? e : null;
  const toMap = (c: Circle | null): Circle | null => {
    if (!c) return null;
    const m = screenToMap(view, c.x, c.y);
    return { x: m.x, y: m.y, r: c.r / view.scale };
  };
  return { next: toMap(next), edge: toMap(edge) };
}

// ---------- Markers on the minimap ----------

/** A marker pin seen on the minimap: where its tip points, in minimap px from the centre (you), and its colour. */
export interface MiniMarker {
  dx: number;
  dy: number;
  hue: number;
  color: string;
}

/** A pin whose head is farther than this from the centre (252-px minimap) may be stuck to the edge. */
const MINI_PIN_INSIDE = 88;

/**
 * Marker pins on the minimap (`bgra` w x h, the 1080p minimap is 252 px): a white teardrop with a black outline
 * and a small diamond in the placer's squad colour inside, tip at the marked spot. Pins for markers off the
 * minimap are stuck to its edge and turned toward them (about 96 px out at 252); only pins well inside with
 * the tip pointing down are taken. `squad` gives the colours to name them by (yours included); without it the
 * diamond's own colour is used.
 */
export function readMinimapMarkers(bgra: Uint8Array, w: number, h: number, squad: SquadColor[]): MiniMarker[] {
  const k = w / 252;
  const n = w * h;
  const sat = new Uint8Array(n);
  const white = new Uint8Array(n);
  const hue = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = bgra[i * 4 + 2];
    const g = bgra[i * 4 + 1];
    const b = bgra[i * 4];
    if (Math.min(r, g, b) > 215) white[i] = 1;
    const [hh, s, v] = hsv(r, g, b);
    if (s > 0.5 && v > 0.6) {
      sat[i] = 1;
      hue[i] = hh;
    }
  }
  const out: MiniMarker[] = [];
  const ring = Math.round(8 * k);
  for (const d of blobs(sat, w, h, Math.round(8 * k * k), Math.round(60 * k * k))) {
    const bw = d.x1 - d.x0 + 1;
    const bh = d.y1 - d.y0 + 1;
    if (bw > 10 * k || bh > 10 * k) continue;
    const cx = Math.round(d.cx);
    const cy = Math.round(d.cy);
    if (Math.abs(cx - w / 2) > MINI_PIN_INSIDE * k || Math.abs(cy - h / 2) > MINI_PIN_INSIDE * k) continue;
    // White all round the diamond (the pin's head).
    let all = 0;
    let wh = 0;
    for (let a = 0; a < 24; a++) {
      const x = Math.round(cx + ring * Math.cos((a * Math.PI) / 12));
      const y = Math.round(cy + ring * Math.sin((a * Math.PI) / 12));
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      all++;
      if (white[y * w + x]) wh++;
    }
    if (!all || wh / all < 0.6) continue;
    // The tip: the lowest white pixel joined to the head, walking down from the diamond.
    let tipX = cx;
    let tipY = cy + ring;
    let tipped = false;
    for (let y = cy + ring; y < Math.min(h, cy + 26 * k); y++) {
      let sx = 0;
      let c = 0;
      for (let x = Math.max(0, tipX - Math.round(6 * k)); x <= Math.min(w - 1, tipX + Math.round(6 * k)); x++) {
        if (white[y * w + x]) {
          sx += x;
          c++;
        }
      }
      if (!c) {
        tipped = true;
        break;
      }
      tipX = Math.round(sx / c);
      tipY = y;
    }
    // The tip points down (pins turned toward the edge are the stuck ones).
    if (!tipped || tipY - cy < 12 * k || Math.abs(tipX - cx) * 2 > tipY - cy) continue;
    let hx = 0;
    let hy = 0;
    let rr = 0;
    let gg = 0;
    let bb = 0;
    let m = 0;
    for (let y = d.y0; y <= d.y1; y++) {
      for (let x = d.x0; x <= d.x1; x++) {
        const i = y * w + x;
        if (!sat[i]) continue;
        hx += Math.cos((hue[i] * Math.PI) / 180);
        hy += Math.sin((hue[i] * Math.PI) / 180);
        rr += bgra[i * 4 + 2];
        gg += bgra[i * 4 + 1];
        bb += bgra[i * 4];
        m++;
      }
    }
    const hh = ((Math.atan2(hy, hx) * 180) / Math.PI + 360) % 360;
    const match = squad.reduce<SquadColor | null>((best, c) => (hueGap(c.hue, hh) < 16 && (!best || hueGap(c.hue, hh) < hueGap(best.hue, hh)) ? c : best), null);
    if (squad.length && !match) continue;
    const hex = (v: number) => Math.round(v / m).toString(16).padStart(2, '0');
    out.push({ dx: (tipX - w / 2) / k, dy: (tipY - h / 2) / k, hue: match?.hue ?? hh, color: match?.color ?? `#${hex(rr)}${hex(gg)}${hex(bb)}` });
  }
  // Teammates' markers: a solid pin in their colour with a dark hole in its head, tip at the spot.
  const dark = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (Math.max(bgra[i * 4], bgra[i * 4 + 1], bgra[i * 4 + 2]) < 70) dark[i] = 1;
  for (const c of squad) {
    const mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (sat[i] && hueGap(hue[i], c.hue) < 14) mask[i] = 1;
    // About 20x30 px at 252 (measured).
    for (const b of blobs(mask, w, h, Math.round(80 * k * k), Math.round(560 * k * k))) {
      const bw = b.x1 - b.x0 + 1;
      const bh = b.y1 - b.y0 + 1;
      if (bw < 12 * k || bw > 28 * k || bh < 18 * k || bh > 38 * k || bh < bw) continue;
      const cx = Math.round((b.x0 + b.x1) / 2);
      if (Math.abs(cx - w / 2) > MINI_PIN_INSIDE * k || Math.abs(b.y1 - h / 2) > MINI_PIN_INSIDE * k || Math.abs(b.y0 - h / 2) > MINI_PIN_INSIDE * k) continue;
      // The hole: dark pixels in the upper middle, ringed by the pin's colour.
      const hy = Math.round(b.y0 + bh * 0.36);
      let hole = 0;
      const r = Math.max(1, Math.round(1.5 * k));
      for (let y = hy - r; y <= hy + r; y++) for (let x = cx - r; x <= cx + r; x++) if (dark[y * w + x]) hole++;
      if (hole < (2 * r + 1) * (2 * r + 1) * 0.4) continue;
      let ringed = 0;
      for (const [dx, dy] of [[-0.38 * bw, 0], [0.38 * bw, 0], [0, -0.28 * bh]]) if (mask[(hy + Math.round(dy)) * w + cx + Math.round(dx)]) ringed++;
      if (ringed < 2) continue;
      out.push({ dx: (cx - w / 2) / k, dy: (b.y1 - h / 2) / k, hue: c.hue, color: c.color });
    }
  }
  return out.slice(0, 6);
}

// ---------- The left panel on the full map: storm timer, players left, eliminations ----------

/** Digits 0-9 of the panel font (white, bold), as 10x14 pictures; built from real M screens. */
const DIGITS = [
  '0000111000/0011111110/0111001110/0110000110/0110000111/1110000111/1100000111/1100000111/1110000111/0110000111/0111000110/0111001110/0011111110/0000111000',
  '0000111111/0111111111/1111111111/1111111111/0000011111/0000011111/0000011111/0000011111/0000011111/0000011111/0000011111/0000011111/0000011111/0000011111',
  '0001111000/0111111110/0111001110/1111000111/1110000111/0100001111/0000001110/0000011110/0000111100/0011111000/0111100000/1111100110/1111111111/1111111111',
  '0001111000/0111111110/0111000111/1110000111/0000000111/0000001110/0001111100/0000011110/0000000111/0110000111/1110000111/0111111111/0111111110/0000111000',
  '0000011110/0000111110/0001110110/0001100110/0001100110/0011000110/0111000110/0110000110/1110000110/1111111111/1111111111/0000001110/0000000110/0000000110',
  '0111111110/0111111110/0110000000/0110000000/0110011100/0111111110/0111111110/0110000111/0000000111/0000000111/1110000110/0111111110/0111111110/0000000000',
  '0000111000/0011111110/0111001110/0110000110/0110000000/1110001000/1111111110/1111001110/1110000111/0110000111/0111000110/0111111110/0011111110/0000110000',
  '0000011111/1111111111/1111111111/0000001111/0000011110/0000011100/0000011100/0000111000/0001111000/0001111000/0001110000/0001110000/0011110000/0011110000',
  '0001111000/0111111110/0111001110/1110000110/0110000110/0111001110/0011111000/0111111110/1110000110/1100000111/1110000111/0111001110/0111111110/0000110000',
  '0011111000/0111111110/1111001110/1110000111/1110000111/1110000111/0111011111/0011110111/0000000111/0000000111/1110001110/0111111110/0111111110/0000110000',
].map((s) => s.replace(/\//g, '').split('').map(Number));
const GW = 10;
const GH = 14;
/** A digit counts when it differs from its template in at most this many of 140 cells (real ones: ~9, worst 20). */
const DIGIT_MAX_DIFF = 28;

export interface MapPanel {
  /** Storm timer in seconds (the "0:33" by the storm icon). */
  stormSecs: number | null;
  playersLeft: number | null;
  /** Team modes: squads (or duos, trios) left, the number in brackets. */
  teamsLeft: number | null;
  /** One row per squad member, top to bottom: their eliminations and where the row's name is (1080p screen). */
  elims: { count: number; name: { x: number; y: number; width: number; height: number } }[];
}

/**
 * Reads the panel on the left of the full map (`bgra` 1920 wide): the right-hand column holds right-aligned
 * values, one per line: the storm timer (has a ':'), players left ("80 (20)" in team modes), then each squad
 * member's eliminations. Lines are found by their bright text; each value's characters are matched to the
 * digit pictures. The name in each eliminations row isn't read as text: its box is returned to cut out.
 */
export function readMapPanel(bgra: Uint8Array): MapPanel {
  heightFrom(bgra);
  const X0 = 240;
  const X1 = 432;
  const Y0 = 250;
  const Y1 = Math.min(H - 20, 820);
  const w = X1 - X0;
  const h = Y1 - Y0;
  const on = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((Y0 + y) * W + X0 + x) * 4;
      if (0.299 * bgra[i + 2] + 0.587 * bgra[i + 1] + 0.114 * bgra[i] > 150) on[y * w + x] = 1;
    }
  }
  const lines: { y: number; text: string; x0: number }[] = [];
  let y = 0;
  const rowOn = (yy: number) => {
    for (let x = 0; x < w; x++) if (on[yy * w + x]) return true;
    return false;
  };
  while (y < h) {
    if (!rowOn(y)) {
      y++;
      continue;
    }
    const a = y;
    while (y < h && rowOn(y)) y++;
    const b = y;
    if (b - a < 14 || b - a > 40) continue;
    // Characters, right to left: stop at a wide gap or at anything that isn't part of a value.
    const colOn = (x: number) => {
      for (let yy = a; yy < b; yy++) if (on[yy * w + x]) return true;
      return false;
    };
    let text = '';
    let x = w - 1;
    let lastX0 = -1;
    while (x >= 0) {
      if (!colOn(x)) {
        x--;
        if (lastX0 >= 0 && lastX0 - x > 16) break;
        continue;
      }
      const c1 = x + 1;
      while (x >= 0 && colOn(x)) x--;
      const c0 = x + 1;
      let ya = b;
      let yb = a;
      for (let yy = a; yy < b; yy++) {
        for (let xx = c0; xx < c1; xx++) {
          if (on[yy * w + xx]) {
            if (yy < ya) ya = yy;
            if (yy > yb) yb = yy;
          }
        }
      }
      const cw = c1 - c0;
      const ch = yb - ya + 1;
      let c: string | null = null;
      if (ch >= 23 && ch <= 28 && cw >= 4 && cw <= 9) {
        // A bracket: which way it opens.
        let left = 0;
        let right = 0;
        const mid = Math.round((ya + yb) / 2);
        for (let xx = c0; xx < c1; xx++) {
          if (!on[mid * w + xx]) continue;
          if (xx - c0 < cw / 2) left++;
          else right++;
        }
        c = left >= right ? '(' : ')';
      } else if (ch >= 9 && ch <= 15 && cw <= 7) c = ':';
      else if (ch >= 16 && ch <= 22 && cw >= 6 && cw <= 18) c = digitAt(on, w, c0, ya, cw, ch);
      if (c === null) break;
      text = c + text;
      lastX0 = c0;
    }
    if (text) lines.push({ y: Y0 + (a + b) / 2, text, x0: X0 + lastX0 });
  }

  const out: MapPanel = { stormSecs: null, playersLeft: null, teamsLeft: null, elims: [] };
  const t = lines.findIndex((l) => /^\d{1,2}:\d\d$/.test(l.text));
  if (t >= 0) {
    const [m, s] = lines[t].text.split(':').map(Number);
    out.stormSecs = m * 60 + s;
  }
  const rest = lines.slice(t + 1);
  const p = rest.findIndex((l) => /^\d{1,3}(\(\d{1,3}\))?$/.test(l.text));
  if (p >= 0) {
    const m = /^(\d{1,3})(?:\((\d{1,3})\))?$/.exec(rest[p].text)!;
    out.playersLeft = Number(m[1]);
    out.teamsLeft = m[2] ? Number(m[2]) : null;
    for (const l of rest.slice(p + 1, p + 9)) {
      if (!/^\d{1,3}$/.test(l.text)) break;
      const top = Math.round(l.y - 18);
      out.elims.push({ count: Number(l.text), name: { x: 84, y: top, width: Math.max(40, l.x0 - 92), height: 36 } });
    }
  }
  return out;
}

/** The digit whose picture best fits this glyph, or null when none fits well enough. */
function digitAt(on: Uint8Array, w: number, x0: number, y0: number, cw: number, ch: number): string | null {
  // A one is about half as wide as the other digits.
  if (cw <= 10) return '1';
  const v: number[] = [];
  for (let j = 0; j < GH; j++) {
    for (let i = 0; i < GW; i++) {
      const yy = y0 + Math.min(ch - 1, Math.floor(((j + 0.5) * ch) / GH));
      const xx = x0 + Math.min(cw - 1, Math.floor(((i + 0.5) * cw) / GW));
      v.push(on[yy * w + xx]);
    }
  }
  let best = -1;
  let bd = Infinity;
  DIGITS.forEach((t, d) => {
    if (d === 1) return;
    let diff = 0;
    for (let i = 0; i < t.length; i++) if (t[i] !== v[i]) diff++;
    if (diff < bd) {
      bd = diff;
      best = d;
    }
  });
  return bd <= DIGIT_MAX_DIFF ? String(best) : null;
}
