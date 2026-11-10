/**
 * Fortnite live map: finds where you are by matching the minimap picture against the season map
 * (https://fortnite-api.com/images/map.png, 2048x2048). Pure code, no Electron.
 *
 * The minimap (1080p: x 1636-1888, y 32-284) is north-up and, on foot, shows a fixed-size window of the map
 * centred on you. Both pictures are turned to grey and compared with brightness-normalised correlation, so the
 * storm's pink tint and day/night shifts matter little. The centre (your arrow), the top strip (icons) and the
 * edges are left out of the comparison. A search runs near the last spot; the whole map only when lost.
 */

export interface GreyImage {
  width: number;
  height: number;
  data: Float32Array;
  /** Pixels to leave out of matching (1 = ignore), e.g. place-name labels drawn on the minimap. */
  ignore?: Float32Array;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The minimap square at 1080p; it hangs off the top-right corner, so other sizes scale from there. */
export function minimapArea(width: number, height: number): Box {
  const k = height / 1080;
  const size = Math.round(252 * k);
  return { x: Math.round(width - (1920 - 1636) * k), y: Math.round(32 * k), width: size, height: size };
}

/** Map pixels (of the 2048 map) the minimap's width covers, on foot. Measured on the recordings. */
export const MINIMAP_SPAN = 240;

export function bgraToGrey(bgra: Uint8Array, width: number, height: number): GreyImage {
  const data = new Float32Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = 0.299 * bgra[i * 4 + 2] + 0.587 * bgra[i * 4 + 1] + 0.114 * bgra[i * 4];
  return { width, height, data };
}

/**
 * The minimap as grey, with its labels marked to ignore: place names and the route line are drawn in bright
 * white (pink-white in the storm) with a dark outline, and aren't on the map. Bright pixels are marked and the
 * mark is grown by a few pixels to cover the outline.
 */
export function minimapGrey(bgra: Uint8Array, width: number, height: number): GreyImage {
  const img = bgraToGrey(bgra, width, height);
  const bright = new Uint8Array(width * height);
  for (let i = 0; i < bright.length; i++) {
    const r = bgra[i * 4 + 2];
    const g = bgra[i * 4 + 1];
    const b = bgra[i * 4];
    if (Math.min(r, g, b) > LABEL_MIN && img.data[i] > LABEL_LUMA) bright[i] = 1;
  }
  const grow = Math.max(1, Math.round((LABEL_GROW * width) / 252));
  const ignore = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!bright[y * width + x]) continue;
      for (let dy = -grow; dy <= grow; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -grow; dx <= grow; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < width) ignore[yy * width + xx] = 1;
        }
      }
    }
  }
  img.ignore = ignore;
  return img;
}

const LABEL_MIN = 170;
const LABEL_LUMA = 200;
const LABEL_GROW = 3;

/** Area-average resize to an exact size (any factor). */
export function resize(img: GreyImage, width: number, height: number): GreyImage {
  const out = new Float32Array(width * height);
  const sx = img.width / width;
  const sy = img.height / height;
  for (let y = 0; y < height; y++) {
    const y0 = y * sy;
    const y1 = y0 + sy;
    for (let x = 0; x < width; x++) {
      const x0 = x * sx;
      const x1 = x0 + sx;
      let sum = 0;
      let wsum = 0;
      for (let yy = Math.floor(y0); yy < Math.ceil(y1); yy++) {
        const wy = Math.min(y1, yy + 1) - Math.max(y0, yy);
        if (wy <= 0 || yy >= img.height) continue;
        for (let xx = Math.floor(x0); xx < Math.ceil(x1); xx++) {
          const wx = Math.min(x1, xx + 1) - Math.max(x0, xx);
          if (wx <= 0 || xx >= img.width) continue;
          sum += img.data[yy * img.width + xx] * wx * wy;
          wsum += wx * wy;
        }
      }
      out[y * width + x] = wsum ? sum / wsum : 0;
    }
  }
  return { width, height, data: out };
}

/**
 * Keeps only fine detail: each pixel minus the average of its neighbourhood (box of 2r+1). Slow changes like
 * the storm's pink tint, its soft edge and night shading drop out; coastlines, roads and buildings stay.
 */
export function highPass(img: GreyImage, r: number): GreyImage {
  const { width: w, height: h, data } = img;
  // Integral image for fast box sums.
  const ii = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += data[y * w + x];
      ii[(y + 1) * (w + 1) + x + 1] = ii[y * (w + 1) + x + 1] + row;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const sum = ii[y1 * (w + 1) + x1] - ii[y0 * (w + 1) + x1] - ii[y1 * (w + 1) + x0] + ii[y0 * (w + 1) + x0];
      out[y * w + x] = data[y * w + x] - sum / ((x1 - x0) * (y1 - y0));
    }
  }
  return { width: w, height: h, data: out };
}

/** Neighbourhood for highPass, in full-map pixels. */
const DETAIL_RADIUS = 12;

/** A zero-mean template with its mask: only the pixels in `idx` take part. */
interface Template {
  size: number;
  idx: Int32Array;
  /** Template value (zero-mean, unit length) for each index. */
  val: Float32Array;
  /** Offsets of each masked pixel in a map row-major layout, filled per level. */
}

