/**
 * Recognizes Skillshot City skill icons in a picture of the screen. Pure code: no Electron, no capture.
 *
 * Each skill's icon is a white glyph on a transparent cell in the game's own texture sheet. In the game it
 * sits on a coloured, sometimes dimmed background, so pictures are compared by shape: normalized
 * cross-correlation ignores overall brightness and contrast. 1 is a perfect match; unrelated pictures
 * usually stay well under 0.7.
 */

import type { ScreenRead } from './skillshot';

export interface GrayImage {
  width: number;
  height: number;
  data: Float32Array;
}

export interface IconTemplate {
  id: string;
  size: number;
  /** Zero-mean, unit-length pixels, so a match is just a dot product against a normalized window. */
  data: Float32Array;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface IconMatch {
  id: string;
  score: number;
  /** How far ahead of the next-best skill it is. */
  gap: number;
}

/**
 * Below either of these a read counts as "no icon here". Measured on 2 real 1080p screenshots: sharp icons
 * score 0.83-0.93 with a gap over 0.2, and none of 9,436 other spots passed (99.99th percentile score 0.73).
 * Not yet measured on the draft cards themselves.
 */
export const MIN_SCORE = 0.78;
export const MIN_GAP = 0.1;
/** A clear slot's lead over the next-best skill. Force Field has lookalikes and sits at 0.09-0.12. */
const CLEAR_GAP = 0.08;
/** Good enough for the second slot when the first is clear. */
const FAIR_SCORE = 0.66;
/** Good enough to keep showing an offer that's already up. */
const KEEP_SCORE = 0.6;

/** Greyscale from 4-byte pixels. Works for RGBA and BGRA, since all three colours count the same. */
export function toGray(pixels: Uint8Array, width: number, height: number): GrayImage {
  const data = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i++, p += 4) data[i] = (pixels[p] + pixels[p + 1] + pixels[p + 2]) / 3;
  return { width, height, data };
}

/** Scales a part of an image to a new size by averaging the source area under each new pixel. */
export function resample(src: GrayImage, box: Box, width: number, height: number): GrayImage {
  const out = new Float32Array(width * height);
  const sx = box.width / width;
  const sy = box.height / height;
  for (let y = 0; y < height; y++) {
    const y0 = box.y + y * sy;
    const y1 = y0 + sy;
    for (let x = 0; x < width; x++) {
      const x0 = box.x + x * sx;
      const x1 = x0 + sx;
      let sum = 0;
      let weight = 0;
      for (let v = Math.floor(y0); v < Math.ceil(y1); v++) {
        if (v < 0 || v >= src.height) continue;
        const wy = Math.min(y1, v + 1) - Math.max(y0, v);
        for (let u = Math.floor(x0); u < Math.ceil(x1); u++) {
          if (u < 0 || u >= src.width) continue;
          const w = wy * (Math.min(x1, u + 1) - Math.max(x0, u));
          sum += src.data[v * src.width + u] * w;
          weight += w;
        }
      }
      out[y * width + x] = weight ? sum / weight : 0;
    }
  }
  return { width, height, data: out };
}

