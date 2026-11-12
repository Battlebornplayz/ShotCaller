/**
 * Fortnite inventory reading: pure code, no Electron. Works on two 1080p-sized copies of the HUD corners:
 * the hotbar (bottom right) and the health/shield bars (bottom left). Tuned on the two recordings
 * (default HUD, 1920x1080). The game is never touched.
 *
 * Hotbar (bottom right, 1080p): the pickaxe tile at x 1325 and slots 1-5 every 95 px, 80 px wide, y 932-1012.
 * - Rarity is the tile's colour (grey, green, blue, purple, orange, gold), read from its top strip.
 * - An empty slot is see-through: its top strip is the game behind it, a bit brighter.
 * - The held slot is raised and gets a white band at the bottom, with its count in dark digits on it.
 * - Counts (ammo for guns, stack size for items) are small white digits bottom right of each tile, matched
 *   against digit shapes taken from the recordings (`games/fortnite/slotDigits.json`).
 * Bars (bottom left, 1080p): shield y ~966, health y ~1002, both from x 68 to ~408; the filled part's length
 * gives the number (0-100).
 */

import type { FnRarity, FnSlotRead } from './fortnite';

/** The bottom-right area copied for the hotbar, at 1080p: x 1100-1920, y 880-1080. */
export const HOTBAR_AREA = { x: 1100, y: 880, width: 820, height: 200 } as const;
/** The bottom-left area copied for the bars, at 1080p: x 0-600, y 900-1080. */
export const BARS_AREA = { x: 0, y: 900, width: 600, height: 180 } as const;
/** The held item's name and count, left of the hotbar (read with Windows' text reader), at 1080p. */
export const HELD_LABEL_AREA = { x: 1040, y: 930, width: 280, height: 90 } as const;

const TILE_X0 = 1325;
const TILE_STEP = 95;
const TILE_W = 80;

export interface SlotDigits {
  size: [number, number];
  digits: Record<string, { w: number; r: number[] }>;
}

/** Reference tile colours (RGB, top strip) measured on the recordings. */
const RARITY_COLORS: [FnRarity, number, number, number][] = [
  ['common', 172, 178, 186],
  ['uncommon', 100, 198, 18],
  ['rare', 24, 173, 225],
  ['epic', 172, 72, 225],
  ['legendary', 222, 130, 38],
  ['mythic', 204, 188, 85],
];

function px(p: Uint8Array, w: number, x: number, y: number): [number, number, number] {
  const i = (y * w + x) * 4;
  return [p[i + 2], p[i + 1], p[i]];
}

/** Mean RGB of a box inside the hotbar copy (1080p screen coordinates). */
function mean(p: Uint8Array, x0: number, y0: number, x1: number, y1: number): [number, number, number] {
  const w = HOTBAR_AREA.width;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const c = px(p, w, x - HOTBAR_AREA.x, y - HOTBAR_AREA.y);
      r += c[0];
      g += c[1];
      b += c[2];
      n++;
    }
  return [r / n, g / n, b / n];
}

const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** The nearest reference colour by hue and brightness, or null when nothing is close. */
function rarityOf(c: [number, number, number], limit = 60): FnRarity | null {
  let best: FnRarity | null = null;
  let bd = limit;
  for (const [name, r, g, b] of RARITY_COLORS) {
    const d = dist(c, [r, g, b]);
    if (d < bd) {
      bd = d;
      best = name;
    }
  }
  return best;
}

/**
 * A tile's rarity: votes from points down both side edges (tiles get darker towards the bottom, so each point is
 * brightened to the reference's level first) plus the top strip. Item pictures often cover the top, rarely
 * both sides all the way down. Null when no colour gets enough votes.
 */
function tileRarity(p: Uint8Array, x0: number, top: [number, number, number]): FnRarity | null {
  const votes = new Map<FnRarity, number>();
  const vote = (r: FnRarity | null, n = 1) => r && votes.set(r, (votes.get(r) ?? 0) + n);
  vote(rarityOf(top), 3);
  for (let y = 940; y <= 990; y += 5)
    for (const x of [x0 + 3, x0 + TILE_W - 4]) {
      const c = px(p, HOTBAR_AREA.width, x - HOTBAR_AREA.x, y - HOTBAR_AREA.y);
      const mx = Math.max(...c);
      if (mx < 60) continue;
      // Lift darker points towards the reference brightness (the gradient), but not past it.
      let best: FnRarity | null = null;
      let bd = 45;
      for (const [name, r, g, b] of RARITY_COLORS) {
        const k = Math.max(1, Math.max(r, g, b) / mx);
        const d = dist([c[0] * k, c[1] * k, c[2] * k], [r, g, b]);
        if (d < bd) {
          bd = d;
          best = name;
        }
      }
      vote(best);
    }
  let win: FnRarity | null = null;
  let wn = 4;
  for (const [r, n] of votes)
    if (n > wn) {
      wn = n;
      win = r;
    }
  return win;
}

