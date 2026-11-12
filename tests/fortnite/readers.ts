import chestLabel from '../../games/fortnite/chestLabel.json';
import chestWords from '../../games/fortnite/chestWords.json';
import hudGlyphs from '../../games/fortnite/hudGlyphs.json';
import slotDigits from '../../games/fortnite/slotDigits.json';
import { isFullMap, readMapPanel } from '../../shared/fortniteFullMap';
import { BARS_AREA, HOTBAR_AREA, inkMap, readBars, readCount, readHotbarSlots, type SlotDigits } from '../../shared/fortniteInventory';
import {
  CHEST_THRESHOLD,
  chestArea,
  hudArea,
  readChestLines,
  readHud,
  toGreyHalf,
  type ChestWords,
  type GreyTemplate,
  type HudGlyphs,
} from '../../shared/fortniteVision';

/**
 * Runs ShotCaller's Fortnite screen readers on one saved 1920x1080 screenshot, cutting each reader's part
 * out of it the same way the app does (electron/fortnite/screenReader.ts, inventory.ts, fullMap.ts).
 * Pure code: no Electron, no screen, no game.
 */

export const FRAME_W = 1920;
export const FRAME_H = 1080;

/** What every reader saw in one screenshot, flattened so answers can name single fields ("hud.kills"). */
export interface FrameRead {
  'map.open': boolean;
  'chest.kinds': string;
  'hud.state': string | null;
  'hud.kills': number | null;
  'hud.left': number | null;
  'hotbar.seen': boolean;
  'hotbar.held': number | null;
  /** Five slots, e.g. "rare:30 | epic:6 | - | common | ?" (- empty, ? unknown rarity, :n the count). */
  'hotbar.slots': string;
  'bars.health': number | null;
  'bars.shield': number | null;
  'panel.storm': number | null;
  'panel.left': number | null;
}

export type Field = keyof FrameRead;

/** Copies a box out of a top-down BGRA frame. */
function crop(px: Uint8Array, w: number, box: { x: number; y: number; width: number; height: number }): Uint8Array {
  const out = new Uint8Array(box.width * box.height * 4);
  for (let y = 0; y < box.height; y++) {
    const from = ((box.y + y) * w + box.x) * 4;
    out.set(px.subarray(from, from + box.width * 4), y * box.width * 4);
  }
  return out;
}

/** One slot's count read, the way readHotbarSlots does it (for --slot debugging). */
export function debugCount(px: Uint8Array, k: number, held: boolean): { thr: number; count: number | null } {
  const hb = crop(px, FRAME_W, HOTBAR_AREA);
  const x0 = 1325 + 95 * k;
  let bg = 0;
  let n = 0;
  for (let x = x0 + 5; x < x0 + 75; x += 3) {
    const i = ((937 - HOTBAR_AREA.y) * HOTBAR_AREA.width + x - HOTBAR_AREA.x) * 4;
    bg += Math.min(hb[i], hb[i + 1], hb[i + 2]);
    n++;
  }
  const thr = Math.max(178, bg / n + 28);
  const ink = inkMap(hb, x0 + 30, held ? 990 : 974, 48, 26, held, thr);
  return { thr: Math.round(thr), count: readCount(ink, 48, 26, slotDigits as unknown as SlotDigits) };
}

export function readFrame(px: Uint8Array): FrameRead {
  const mapOpen = isFullMap(px, FRAME_W);

  const cBox = chestArea(FRAME_W, FRAME_H);
  const half = toGreyHalf(crop(px, FRAME_W, cBox), cBox.width, cBox.height);
  const lines = mapOpen ? [] : readChestLines(half.grey, half.width, half.height, chestLabel as unknown as GreyTemplate, chestWords as unknown as ChestWords, CHEST_THRESHOLD);

  const hBox = hudArea(FRAME_W, FRAME_H);
  const hud = readHud(crop(px, FRAME_W, hBox), hBox.width, hBox.height, hudGlyphs as unknown as HudGlyphs);

  const hb = readHotbarSlots(crop(px, FRAME_W, HOTBAR_AREA), slotDigits as unknown as SlotDigits);
  const bars = readBars(crop(px, FRAME_W, BARS_AREA));
  const panel = mapOpen ? readMapPanel(px) : null;

  return {
    'map.open': mapOpen,
    'chest.kinds': lines.map((l) => l.kind).join(' '),
    'hud.state': mapOpen ? null : hud.state,
    'hud.kills': mapOpen ? null : hud.eliminations,
    'hud.left': mapOpen ? null : hud.playersLeft,
    'hotbar.seen': hb.seen,
    'hotbar.held': hb.held,
    'hotbar.slots': hb.seen
      ? hb.slots.map((s) => (s.empty ? '-' : `${s.rarity ?? '?'}${s.count !== null ? `:${s.count}` : ''}`)).join(' | ')
      : '',
    'bars.health': bars.health,
    'bars.shield': bars.shield,
    'panel.storm': panel?.stormSecs ?? null,
    'panel.left': panel?.playersLeft ?? null,
  };
}