function normalize(px: Float32Array): Float32Array {
  let mean = 0;
  for (const v of px) mean += v;
  mean /= px.length;
  let norm = 0;
  const out = new Float32Array(px.length);
  for (let i = 0; i < px.length; i++) {
    out[i] = px[i] - mean;
    norm += out[i] * out[i];
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

/** Builds a template from an icon cell (RGBA with transparency): the glyph drawn on black, scaled to `size`. */
export function makeTemplate(id: string, rgba: Uint8Array, cellW: number, cellH: number, size: number): IconTemplate {
  const flat = new Float32Array(cellW * cellH);
  for (let i = 0, p = 0; i < flat.length; i++, p += 4) {
    flat[i] = (((rgba[p] + rgba[p + 1] + rgba[p + 2]) / 3) * rgba[p + 3]) / 255;
  }
  const small = resample({ width: cellW, height: cellH, data: flat }, { x: 0, y: 0, width: cellW, height: cellH }, size, size);
  return { id, size, data: normalize(small.data) };
}

/**
 * Finds the best skill for an icon expected near the centre of `box`. The box is scaled so the icon comes
 * out at template size, then every template is tried at every offset up to `slack` template pixels, which
 * absorbs small differences in where the game draws it.
 */
export function matchIcon(frame: GrayImage, box: Box, templates: IconTemplate[], slack = 3): IconMatch | null {
  if (!templates.length) return null;
  const size = templates[0].size;
  const span = size + slack * 2;
  const area = resample(frame, box, span, span);
  const best = new Map<string, number>();
  const win = new Float32Array(size * size);
  for (let dy = 0; dy <= slack * 2; dy++) {
    for (let dx = 0; dx <= slack * 2; dx++) {
      for (let y = 0; y < size; y++) {
        const from = (y + dy) * span + dx;
        win.set(area.data.subarray(from, from + size), y * size);
      }
      const norm = normalize(win);
      for (const t of templates) {
        let dot = 0;
        for (let i = 0; i < norm.length; i++) dot += norm[i] * t.data[i];
        if (dot > (best.get(t.id) ?? -2)) best.set(t.id, dot);
      }
    }
  }
  const ranked = [...best.entries()].sort((a, b) => b[1] - a[1]);
  return { id: ranked[0][0], score: ranked[0][1], gap: ranked[0][1] - (ranked[1]?.[1] ?? -1) };
}

// ---------------------------------------------------------------------------------------------
// Where things are on the game's screen

export const OFFER_TEMPLATE_SIZE = 32;
const OFFER_SLACK = 3;
/** Your build's icons, seen small in the top-centre row. */
export const BUILD_TEMPLATE_SIZE = 24;
/** The row's smaller icons score lower than the cards (0.81 for the real pick, 0.64 for the other). */
const PICK_SCORE = 0.72;

export interface DraftGeometry {
  /** The part of the game's picture to copy, in window pixels. */
  capture: Box;
  /** Where each offered icon is looked for, inside the capture. */
  offers: [Box, Box];
  /** The build row, inside the capture. */
  buildRow: Box;
  buildIconPx: number;
  /** The start of each card's `Lvl x/y` text, inside the capture. Stops short of the green NEW SKILL! text. */
  levelText: [Box, Box];
  /** The clickable cards, in window pixels. */
  cards: [Box, Box];
}

/**
 * Measured at 1920x1080 (game version 0.992.23): offer icons 38 px at x 769 and 994, y 47; build icons 28 px
 * in a row centred on x 960, y 31 (y 45 on the end screen); level text from x 800 and 1025, y 48-66. Other
 * resolutions assume the UI scales with height and stays centred, which hasn't been checked.
 */
export function draftGeometry(width: number, height: number): DraftGeometry {
  const s = height / 1080;
  const ox = Math.max(0, Math.round(width / 2 + (740 - 960) * s));
  const at = (x: number, y: number, w: number, h: number): Box => ({ x: width / 2 + (x - 960) * s, y: y * s, width: w * s, height: h * s });
  const local = (b: Box): Box => ({ ...b, x: b.x - ox });
  const span = (38 * (OFFER_TEMPLATE_SIZE + OFFER_SLACK * 2)) / OFFER_TEMPLATE_SIZE;
  const offer = (cx: number) => local(at(cx - span / 2, 47 - span / 2, span, span));
  return {
    capture: { x: ox, y: 0, width: Math.round(400 * s), height: Math.round(75 * s) },
    offers: [offer(769), offer(994)],
    buildRow: local(at(850, 8, 220, 52)),
    buildIconPx: 28 * s,
    levelText: [local(at(800, 48, 50, 18)), local(at(1025, 48, 50, 18))],
    cards: [at(745, 25, 200, 105), at(970, 25, 200, 105)],
  };
}

/** Best score for one icon anywhere in a box. */
export function findIcon(frame: GrayImage, box: Box, iconPx: number, t: IconTemplate): number {
  const k = t.size / iconPx;
  const w = Math.round(box.width * k);
  const h = Math.round(box.height * k);
  if (w < t.size || h < t.size) return -1;
  const area = resample(frame, box, w, h);
  const win = new Float32Array(t.size * t.size);
  let best = -1;
  for (let dy = 0; dy <= h - t.size; dy++) {
    for (let dx = 0; dx <= w - t.size; dx++) {
      for (let y = 0; y < t.size; y++) {
        const from = (y + dy) * w + dx;
        win.set(area.data.subarray(from, from + t.size), y * t.size);
      }
      const norm = normalize(win);
      let dot = 0;
      for (let i = 0; i < norm.length; i++) dot += norm[i] * t.data[i];
      if (dot > best) best = dot;
    }
  }
  return best;
}

/**
 * Which offered skill just joined your build row? Only skills you didn't already have can tell: an upgrade
 * leaves the row as it was. Returns null when the row doesn't settle it.
 */
export function pickFromBuildRow(frame: GrayImage, geo: DraftGeometry, offered: IconTemplate[], owned: ReadonlySet<string>): string | null {
  const scored = offered
    .filter((t) => !owned.has(t.id))
    .map((t) => ({ id: t.id, score: findIcon(frame, geo.buildRow, geo.buildIconPx, t) }))
    .sort((a, b) => b.score - a.score);
  if (!scored.length || scored[0].score < PICK_SCORE) return null;
  return scored.length === 1 || scored[0].score - scored[1].score >= MIN_GAP ? scored[0].id : null;
}

/**
 * Reads both offer slots: the two skill ids, or null when there's no offer. A real offer always fills both
 * slots and an idle screen fills neither, so one clear slot lets the other be merely fair. Measured on a real
 * match: 11 drafts, every skill right, lowest true scores 0.71 (Vampirism) with gaps down to 0.09 (Force Field).
 * Once an offer is up, the same skills only have to stay roughly visible, so it can't flicker off and on.
 */
export function readOffers(
  frame: GrayImage,
  geo: DraftGeometry,
  templates: IconTemplate[],
  current: string[] = [],
): { ids: string[]; scores: number[]; partial: boolean } | null {
  const slots = [matchIcon(frame, geo.offers[0], templates, OFFER_SLACK), matchIcon(frame, geo.offers[1], templates, OFFER_SLACK)];
  const [left, right] = slots;
  if (!left || !right) return null;
  const scores = [left.score, right.score];
  const ids = [left.id, right.id];
  if (current.length === 2 && ids[0] === current[0] && ids[1] === current[1] && Math.min(...scores) >= KEEP_SCORE) return { ids, scores, partial: false };
  const clear = [left, right].map((m) => m.score >= MIN_SCORE && m.gap >= CLEAR_GAP);
  const fair = [left, right].map((m) => m.score >= FAIR_SCORE && m.gap >= MIN_GAP);
  if ((clear[0] && (clear[1] || fair[1])) || (clear[1] && fair[0])) return { ids, scores, partial: false };
  // One clear slot and one not: nothing to act on, but worth keeping a picture of (see the screen reader).
  return clear[0] || clear[1] ? { ids: [], scores, partial: true } : null;
}

/**
 * The colour of a card's `Lvl x/y` text gives the skill's rarity. Hue and saturation of the text, measured on 21
 * real 1080p strips at game version 0.992.23, and checked against the x/4, x/5, x/6, x/7 printed on the cards:
 * Common 219 / 0.43, Rare 186 / 0.89, Epic 282 / 0.66, Legendary 49 / 0.81. A frame caught mid-fade held at
 * hue 190 (Rare) and 269 (Epic). The bands leave gaps between them on purpose: anything else is "not sure".
 */
const RARITY_BANDS = [
  { hue: [205, 235], sat: [0.3, 0.6] },
  { hue: [175, 200], sat: [0.7, 1] },
  { hue: [260, 300], sat: [0.5, 0.8] },
  { hue: [35, 60], sat: [0.65, 1] },
] as const;
/** Text has to be this bright, and this much brighter than what's around it, to count as text. */
const RARITY_MIN_VALUE = 0.6;
const RARITY_MIN_CONTRAST = 0.2;
/** Share of the box's pixels taken as the text: the brightest ones. */
const RARITY_TEXT_SHARE = 0.12;

/**
 * Reads a skill's rarity (0 Common … 3 Legendary) from the level text in `box`, or null when not sure. Takes raw
 * 4-byte pixels because this needs colour: `order` matters here, unlike in `toGray`. Screen copies are BGRA.
 */
export function readRarity(pixels: Uint8Array, width: number, box: Box, order: 'bgra' | 'rgba' = 'bgra'): number | null {
  const height = Math.floor(pixels.length / 4 / width);
  const x0 = Math.max(0, Math.round(box.x));
  const x1 = Math.min(width, Math.round(box.x + box.width));
  const y0 = Math.max(0, Math.round(box.y));
  const y1 = Math.min(height, Math.round(box.y + box.height));
  const px: { r: number; g: number; b: number; v: number }[] = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const p = (y * width + x) * 4;
      const r = pixels[p + (order === 'bgra' ? 2 : 0)];
      const g = pixels[p + 1];
      const b = pixels[p + (order === 'bgra' ? 0 : 2)];
      px.push({ r, g, b, v: Math.max(r, g, b) });
    }
  }
  if (px.length < 20) return null;
  px.sort((a, c) => c.v - a.v);
  const text = px.slice(0, Math.max(3, Math.round(px.length * RARITY_TEXT_SHARE)));
  const middle = (values: number[]) => values.sort((a, c) => a - c)[values.length >> 1];
  const r = middle(text.map((t) => t.r)) / 255;
  const g = middle(text.map((t) => t.g)) / 255;
  const b = middle(text.map((t) => t.b)) / 255;
  const max = Math.max(r, g, b);
  const span = max - Math.min(r, g, b);
  if (max < RARITY_MIN_VALUE || max - px[px.length >> 1].v / 255 < RARITY_MIN_CONTRAST || span === 0) return null;
  const sat = span / max;
  const hue = (max === r ? ((g - b) / span + 6) % 6 : max === g ? (b - r) / span + 2 : (r - g) / span + 4) * 60;
  const found = RARITY_BANDS.findIndex((band) => hue >= band.hue[0] && hue <= band.hue[1] && sat >= band.sat[0] && sat <= band.sat[1]);
  return found < 0 ? null : found;
}