/**
 * How white a pixel is for the slot digits (0-1). `held` = dark digits on the white band instead. Digits on green
 * or blue tiles pick up the tile's tint at their edges, so a bright pixel counts even when it isn't grey.
 */
export function inkMap(p: Uint8Array, x0: number, y0: number, w: number, h: number, held: boolean, thr: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = px(p, HOTBAR_AREA.width, x0 + x - HOTBAR_AREA.x, y0 + y - HOTBAR_AREA.y);
      const mn = Math.min(r, g, b);
      const mx = Math.max(r, g, b);
      out[y * w + x] = held ? clamp01((140 - mx) / 60) : mx - mn < 70 || mn > 150 ? clamp01((mn - (thr - 25)) / 40) : 0;
    }
  return out;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Bilinear resize of a grey patch (values 0-1) to the template size. */
function resizeGrey(src: Float32Array, w: number, h: number, W: number, H: number): Float32Array {
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const fy = Math.min(h - 1, Math.max(0, ((y + 0.5) * h) / H - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(h - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(w - 1, Math.max(0, ((x + 0.5) * w) / W - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(w - 1, x0 + 1);
      const tx = fx - x0;
      const top = src[y0 * w + x0] * (1 - tx) + src[y0 * w + x1] * tx;
      const bot = src[y1 * w + x0] * (1 - tx) + src[y1 * w + x1] * tx;
      out[y * W + x] = top * (1 - ty) + bot * ty;
    }
  }
  return out;
}

function ncc(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    ab += x * y;
    aa += x * x;
    bb += y * y;
  }
  return ab / (Math.sqrt(aa * bb) + 1e-9);
}

/**
 * Reads the number in a tile's count area: splits the ink into pieces (pieces one pixel apart up and down are
 * joined, so a "9" with a thin waist stays one), matches each against the digit shapes, and keeps the
 * rightmost run of digits (the ammo icon on the left doesn't match any digit).
 */
export function readCount(ink: Float32Array, w: number, h: number, digits: SlotDigits): number | null {
  const on = new Uint8Array(w * h);
  for (let i = 0; i < on.length; i++) on[i] = ink[i] > 0.5 ? 1 : 0;
  // Join pieces one pixel apart vertically before labelling.
  const joined = new Uint8Array(on);
  for (let y = 1; y < h - 1; y++) for (let x = 0; x < w; x++) if (on[(y - 1) * w + x] && on[(y + 1) * w + x]) joined[y * w + x] = 1;
  const label = new Int32Array(w * h);
  const found: { x0: number; x1: number; d: number }[] = [];
  let next = 0;
  const [TW, TH] = digits.size;
  for (let s = 0; s < w * h; s++) {
    if (!joined[s] || label[s]) continue;
    next++;
    const stack = [s];
    label[s] = next;
    let x0 = w;
    let x1 = -1;
    let y0 = h;
    let y1 = -1;
    const members: number[] = [];
    while (stack.length) {
      const i = stack.pop()!;
      members.push(i);
      const x = i % w;
      const y = (i / w) | 0;
      if (on[i]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (joined[j] && !label[j]) {
          label[j] = next;
          stack.push(j);
        }
      }
    }
    if (x1 < 0) continue;
    const bh = y1 - y0 + 1;
    if (bh < 9 || bh > 15 || x1 - x0 + 1 < 2) continue;
    const mine = new Set(members);
    // Two digits that touch ("54") come out as one piece too wide for a digit: split at the thinnest column.
    const parts: [number, number][] = [[x0, x1]];
    if (x1 - x0 + 1 > 13) {
      if (x1 - x0 + 1 > 28) continue;
      let cut = -1;
      let least = Infinity;
      for (let x = x0 + 5; x <= x1 - 5; x++) {
        let col = 0;
        for (let y = y0; y <= y1; y++) if (mine.has(y * w + x)) col += ink[y * w + x];
        if (col < least) {
          least = col;
          cut = x;
        }
      }
      if (cut < 0) continue;
      parts[0] = [x0, cut - 1];
      parts.push([cut + 1, x1]);
    }
    for (const [px0, px1] of parts) {
      let py0 = h;
      let py1 = -1;
      for (const i of members) {
        const x = i % w;
        const y = (i / w) | 0;
        if (on[i] && x >= px0 && x <= px1) {
          if (y < py0) py0 = y;
          if (y > py1) py1 = y;
        }
      }
      const bw = px1 - px0 + 1;
      const ph = py1 - py0 + 1;
      if (ph < 9 || ph > 15 || bw < 2 || bw > 13) continue;
      const patch = new Float32Array(bw * ph);
      for (const i of members) {
        const x = i % w;
        const y = (i / w) | 0;
        if (x >= px0 && x <= px1 && y >= py0 && y <= py1) patch[(y - py0) * bw + (x - px0)] = ink[i];
      }
      const norm = resizeGrey(patch, bw, ph, TW, TH);
      let best = -1;
      let bs = -Infinity;
      for (const [d, t] of Object.entries(digits.digits)) {
        const sc = ncc(t.r, norm) - Math.abs(t.w - bw) * 0.05;
        if (sc > bs) {
          bs = sc;
          best = Number(d);
        }
      }
      (globalThis as { fnDebugCount?: (...a: unknown[]) => void }).fnDebugCount?.('piece', px0, px1, py0, py1, 'best', best, bs.toFixed(2));
      if (bs > 0.7) found.push({ x0: px0, x1: px1, d: best });
    }
  }
  if (!found.length) return null;
  found.sort((a, b) => a.x0 - b.x0);
  const run = [found[found.length - 1]];
  for (let i = found.length - 2; i >= 0; i--) {
    if (run[0].x0 - found[i].x1 > 5) break;
    run.unshift(found[i]);
  }
  if (run.length > 4) return null;
  return Number(run.map((r) => r.d).join(''));
}

export interface HotbarRead {
  /** False when the hotbar isn't showing (menus, map, spectating, covered). */
  seen: boolean;
  /** Slots 1-5 (the pickaxe isn't listed). */
  slots: FnSlotRead[];
  /** 1-5, 0 = pickaxe, null = unknown. */
  held: number | null;
}

/** Reads the 5 slots from the bottom-right copy (`HOTBAR_AREA`, 1080p, BGRA). */
export function readHotbarSlots(p: Uint8Array, digits: SlotDigits): HotbarRead {
  const tiles: { rarity: FnRarity | null; empty: boolean; held: boolean; count: number | null }[] = [];
  for (let k = 0; k < 6; k++) {
    const x0 = TILE_X0 + TILE_STEP * k;
    const top = mean(p, x0 + 4, 935, x0 + TILE_W - 4, 941);
    // The held tile's white band, sampled in two places: the count and ammo icon can cover either one.
    const band = mean(p, x0 + 30, 1003, x0 + 50, 1010);
    const bandLeft = mean(p, x0 + 6, 1003, x0 + 22, 1010);
    const above = mean(p, x0 + 4, 915, x0 + TILE_W - 4, 921);
    const held = Math.min(...band) > 205 || Math.min(...bandLeft) > 205;
    // See-through: the top strip is the game behind it, brightened ~1.25x.
    const seeThrough = !held && dist(top, above.map((v) => Math.min(255, v * 1.25))) < 40 && dist(top, above) < 90;
    const rarity = tileRarity(p, x0, top);
    let count: number | null = null;
    if (k > 0) {
      let bg = 0;
      let n = 0;
      for (let x = x0 + 5; x < x0 + 75; x += 3) {
        bg += Math.min(...px(p, HOTBAR_AREA.width, x - HOTBAR_AREA.x, 937 - HOTBAR_AREA.y));
        n++;
      }
      const thr = Math.max(178, bg / n + 28);
      const y0 = held ? 990 : 974;
      count = readCount(inkMap(p, x0 + 30, y0, 48, 26, held, thr), 48, 26, digits);
    }
    // Every hotbar item shows a number (ammo or stack size). A readable number means an item, even over ground
    // the same colour as the tile; no number means empty, unless it's held (the band hides it) or plainly a
    // coloured tile. Measured with `npm run test:fortnite`.
    const empty = k > 0 && !held && count === null ? seeThrough || rarity === null || rarity === 'common' || rarity === 'mythic' : k > 0 ? false : seeThrough;
    tiles.push({ rarity, empty, held, count });
  }
  // The pickaxe is always there, grey (or held): without it the hotbar isn't on screen.
  const pick = tiles[0];
  const seen = pick.held || pick.rarity === 'common';
  const heldIdx = tiles.findIndex((t) => t.held);
  return {
    seen,
    held: seen && heldIdx >= 0 ? heldIdx : null,
    slots: tiles.slice(1).map((t, i) => ({
      slot: i + 1,
      empty: t.empty,
      rarity: t.empty ? null : t.rarity,
      count: t.count,
      held: t.held,
    })),
  };
}

/**
 * Shield and health (0-100) from the bars' filled length, from the bottom-left copy (`BARS_AREA`).
 * The HUD is known to be there from the white "+" health icon at x ~50 (bright on any ground: grass, water,
 * storm), and the fill is read as one unbroken run from the left in the bars' own strong colours, which
 * grass (green ~190) and water (blue ~160) don't reach. Checked with `npm run test:fortnite`.
 */
export function readBars(p: Uint8Array): { health: number | null; shield: number | null } {
  const W = BARS_AREA.width;
  const at = (x: number, y: number) => px(p, W, x, y - BARS_AREA.y);
  const isBlue = ([r, g, b]: number[]) => b > 195 && b > r + 110 && g > 130;
  const isGreen = ([r, g, b]: number[]) => g > 198 && g > b + 100 && !(r > 200 && b > 150);
  // White, or red while you're taking damage.
  const white = (c: number[]) => Math.min(...c) > 175 || (c[0] > 200 && c[1] < 90 && c[2] < 140);
  let icon = 0;
  for (let y = 997; y <= 1007; y += 2) for (let x = 48; x <= 52; x++) if (white(at(x, y))) icon++;
  if (icon < 8) return { health: null, shield: null };
  const fill = (y: number, test: (c: number[]) => boolean): number => {
    let last = -1;
    for (let x = 68; x <= 408; x++) {
      // Two rows, to ride over a pixel of text or noise; a gap of 8 px ends the run.
      if (test(at(x, y)) || test(at(x, y + 4))) last = x;
      else if (x - Math.max(last, 67) > 8) break;
    }
    return last < 0 ? 0 : Math.min(1, (last - 67) / 336);
  };
  const health = fill(1002, isGreen);
  const shield = fill(964, isBlue);
  if (health < 0.02) return { health: null, shield: Math.round(shield * 100) };
  return { health: Math.round(health * 100), shield: Math.round(shield * 100) };
}

/** Item rarity from the word Fortnite writes before the held item's name ("RARE SKYLINE DEPLOYER"). */
export function parseHeldLabel(text: string): { name: string | null; rarity: FnRarity | null; mag: number | null; reserve: number | null } {
  const words = text
    .replace(/[|]/g, ' | ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
  const rarityWords: Record<string, FnRarity> = { COMMON: 'common', UNCOMMON: 'uncommon', RARE: 'rare', EPIC: 'epic', LEGENDARY: 'legendary', MYTHIC: 'mythic', EXOTIC: 'exotic' };
  let rarity: FnRarity | null = null;
  const nums: number[] = [];
  const nameWords: string[] = [];
  for (const raw of words) {
    // Stray marks around numbers ("24+") and around the rarity word's box ("JNCOMMONJ").
    const w = /\d/.test(raw) && !/[A-Z]{2}/i.test(raw) ? raw.replace(/[^\d]/g, '') : raw;
    const up = w.toUpperCase();
    const fuzzy = rarityWords[up] ?? (/NCOMMON/.test(up) ? 'uncommon' : /COMMON/.test(up) ? 'common' : /LEGEND/.test(up) ? 'legendary' : /MYTHI/.test(up) ? 'mythic' : /EXOTI/.test(up) ? 'exotic' : null);
    if (fuzzy) {
      rarity ??= fuzzy;
      continue;
    }
    if (/^\d{1,4}$/.test(w)) nums.push(Number(w));
    else if (/^[A-Z][A-Z0-9'.-]*$/i.test(w) && w.length > 1 && up === w) nameWords.push(w);
  }
  const name = nameWords.length ? nameWords.join(' ') : null;
  return { name, rarity, mag: nums[0] ?? null, reserve: nums[1] ?? null };
}
