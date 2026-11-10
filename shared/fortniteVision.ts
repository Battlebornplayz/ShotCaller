/**
 * Fortnite screen reading: pure code, no Electron. Works on a copy of a small area of the screen.
 *
 * Chests: opening one shows "+600 XP" with the reason "CHEST" under it, right of centre, for about 2 s.
 * Any label with the word CHEST counts (rare, treasure, sprite...; user, 2026-11-10). The glow is purple, or
 * gold when XP is supercharged, so this matches the *shape* of the word in grey levels, never its colour.
 * Tuned at 1920x1080 with the default HUD; other sizes are scaled by height (unchecked).
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GreyTemplate {
  width: number;
  height: number;
  /** Zero-mean grey levels, row by row. */
  values: number[];
}

/** Where the XP popup can show at 1080p (full resolution), scaled to the game's height. */
export function chestArea(width: number, height: number): Box {
  const k = height / 1080;
  const cx = width / 2;
  // At 1080p: x 1150-1550, y 250-450 (the label sat at x ~1255-1400, y ~315-400).
  return { x: Math.round(cx + 190 * k), y: Math.round(250 * k), width: Math.round(400 * k) & ~1, height: Math.round(200 * k) & ~1 };
}

/** Top-down BGRA pixels -> grey at half size (2x2 averages). */
export function toGreyHalf(bgra: Uint8Array, width: number, height: number): { grey: Float32Array; width: number; height: number } {
  const w = width >> 1;
  const h = height >> 1;
  const grey = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const i = ((y * 2 + dy) * width + x * 2 + dx) * 4;
          // BGRA: luma from R, G, B.
          sum += 0.299 * bgra[i + 2] + 0.587 * bgra[i + 1] + 0.114 * bgra[i];
        }
      }
      grey[y * w + x] = sum / 4;
    }
  }
  return { grey, width: w, height: h };
}

export interface LabelMatch {
  score: number;
  x: number;
  y: number;
}

