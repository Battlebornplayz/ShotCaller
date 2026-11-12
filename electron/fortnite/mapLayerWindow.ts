import { BrowserWindow, screen } from 'electron';
import type { WindowArea } from '../skillshot/screenCapture';
import { getSettings } from '../settings';
import { overlaysShown } from '../overlay';
import { createFnMapLayerWindow } from '../windows';
import type { GameSpace } from './gameArea';

/**
 * The map layer: a see-through, click-through window over the game that draws ShotCaller's map (your dot,
 * route, pins, friends, storm, markers...) lined up exactly with Fortnite's own full map while it's open (M).
 * It covers the game picture only (inside black bars), never takes focus, and hides with Alt+S like every
 * overlay. The drawing itself is in src/fnmaplayer.
 */

let win: BrowserWindow | null = null;
let wanted = false;
let lastBounds = '';

function ensure(): BrowserWindow {
  if (win && !win.isDestroyed()) return win;
  win = createFnMapLayerWindow({ x: 0, y: 0, width: 800, height: 600 });
  win.setIgnoreMouseEvents(true);
  win.setAlwaysOnTop(true, 'screen-saver');
  win.on('closed', () => {
    win = null;
    lastBounds = '';
  });
  return win;
}

/**
 * Called on every look while Fortnite's full map is open (with the game window and its game space) and with
 * null when it closes.
 */
export function placeMapLayer(area: WindowArea | null, g: GameSpace | null): void {
  const fn = getSettings().fortnite;
  wanted = !!area && !!g && fn.mapLayer.on && overlaysShown();
  if (!wanted || !area || !g) {
    if (win && !win.isDestroyed() && win.isVisible()) win.hide();
    return;
  }
  const w = ensure();
  // The game picture on screen (physical px), inside any black bars; Electron wants DIPs.
  const phys = { x: area.x + g.ox, y: area.y, width: Math.round(g.width * g.sx), height: area.height };
  const dip = process.platform === 'win32' ? screen.screenToDipRect(null, phys) : phys;
  const key = `${dip.x},${dip.y},${dip.width},${dip.height}`;
  if (key !== lastBounds) {
    lastBounds = key;
    w.setBounds(dip);
  }
  if (!w.isVisible()) w.showInactive();
}

/** Closes the layer (Fortnite stopped). */
export function closeMapLayer(): void {
  if (win && !win.isDestroyed()) win.destroy();
  win = null;
}
