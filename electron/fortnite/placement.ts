import { nativeImage } from 'electron';
import { parsePlacement } from '../../shared/fortniteScore';
import { readText } from '../ocr';
import { captureScreen, type WindowArea } from '../skillshot/screenCapture';

/**
 * Placement from Fortnite's own words (Phase F4, user 2026-11-12): when your whole team is out, Fortnite shows
 * "YOU PLACED #4" (in game for ~2 s, then at the top of the Match Recap screen for as long as it's open), and
 * "VICTORY ROYALE" for a win. Works for every team size, unlike the players-left count (solo only).
 *
 * Windows' text reader reads "YOU PLACED" every time but the stylised "#4" only now and then (about 1 read in
 * 6 on the third recording, never a wrong number), so the top-middle of the screen is read at 3x every 1.5 s
 * while you're not alive in a match, and a number counts once it's been read twice (or once, if nothing else
 * was read by the time the match ends).
 */

const EVERY_MS = 1500;
let lastAt = 0;
let busy = false;
let votes = new Map<number, number>();
let settled: number | null = null;

/** The top-middle of the game screen at 1080p: x 640-1280, y 0-280 (both banners sit in it). */
function topMiddle(area: WindowArea): WindowArea {
  const k = area.height / 1080;
  const w = Math.round(640 * k);
  return { x: area.x + Math.round(area.width / 2 - w / 2), y: area.y, width: w, height: Math.round(280 * k) };
}

/** Called by the screen reader while you're down or out (or just after a match), with Fortnite in front. */
export function readPlacementScreen(area: WindowArea): void {
  const now = Date.now();
  if (settled !== null || busy || now - lastAt < EVERY_MS) return;
  lastAt = now;
  const box = topMiddle(area);
  const pixels = captureScreen(box);
  if (!pixels) return;
  busy = true;
  const opaque = Buffer.from(pixels);
  for (let i = 3; i < opaque.length; i += 4) opaque[i] = 255;
  const k = 1080 / area.height;
  const img = nativeImage.createFromBitmap(opaque, { width: box.width, height: box.height }).resize({
    width: Math.round(box.width * k * 3),
    height: Math.round(box.height * k * 3),
    quality: 'best',
  });
  void readText(img.toPNG())
    .then((lines) => {
      if (!lines) return;
      const n = parsePlacement(lines.map((l) => l.text).join(' '));
      if (n === null) return;
      const c = (votes.get(n) ?? 0) + 1;
      votes.set(n, c);
      if (c >= 2) settled = n;
    })
    .finally(() => {
      busy = false;
    });
}

/** The placement read this match: a number read twice, else the only number read once, else null. */
export function placementRead(): number | null {
  if (settled !== null) return settled;
  return votes.size === 1 ? [...votes.keys()][0] : null;
}

/** A new match starts with nothing read. */
export function resetPlacement(): void {
  votes = new Map();
  settled = null;
}