/** Best normalised match of `tpl` anywhere in the picture (score -1..1). */
export function findLabel(grey: Float32Array, width: number, height: number, tpl: GreyTemplate): LabelMatch {
  const { width: tw, height: th, values } = tpl;
  const n = tw * th;
  let tNorm = 0;
  for (const v of values) tNorm += v * v;
  tNorm = Math.sqrt(tNorm);
  let best: LabelMatch = { score: -1, x: 0, y: 0 };
  for (let y = 0; y + th <= height; y++) {
    for (let x = 0; x + tw <= width; x++) {
      let s = 0;
      let s2 = 0;
      let st = 0;
      for (let j = 0; j < th; j++) {
        const row = (y + j) * width + x;
        const trow = j * tw;
        for (let i = 0; i < tw; i++) {
          const v = grey[row + i];
          s += v;
          s2 += v * v;
          st += v * values[trow + i];
        }
      }
      const variance = s2 - (s * s) / n;
      if (variance < 50) continue; // A flat patch can't hold text.
      const score = st / (Math.sqrt(variance) * tNorm);
      if (score > best.score) best = { score, x, y };
    }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// Top-right number stack: eliminations (skull) and players left (person).
// At 1080p the icons sit in a column at x 1585-1619 with the numbers right-aligned just left of them, white,
// ~15 px tall, straight over the game. Rows come and go (the skull and team rows vanish while you're down or
// spectating), so each row is found by its icon, never by a fixed position.

export interface HudGlyphs {
  glyph: { width: number; height: number };
  digits: Record<string, { width: number; values: number[] }>;
  icons: Record<'skull' | 'person', GreyTemplate>;
}

/** The stack at 1080p is x 1490-1620, y 24-200; it hangs off the top-right corner, so scale from there. */
export function hudArea(width: number, height: number): Box {
  const k = height / 1080;
  return { x: Math.round(width - 430 * k), y: Math.round(24 * k), width: Math.round(130 * k), height: Math.round(176 * k) };
}

/** Icon column and digit area inside `hudArea`, at 1080p pixels. */
const ICON_X = 95;
const ICON_SIZE = 34;
const DIGITS_WIDTH = 94;

/** Top-down BGRA -> grey at full size. */
export function toGrey(bgra: Uint8Array, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  for (let i = 0; i < out.length; i++) out[i] = 0.299 * bgra[i * 4 + 2] + 0.587 * bgra[i * 4 + 1] + 0.114 * bgra[i * 4];
  return out;
}

/** Normalised match of `tpl` at one spot of a grey picture. */
function matchAt(grey: Float32Array, width: number, x: number, y: number, tpl: GreyTemplate): number {
  const { width: tw, height: th, values } = tpl;
  const n = tw * th;
  let s = 0;
  let s2 = 0;
  let st = 0;
  for (let j = 0; j < th; j++) {
    const row = (y + j) * width + x;
    for (let i = 0; i < tw; i++) {
      const v = grey[row + i];
      s += v;
      s2 += v * v;
      st += v * values[j * tw + i];
    }
  }
  const variance = s2 - (s * s) / n;
  return variance < 50 ? -1 : st / Math.sqrt(variance);
}

/** Where an icon sits in the icon column (best y), with its score. */
function findIcon(grey: Float32Array, width: number, height: number, tpl: GreyTemplate): { y: number; score: number } {
  let best = { y: 0, score: -1 };
  for (let y = 0; y + tpl.height <= height; y++) {
    for (let dx = -2; dx <= 2; dx++) {
      const s = matchAt(grey, width, ICON_X + dx, y, tpl);
      if (s > best.score) best = { y, score: s };
    }
  }
  return best;
}

export const ICON_THRESHOLD = 0.7;
/** The skull icon's top sits ~7 px into `hudArea` at 1080p; it's never lower. */
const SKULL_MAX_Y = 16;
const DIGIT_THRESHOLD = 0.7;
const DIGIT_MARGIN = 0.05;

const isWhite = (b: Uint8Array, i: number) => {
  const r = b[i + 2];
  const g = b[i + 1];
  const bl = b[i];
  const mn = Math.min(r, g, bl);
  return mn > 200 && Math.max(r, g, bl) - mn < 45;
};

/**
 * Reads the number left of an icon whose top is at `iconY`: white glyphs in the row, the run nearest the icon,
 * each matched to the digit shapes. Null when anything is unclear.
 */
function readNumber(bgra: Uint8Array, width: number, iconY: number, glyphs: HudGlyphs): number | null {
  const y0 = Math.max(0, iconY + 4);
  const y1 = iconY + ICON_SIZE - 2;
  const rows: number[] = [];
  for (let y = y0; y < y1; y++) {
    let c = 0;
    for (let x = 0; x < DIGITS_WIDTH; x++) if (isWhite(bgra, (y * width + x) * 4)) c++;
    rows.push(c);
  }
  // The tallest run of rows with white in it is the text.
  let top = -1;
  let bottom = -1;
  for (let i = 0; i < rows.length; ) {
    if (rows[i] < 2) {
      i++;
      continue;
    }
    let j = i;
    while (j < rows.length && rows[j] >= 2) j++;
    if (j - i > bottom - top) [top, bottom] = [i, j];
    i = j;
  }
  if (top < 0 || bottom - top < 10 || bottom - top > 21) return null;
  const ty = y0 + top;
  const th = bottom - top;
  const cols: number[] = [];
  for (let x = 0; x < DIGITS_WIDTH; x++) {
    let c = 0;
    for (let y = ty; y < ty + th; y++) if (isWhite(bgra, (y * width + x) * 4)) c++;
    cols.push(c);
  }
  // Glyphs from the right (next to the icon) leftwards, stopping at a wide gap.
  const boxes: [number, number][] = [];
  let x = DIGITS_WIDTH - 1;
  while (x >= 0 && cols[x] === 0) x--;
  if (DIGITS_WIDTH - 1 - x > 20) return null; // Nothing next to the icon.
  while (x >= 0) {
    const right = x;
    while (x >= 0 && cols[x] > 0) x--;
    boxes.unshift([x + 1, right + 1]);
    const gapEnd = x;
    while (x >= 0 && cols[x] === 0) x--;
    if (gapEnd - x > 6 || boxes.length >= 3) break;
  }
  const { width: gw, height: gh } = glyphs.glyph;
  let text = '';
  for (const [a, b] of boxes) {
    const w = b - a;
    if (w < 2 || w > 15) return null;
    const g = new Array<number>(gw * gh);
    let mean = 0;
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        const sx = a + Math.floor((i * w) / gw);
        const sy = ty + Math.floor((j * th) / gh);
        const k = (sy * width + sx) * 4;
        const v = 0.299 * bgra[k + 2] + 0.587 * bgra[k + 1] + 0.114 * bgra[k];
        g[j * gw + i] = v;
        mean += v;
      }
    }
    mean /= g.length;
    let norm = 0;
    for (let i = 0; i < g.length; i++) {
      g[i] -= mean;
      norm += g[i] * g[i];
    }
    norm = Math.sqrt(norm) || 1;
    let best = { d: '', s: -1 };
    let second = -1;
    for (const [d, t] of Object.entries(glyphs.digits)) {
      if (Math.abs(t.width - w) > 4) continue;
      let s = 0;
      for (let i = 0; i < g.length; i++) s += g[i] * t.values[i];
      s /= norm;
      if (s > best.s) {
        second = best.s;
        best = { d, s };
      } else if (s > second) second = s;
    }
    // Unsure between two digits (e.g. 0 and 9 over bright grass): skip rather than guess.
    if (best.s < DIGIT_THRESHOLD || best.s - second < DIGIT_MARGIN) return null;
    text += best.d;
  }
  return text ? Number(text) : null;
}