/** True when nearly all of a picture is black: the copy worked but shows nothing (e.g. exclusive fullscreen). */
export function isBlank(frame: GrayImage): boolean {
  let lit = 0;
  for (let i = 0; i < frame.data.length; i += 7) if (frame.data[i] > 12) lit++;
  return lit * 7 < frame.data.length * 0.01;
}

// ---------------------------------------------------------------------------------------------
// Checking reads against the game's log

const sameSkills = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
/** The log's times are whole seconds, so a read can look very slightly late. */
const LOG_SLOP_MS = 2000;
/** A waiting read this close before a logged draft that doesn't match was that draft, read wrongly. */
const SAME_DRAFT_MS = 60_000;

/**
 * Marks a read right or wrong when the log writes the matching draft, which can be minutes later. The log is
 * the game's own record, so it's the answer key. Changes `reads` in place.
 */
export function checkAgainstLog(reads: ScreenRead[], log: { offers: string[]; picked: string | null; at: number }, nextId: number): void {
  const waiting = reads.filter((r) => r.verdict === 'waiting' && r.at <= log.at + LOG_SLOP_MS);
  const read = waiting.find((r) => sameSkills(r.offers, log.offers)) ?? waiting.find((r) => log.at - r.at < SAME_DRAFT_MS);
  if (!read) {
    reads.push({ id: nextId, at: log.at, offers: log.offers, scores: [], picked: log.picked, how: 'log', verdict: 'missed' });
    return;
  }
  // Anything still waiting from before this one was never logged, so it can't be checked.
  for (const r of waiting) if (r.at < read.at) r.verdict = 'rerolled';
  if (!sameSkills(read.offers, log.offers)) {
    read.verdict = 'offer-wrong';
    read.logged = { offers: log.offers, picked: log.picked };
  } else if (read.picked && log.picked && read.picked !== log.picked) {
    read.verdict = 'pick-wrong';
    read.logged = { offers: log.offers, picked: log.picked };
  } else {
    read.verdict = 'right';
    if (!read.picked) {
      read.picked = log.picked;
      read.how = 'log';
    }
  }
}

/** True when a match is good enough to trust without asking. */
export const isConfident = (m: IconMatch | null): m is IconMatch => !!m && m.score >= MIN_SCORE && m.gap >= MIN_GAP;

/**
 * Turns noisy per-frame reads into steady events: an offer counts after two identical reads in a row (so a
 * card sliding in can't produce a wrong pair), and is over after `missesToClear` reads without one.
 */
export class OfferTracker {
  private candidate: string | null = null;
  private current: string | null = null;
  private misses = 0;
  private readonly missesToClear: number;

  constructor(missesToClear = 3) {
    this.missesToClear = missesToClear;
  }

  /** Returns the new offer when it changes, `null` when it just ended, `undefined` when nothing changed. */
  update(ids: string[] | null): string[] | null | undefined {
    if (!ids) {
      this.candidate = null;
      if (!this.current || ++this.misses < this.missesToClear) return undefined;
      this.current = null;
      this.misses = 0;
      return null;
    }
    this.misses = 0;
    const key = ids.join('|');
    if (key === this.current) return undefined;
    if (key !== this.candidate) {
      this.candidate = key;
      return undefined;
    }
    this.current = key;
    return ids;
  }
}
