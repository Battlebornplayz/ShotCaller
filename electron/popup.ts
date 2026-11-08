import { screen, type BrowserWindow } from 'electron';
import { IPC } from '../shared/ipc';
import type { PopupCorner, PopupPayload } from '../shared/types';
import { createPopupWindow, POPUP_SIZE } from './windows';

/** Queues unlock cards and shows them one at a time in a dedicated always-on-top window. */

const MARGIN = 16;
const SAFETY_MS = 15000;

let win: BrowserWindow | null = null;
let ready = false;
let showing = false;
let safety: NodeJS.Timeout | null = null;
const queue: PopupPayload[] = [];

function boundsFor(corner: PopupCorner): Electron.Rectangle {
  const area = screen.getPrimaryDisplay().workArea;
  const right = corner.endsWith('right');
  const bottom = corner.startsWith('bottom');
  return {
    width: POPUP_SIZE.width,
    height: POPUP_SIZE.height,
    x: right ? area.x + area.width - POPUP_SIZE.width - MARGIN : area.x + MARGIN,
    y: bottom ? area.y + area.height - POPUP_SIZE.height - MARGIN : area.y + MARGIN,
  };
}

function ensureWindow(corner: PopupCorner): BrowserWindow {
  if (win && !win.isDestroyed()) return win;
  ready = false;
  win = createPopupWindow(boundsFor(corner));
  win.webContents.once('did-finish-load', () => {
    ready = true;
    next();
  });
  win.on('closed', () => {
    win = null;
    ready = false;
    showing = false;
  });
  return win;
}

function next(): void {
  if (showing) return;
  const payload = queue.shift();
  if (!payload) {
    if (win && !win.isDestroyed()) win.hide();
    return;
  }
  const w = ensureWindow(payload.corner);
  if (!ready) {
    queue.unshift(payload);
    return;
  }
  showing = true;
  w.setBounds(boundsFor(payload.corner));
  w.setAlwaysOnTop(true, 'screen-saver');
  w.showInactive(); // never steal focus from the game
  w.webContents.send(IPC.popupShow, payload);
  safety = setTimeout(popupDone, SAFETY_MS);
}

export function showPopup(payload: PopupPayload): void {
  queue.push(payload);
  if (queue.length > 12) queue.splice(0, queue.length - 12); // a bulk sync shouldn't play for minutes
  ensureWindow(payload.corner);
  next();
}

/** The card finished its exit animation. */
export function popupDone(): void {
  if (safety) clearTimeout(safety);
  safety = null;
  showing = false;
  next();
}

export function disposePopup(): void {
  if (win && !win.isDestroyed()) win.destroy();
  win = null;
}