export interface HudRead {
  /** alive = your skull row shows; down = it's gone and players-left is the top row; null = can't tell (map, menu). */
  state: 'alive' | 'down' | null;
  /** Your eliminations; null when the skull row isn't showing (down, spectating) or unclear. */
  eliminations: number | null;
  playersLeft: number | null;
}

/** Reads the stack from a copy of `hudArea` (BGRA, top-down). */
export function readHud(bgra: Uint8Array, width: number, height: number, glyphs: HudGlyphs): HudRead {
  const grey = toGrey(bgra, width, height);
  const skull = findIcon(grey, width, height, glyphs.icons.skull);
  const person = findIcon(grey, width, height, glyphs.icons.person);
  // The skull row is always the top row when it shows, and it must look clearly more like the skull than the
  // person icon, or the team-eliminations / players-left rows get read as yours.
  let personThere = -1;
  for (let dx = -2; dx <= 2; dx++) personThere = Math.max(personThere, matchAt(grey, width, ICON_X + dx, skull.y, glyphs.icons.person));
  const skullOk = skull.score >= ICON_THRESHOLD && skull.y <= SKULL_MAX_Y && skull.score - personThere >= 0.15;
  // Down or spectating: the skull and team rows vanish, so the players-left icon moves up to the top row.
  const personTop = !skullOk && person.score >= ICON_THRESHOLD && person.y <= SKULL_MAX_Y;
  return {
    state: skullOk ? 'alive' : personTop ? 'down' : null,
    eliminations: skullOk ? readNumber(bgra, width, skull.y, glyphs) : null,
    playersLeft: person.score >= ICON_THRESHOLD ? readNumber(bgra, width, person.y, glyphs) : null,
  };
}

/**
 * Settles a number read many times a second: a value counts after the same read twice in a row. Eliminations
 * only go up during a match, so a lower read is ignored as a misread (`rising`).
 */
export class SteadyNumber {
  value: number | null = null;
  private last: number | null = null;
  private readonly rising: boolean;

  constructor(rising: boolean) {
    this.rising = rising;
  }

  /** Returns the new value when it changes, else undefined. */
  update(read: number | null): number | undefined {
    if (read === null) return undefined;
    const prev = this.last;
    this.last = read;
    if (read !== prev || read === this.value) return undefined;
    if (this.rising && this.value !== null && read < this.value) return undefined;
    this.value = read;
    return read;
  }

  reset(): void {
    this.value = null;
    this.last = null;
  }
}

/** A label scoring at least this counts. Real chests scored 0.85-0.98; the best other text 0.68. */
export const CHEST_THRESHOLD = 0.8;
/** A CHEST word this good counts when a second word (RARE, SPRITE, X2...) backs it up. "X2" lines score ~0.76. */
const CHEST_BACKED_THRESHOLD = 0.68;
const WORD_THRESHOLD = 0.75;

// ---------------------------------------------------------------------------------------------
// Chest kinds. Fortnite merges chests opened close together into one popup that grows in place:
// "+900 XP / RARE CHEST" -> "+1,800 XP / RARE CHEST X2" -> a "SPRITE CHEST" line added under it. Lines are
// right-aligned, so RARE/SPRITE sit at fixed spots left of the CHEST word and "X2" right of it. Every line is
// read on its own; a line's count goes up when it first shows and each time its "Xn" changes.

export type ChestKind = 'chest' | 'rare' | 'sprite';

export interface WordTemplate extends GreyTemplate {
  /** Left edge relative to the CHEST word's left edge (half-size pixels). */
  dx: number;
}

