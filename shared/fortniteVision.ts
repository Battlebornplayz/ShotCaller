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

/** A label scoring at least this counts. Real chests scored 0.85-0.98; the best other text 0.68. */
export const CHEST_THRESHOLD = 0.8;

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