/** Which minimap pixels to compare: not the centre (your arrow), not the top strip (icons), not the edges. */
function maskFor(size: number): Uint8Array {
  const m = new Uint8Array(size * size);
  const c = (size - 1) / 2;
  const edge = Math.max(1, Math.round(size * 0.04));
  const top = Math.round(size * 0.14);
  const hole = size * 0.08;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x < edge || y < edge || x >= size - edge || y >= size - edge) continue;
      if (y < top && x > size * 0.5) continue; // Icons along the top right (mouse, pin, M, map key).
      if (Math.hypot(x - c, y - c) < hole) continue;
      m[y * size + x] = 1;
    }
  }
  return m;
}

function makeTemplate(mini: GreyImage, size: number): Template | null {
  const ign = mini.ignore ? resize({ width: mini.width, height: mini.height, data: mini.ignore }, size, size).data : null;
  const small = HIGH_PASS ? highPass(resize(mini, size, size), Math.max(1, Math.round((DETAIL_RADIUS * size) / MINIMAP_SPAN))) : resize(mini, size, size);
  const mask = maskFor(size);
  if (ign) {
    let kept = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i] && ign[i] > 0.25) mask[i] = 0;
    for (const v of mask) kept += v;
    // Mostly labels or a white popup: too little map left to place.
    if (kept < mask.length * 0.35) return null;
  }
  let n = 0;
  for (const v of mask) n += v;
  const idx = new Int32Array(n);
  const val = new Float32Array(n);
  let k = 0;
  let mean = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    idx[k] = i;
    val[k] = small.data[i];
    mean += small.data[i];
    k++;
  }
  mean /= n;
  let norm = 0;
  for (let i = 0; i < n; i++) {
    val[i] -= mean;
    norm += val[i] * val[i];
  }
  norm = Math.sqrt(norm);
  // A flat minimap (all water, a menu over it) can't be placed.
  if (norm / Math.sqrt(n) < 6) return null;
  for (let i = 0; i < n; i++) val[i] /= norm;
  return { size, idx, val };
}

/** Correlation of the template with the map level at top-left (x, y). */
function scoreAt(level: GreyImage, t: Template, offsets: Int32Array, x: number, y: number): number {
  const base = y * level.width + x;
  const d = level.data;
  let s = 0;
  let s2 = 0;
  let st = 0;
  const n = offsets.length;
  for (let i = 0; i < n; i++) {
    const v = d[base + offsets[i]];
    s += v;
    s2 += v * v;
    st += v * t.val[i];
  }
  const variance = s2 - (s * s) / n;
  return variance <= 1e-3 ? -1 : st / Math.sqrt(variance);
}

function offsetsFor(t: Template, levelWidth: number): Int32Array {
  const o = new Int32Array(t.idx.length);
  for (let i = 0; i < o.length; i++) o[i] = Math.floor(t.idx[i] / t.size) * levelWidth + (t.idx[i] % t.size);
  return o;
}

export interface Fix {
  /** Your position in full map pixels (0-2048). */
  x: number;
  y: number;
  score: number;
  /** Whole-map searches only: the winner's and the best far-away spot's score on the 1/4 map. */
  coarse: { best: number; runnerUp: number } | null;
}

interface Level {
  img: GreyImage;
  /** Full-map pixels per level pixel. */
  scale: number;
}

export class MapLocator {
  private readonly levels: Level[];
  readonly mapSize: number;
  readonly span: number;

  /** `map` is the season map in grey at full size (2048). */
  constructor(map: GreyImage, span = MINIMAP_SPAN) {
    this.mapSize = map.width;
    this.span = span;
    this.levels = [8, 4, 2].map((f) => {
      const img = resize(map, Math.round(map.width / f), Math.round(map.height / f));
      return { img: HIGH_PASS ? highPass(img, Math.max(1, Math.round(DETAIL_RADIUS / f))) : img, scale: f };
    });
  }