export interface ChestWords {
  rare: WordTemplate;
  sprite: WordTemplate;
  /** The "X" of "X2", "X3"... */
  x: WordTemplate;
}

export interface ChestLine {
  kind: ChestKind;
  x: number;
  y: number;
  score: number;
  /** The "Xn" area as grey levels when an X shows, else null. */
  suffix: Float32Array | null;
}

/** Normalised match at one spot, -1 when off the picture or flat. */
function scoreAt(grey: Float32Array, width: number, height: number, x: number, y: number, tpl: GreyTemplate): number {
  if (x < 0 || y < 0 || x + tpl.width > width || y + tpl.height > height) return -1;
  let tn = 0;
  for (const v of tpl.values) tn += v * v;
  const s = matchAt(grey, width, x, y, tpl);
  return s < -0.5 ? -1 : s / Math.sqrt(tn);
}

function bestNear(grey: Float32Array, width: number, height: number, x: number, y: number, tpl: GreyTemplate, r = 2): number {
  let best = -1;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -r; dx <= r; dx++) best = Math.max(best, scoreAt(grey, width, height, x + dx, y + dy, tpl));
  return best;
}

const SUFFIX_WIDTH = 14;
const SUFFIX_MARGIN = 2;
const SUFFIX_MARGIN_Y = 1;
const SUFFIX_W = SUFFIX_WIDTH + 2 * SUFFIX_MARGIN;
const SUFFIX_H = 10 + 2 * SUFFIX_MARGIN_Y;

/** Every CHEST line in the half-size grey picture of `chestArea`, top to bottom. */
export function readChestLines(grey: Float32Array, width: number, height: number, chest: GreyTemplate, words: ChestWords): ChestLine[] {
  const hits: { x: number; y: number; score: number }[] = [];
  for (let y = 0; y + chest.height <= height; y++) {
    for (let x = 0; x + chest.width <= width; x++) {
      const s = scoreAt(grey, width, height, x, y, chest);
      if (s >= CHEST_BACKED_THRESHOLD) hits.push({ x, y, score: s });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  const peaks: typeof hits = [];
  for (const h of hits) if (!peaks.some((p) => Math.abs(p.y - h.y) < 7)) peaks.push(h);
  const lines: ChestLine[] = [];
  for (const p of peaks) {
    const rare = bestNear(grey, width, height, p.x + words.rare.dx, p.y, words.rare);
    const sprite = bestNear(grey, width, height, p.x + words.sprite.dx, p.y, words.sprite);
    const xMark = bestNear(grey, width, height, p.x + words.x.dx, p.y, words.x);
    const kind: ChestKind = rare >= WORD_THRESHOLD && rare >= sprite ? 'rare' : sprite >= WORD_THRESHOLD ? 'sprite' : 'chest';
    const hasX = xMark >= WORD_THRESHOLD;
    if (p.score < CHEST_THRESHOLD && kind === 'chest' && !hasX) continue;
    let suffix: Float32Array | null = null;
    if (hasX) {
      // With a margin all round, so two reads can be lined up when the popup shifts by a pixel.
      const sx = p.x + words.x.dx - SUFFIX_MARGIN;
      const sy = p.y - SUFFIX_MARGIN_Y;
      suffix = new Float32Array(SUFFIX_W * SUFFIX_H);
      for (let j = 0; j < SUFFIX_H; j++) {
        for (let i = 0; i < SUFFIX_W; i++) {
          const gx = Math.min(width - 1, Math.max(0, sx + i));
          const gy = Math.min(height - 1, Math.max(0, sy + j));
          suffix[j * SUFFIX_W + i] = grey[gy * width + gx];
        }
      }
    }
    lines.push({ kind, x: p.x, y: p.y, score: p.score, suffix });
  }
  return lines.sort((a, b) => a.y - b.y);
}

/** Best correlation of two "Xn" pictures, sliding one over the other by up to the margin. */
function similarity(a: Float32Array, b: Float32Array): number {
  const cw = SUFFIX_WIDTH;
  const ch = SUFFIX_H - 2 * SUFFIX_MARGIN_Y;
  const core = new Float32Array(cw * ch);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) core[j * cw + i] = a[(j + SUFFIX_MARGIN_Y) * SUFFIX_W + i + SUFFIX_MARGIN];
  let best = -1;
  const win = new Float32Array(cw * ch);
  for (let oy = 0; oy <= 2 * SUFFIX_MARGIN_Y; oy++) {
    for (let ox = 0; ox <= 2 * SUFFIX_MARGIN; ox++) {
      for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) win[j * cw + i] = b[(j + oy) * SUFFIX_W + i + ox];
      best = Math.max(best, correlate(core, win));
    }
  }
  return best;
}

