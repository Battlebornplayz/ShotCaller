import { BrowserWindow, globalShortcut } from 'electron';
import { IPC } from '../shared/ipc';
import { HOTKEY_ACTIONS, type HotkeyAction, type HotkeyStatus } from '../shared/types';
import { getSettings } from './settings';

/**
 * Global hotkeys (Alt+S / 1 / 2 / R / E / H by default, rebindable).
 * By default they're only registered while a game is running or the overlay is open, so
 * ShotCaller doesn't grab Alt+S etc. from other apps the rest of the time.
 */

let handler: (action: HotkeyAction) => void = () => undefined;
let inGame = false;
let capturing = false;
let status: HotkeyStatus = Object.fromEntries(HOTKEY_ACTIONS.map((a) => [a, 'inactive'])) as HotkeyStatus;
const registered = new Map<string, HotkeyAction>();

export function initHotkeys(onAction: (action: HotkeyAction) => void): void {
  handler = onAction;
  refreshHotkeys();
}

export function getHotkeyStatus(): HotkeyStatus {
  return status;
}

/** Tell the hotkey manager whether a game (or the overlay preview) is active. */
export function setHotkeysInGame(active: boolean): void {
  if (inGame === active) return;
  inGame = active;
  refreshHotkeys();
}

/** Release every hotkey while the settings page records a new combination. */
export function setHotkeyCapture(on: boolean): void {
  capturing = on;
  refreshHotkeys();
}

export function refreshHotkeys(): void {
  for (const accel of registered.keys()) globalShortcut.unregister(accel);
  registered.clear();

  const s = getSettings();
  const active = !capturing && (inGame || !s.hotkeysOnlyInGame);
  const next = {} as HotkeyStatus;

  for (const action of HOTKEY_ACTIONS) {
    const accel = s.hotkeys[action];
    if (!accel) {
      next[action] = 'unbound';
      continue;
    }
    if (!active) {
      next[action] = 'inactive';
      continue;
    }
    let ok: boolean;
    try {
      ok = globalShortcut.register(accel, () => handler(action));
    } catch {
      ok = false;
    }
    if (ok) registered.set(accel, action);
    next[action] = ok ? 'active' : 'failed';
  }

  status = next;
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(IPC.hotkeysStatus, status);
  }
}

export function disposeHotkeys(): void {
  globalShortcut.unregisterAll();
  registered.clear();
}