  private search(level: Level, mini: GreyImage, cx: number, cy: number, radius: number, keepRunnerUp: boolean): Fix | null {
    const size = Math.round(this.span / level.scale);
    const t = makeTemplate(mini, size);
    if (!t) return null;
    const off = offsetsFor(t, level.img.width);
    const half = size / 2;
    // Top-left range for centres within the radius (all in level pixels).
    const lcx = cx / level.scale;
    const lcy = cy / level.scale;
    const r = radius / level.scale;
    const x0 = Math.max(0, Math.floor(lcx - r - half));
    const y0 = Math.max(0, Math.floor(lcy - r - half));
    const x1 = Math.min(level.img.width - size, Math.ceil(lcx + r - half));
    const y1 = Math.min(level.img.height - size, Math.ceil(lcy + r - half));
    let best = { x: 0, y: 0, s: -2 };
    const all: { x: number; y: number; s: number }[] = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const s = scoreAt(level.img, t, off, x, y);
        if (s > best.s) best = { x, y, s };
        if (keepRunnerUp) all.push({ x, y, s });
      }
    }
    if (best.s < -1) return null;
    this.lastPeaks = keepRunnerUp ? topPeaks(all, size * 0.5, PEAKS).map((p) => ({ x: (p.x + half) * level.scale, y: (p.y + half) * level.scale, s: p.s })) : [];
    return { x: (best.x + half) * level.scale, y: (best.y + half) * level.scale, score: best.s, coarse: null };
  }

  private lastPeaks: { x: number; y: number; s: number }[] = [];

  /**
   * Where the minimap is on the map. With a `near` hint, searches `radius` full-map pixels around it;
   * without, the whole map (about a second in JS). Refined down to 2-pixel steps.
   */
  locate(mini: GreyImage, near: { x: number; y: number } | null, radius = 64): Fix | null {
    const [l8, l4, l2] = this.levels;
    let fix: Fix | null;
    let coarse: Fix['coarse'] = null;
    if (near) {
      fix = this.search(l4, mini, near.x, near.y, radius, false);
    } else {
      // The 1/8 map is too coarse to pick the winner, but the right spot is nearly always among its best few
      // dozen: check each of those on the 1/4 map. The second best (far from the winner) says how sure it is.
      if (!this.search(l8, mini, this.mapSize / 2, this.mapSize / 2, this.mapSize, true)) return null;
      const checked: Fix[] = [];
      for (const p of this.lastPeaks) {
        const f = this.search(l4, mini, p.x, p.y, 16, false);
        if (f) checked.push(f);
      }
      checked.sort((a, b) => b.score - a.score);
      fix = checked[0] ?? null;
      if (fix) {
        const away = this.span * 0.5;
        coarse = { best: fix.score, runnerUp: checked.find((c) => Math.hypot(c.x - fix!.x, c.y - fix!.y) > away)?.score ?? -1 };
      }
    }
    if (!fix) return null;
    const fine = this.search(l2, mini, fix.x, fix.y, 6, false);
    if (!fine) return null;
    return { ...fine, coarse };
  }
}

const PEAKS = 30;
/** Match fine detail only (see highPass); plain grey matched worse in the storm. */
const HIGH_PASS = true;

/** The best `k` scores that are at least `apart` from each other. */
function topPeaks(all: { x: number; y: number; s: number }[], apart: number, k: number): { x: number; y: number; s: number }[] {
  const sorted = [...all].sort((a, b) => b.s - a.s);
  const out: typeof sorted = [];
  for (const p of sorted) {
    if (out.length >= k) break;
    if (out.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= apart)) out.push(p);
  }
  return out;
}

/** Near the last spot, a fix counts at this score or more (on-foot frames 0.33-0.9, the storm ~0.35). */
export const TRACK_THRESHOLD = 0.3;
/** Lost: a whole-map fix needs this score and to beat every far-away spot by MARGIN on the 1/4 map. */
export const FIND_THRESHOLD = 0.4;
export const FIND_MARGIN = 0.05;
/** Full-map pixels you can move per second (sprinting is ~5; cars and launch pads more). */
export const MAX_SPEED = 40;

export type DotState = 'sure' | 'unsure';

/**
 * Turns one locate() per read into a dot you can trust. Tracks near the last spot; when lost, searches the
 * whole map and accepts a new spot only when it clearly wins and is found twice in a row (within 24 px).
 * Anything else reports "not sure" and keeps the last spot.
 */
export class DotTracker {
  last: { x: number; y: number; at: number } | null = null;
  private candidate: { x: number; y: number } | null = null;
  private readonly locator: MapLocator;

  constructor(locator: MapLocator) {
    this.locator = locator;
  }

  reset(): void {
    this.last = null;
    this.candidate = null;
  }

  update(mini: GreyImage, at: number): { state: DotState; x: number; y: number; score: number } | null {
    if (this.last) {
      const dt = Math.min(10, (at - this.last.at) / 1000);
      const radius = Math.min(160, 24 + MAX_SPEED * dt);
      const near = this.locator.locate(mini, this.last, radius);
      if (near && near.score >= TRACK_THRESHOLD) {
        this.last = { x: near.x, y: near.y, at };
        this.candidate = null;
        return { state: 'sure', x: near.x, y: near.y, score: near.score };
      }
      // Lost for more than a few seconds: look everywhere.
      if (at - this.last.at < 4000) return { state: 'unsure', x: this.last.x, y: this.last.y, score: near?.score ?? 0 };
    }
    const fix = this.locator.locate(mini, null);
    const clear = fix && fix.score >= FIND_THRESHOLD && fix.coarse && fix.coarse.best - fix.coarse.runnerUp >= FIND_MARGIN;
    if (fix && clear) {
      if (this.candidate && Math.hypot(this.candidate.x - fix.x, this.candidate.y - fix.y) <= 24) {
        this.last = { x: fix.x, y: fix.y, at };
        this.candidate = null;
        return { state: 'sure', x: fix.x, y: fix.y, score: fix.score };
      }
      this.candidate = { x: fix.x, y: fix.y };
    } else this.candidate = null;
    return this.last ? { state: 'unsure', x: this.last.x, y: this.last.y, score: fix?.score ?? 0 } : null;
  }
}