/** Correlation of two same-size grey patches (-1..1). */
function correlate(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < a.length; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= a.length;
  mb /= b.length;
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    ab += x * y;
    aa += x * x;
    bb += y * y;
  }
  return aa && bb ? ab / Math.sqrt(aa * bb) : 0;
}

interface LineState {
  /** Reads in a row this kind has shown. */
  streak: number;
  counted: boolean;
  /** The settled "Xn" picture, or null before any X. */
  suffix: Float32Array | null;
  /** A new "Xn" picture waiting for a second read. */
  pending: Float32Array | null;
  /** Where the line was last seen (half-size pixels). */
  y: number;
}

/**
 * Turns per-frame line reads into chests by kind. A popup lasts while any CHEST line shows (with `gapMs` of
 * grace for flicker). In it, each kind counts once when its line has shown on two reads in a row, plus one each
 * time its "Xn" settles on a new picture. A line first seen already showing "Xn" counts as 2 (the X2 case).
 */
export class ChestPopupCounter {
  private lines = new Map<ChestKind, LineState>();
  private lastSeen = 0;
  private readonly gapMs: number;

  constructor(gapMs = 1200) {
    this.gapMs = gapMs;
  }

  /** Returns the chests completed by this read (often empty). */
  update(read: ChestLine[], at: number): ChestKind[] {
    const out: ChestKind[] = [];
    if (!read.length) {
      if (this.lines.size && at - this.lastSeen >= this.gapMs) this.lines.clear();
      for (const s of this.lines.values()) s.streak = 0;
      return out;
    }
    this.lastSeen = at;
    const seen = new Set<ChestKind>();
    for (const line of read) {
      let kind = line.kind;
      // A shaky read of a RARE/SPRITE line can miss its first word: a weak plain line where another kind's line
      // sits keeps that kind.
      if (kind === 'chest' && line.score < CHEST_THRESHOLD) {
        for (const [k, st] of this.lines) if (k !== 'chest' && Math.abs(st.y - line.y) <= 3) kind = k;
        if (kind === 'chest' && !this.lines.has('chest')) continue;
      }
      if (seen.has(kind)) continue;
      seen.add(kind);
      let s = this.lines.get(kind);
      if (!s) {
        s = { streak: 0, counted: false, suffix: null, pending: null, y: line.y };
        this.lines.set(kind, s);
      }
      s.y = line.y;
      s.streak++;
      if (!s.counted) {
        if (s.streak < 2) continue;
        s.counted = true;
        out.push(kind);
        if (line.suffix) {
          out.push(kind);
          s.suffix = line.suffix;
        }
        continue;
      }
      if (!line.suffix) continue;
      if (s.suffix && similarity(s.suffix, line.suffix) >= 0.8) {
        s.pending = null;
        continue;
      }
      // A new "Xn": count it once it reads the same twice in a row.
      if (s.pending && similarity(s.pending, line.suffix) >= 0.85) {
        s.suffix = line.suffix;
        s.pending = null;
        out.push(kind);
      } else s.pending = line.suffix;
    }
    for (const [kind, s] of this.lines) if (!seen.has(kind)) s.streak = 0;
    return out;
  }

  reset(): void {
    this.lines.clear();
    this.lastSeen = 0;
  }
}

/**
 * Turns per-frame reads into chest openings. A chest counts once its label has been seen on two reads in a
 * row, and the next one needs the label to have been gone for `gapMs` first (a label stays ~2 s and can
 * flicker for a frame). Two chests opened within about a second of each other may count as one.
 */
export class ChestCounter {
  private streak = 0;
  private counted = false;
  private lastHit = 0;
  private readonly gapMs: number;

  constructor(gapMs = 1200) {
    this.gapMs = gapMs;
  }

  /** Returns true when this read completes a new chest. */
  update(hit: boolean, at: number): boolean {
    if (!hit) {
      this.streak = 0;
      if (this.counted && at - this.lastHit >= this.gapMs) this.counted = false;
      return false;
    }
    this.lastHit = at;
    this.streak++;
    if (!this.counted && this.streak >= 2) {
      this.counted = true;
      return true;
    }
    return false;
  }

  reset(): void {
    this.streak = 0;
    this.counted = false;
    this.lastHit = 0;
  }
}
