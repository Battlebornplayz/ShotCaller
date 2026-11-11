import { captureScreen, type WindowArea } from '../skillshot/screenCapture';
import { getSettings } from '../settings';

/**
 * Fortnite's own resolution vs the window on screen. The HUD readers measure boxes in "game space": the game's
 * aspect ratio at the window's height. For a normal resolution that's the window itself. For a stretched one
 * (e.g. 1440x1080 on a 1920x1080 screen) the picture is widened, so boxes are widened on the way in and the
 * pixels squeezed back; with black bars instead, boxes move in from the sides.
 */
export interface GameSpace {
  width: number;
  height: number;
  /** Screen px per game px across. */
  sx: number;
  /** Screen x where game x = 0 starts (black bars). */
  ox: number;
}

export function gameSpace(area: WindowArea): GameSpace {
  const fn = getSettings().fortnite;
  const m = /^(\d+)x(\d+)$/.exec(fn.resolution);
  if (!m) return { width: area.width, height: area.height, sx: 1, ox: 0 };
  const width = Math.round((area.height * Number(m[1])) / Number(m[2]));
  if (Math.abs(width - area.width) < 4) return { width: area.width, height: area.height, sx: 1, ox: 0 };
  if (fn.stretched) return { width, height: area.height, sx: area.width / width, ox: 0 };
  return { width, height: area.height, sx: 1, ox: Math.round((area.width - width) / 2) };
}

/** Copies a box given in game space, as BGRA pixels of the box's own size. */
export function grabGame(area: WindowArea, g: GameSpace, box: { x: number; y: number; width: number; height: number }): Uint8Array | null {
  if (g.sx === 1) return captureScreen({ x: area.x + g.ox + box.x, y: area.y + box.y, width: box.width, height: box.height });
  const x0 = Math.round(box.x * g.sx);
  const w = Math.max(1, Math.round(box.width * g.sx));
  const src = captureScreen({ x: area.x + x0, y: area.y + box.y, width: w, height: box.height });
  if (!src) return null;
  // Squeeze the widened picture back to game proportions (nearest pixel).
  const out = new Uint8Array(box.width * box.height * 4);
  for (let x = 0; x < box.width; x++) {
    const sxp = Math.min(w - 1, Math.floor(x * g.sx));
    for (let y = 0; y < box.height; y++) {
      const i = (y * box.width + x) * 4;
      const j = (y * w + sxp) * 4;
      out[i] = src[j];
      out[i + 1] = src[j + 1];
      out[i + 2] = src[j + 2];
      out[i + 3] = src[j + 3];
    }
  }
  return out;
}
