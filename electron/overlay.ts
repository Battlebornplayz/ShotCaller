import { BrowserWindow, screen } from 'electron';
import { moduleById } from '../games';
import { IPC } from '../shared/ipc';
import type { HotkeyAction, OverlayState, RunningGame, Settings } from '../shared/types';
import { getSettings, updateSettings } from './settings';
import { endMatch, nextRound, pickOffer } from './skillshot/tracker';
import { createOverlayWindow, OVERLAY_DEFAULT_SIZE } from './windows';

/**
 * The overlay: a separate always-on-top window (never injected into the game), so it shows over
 * borderless / windowed games but not over exclusive fullscreen.
 *
 * Corner modes ("always", "popup") use a transparent, click-through window that becomes
 * interactive only while Alt is held. "monitor" mode is an ordinary window on another display.
 */

const MARGIN = 16;

let win: BrowserWindow | null = null;
let winMode: Settings['overlay']['mode'] | null = null;
let game: RunningGame | null = null;
let preview = false;
/** User-facing visibility, toggled by the popup hotkey. */
let shown = false;
let altHeld = false;
let altHookOk = false;
let size = { ...OVERLAY_DEFAULT_SIZE };
let saveTimer: NodeJS.Timeout | null = null;
const listeners = new Set<(state: OverlayState) => void>();

function isCorner(): boolean {
  return getSettings().overlay.mode !== 'monitor';
}

export function getOverlayState(): OverlayState {
  const s = getSettings().overlay;
  const visible = !!win && !win.isDestroyed() && win.isVisible();
  return {
    visible,
    // Without the Alt hook the corner overlay can't toggle click-through, so it stays interactive.
    interactive: s.mode === 'monitor' || altHeld || !altHookOk,
    mode: s.mode,
    idleOpacity: s.idleOpacity,
    game,
    preview,
    altHook: altHookOk,
  };
}

export function onOverlayStateChange(fn: (state: OverlayState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function broadcast(): void {
  const state = getOverlayState();
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(IPC.overlayState, state);
  }
  for (const fn of listeners) fn(state);
}

// ---------- Placement ----------

function defaultCornerPosition(): { x: number; y: number } {
  const display = screen.getPrimaryDisplay();
  const wa = display.workArea;
  // Stay below the game's own top-right buttons (e.g. Skillshot City's QUIT).
  const clearance = game?.moduleId ? (moduleById(game.moduleId).overlayTopClearance ?? 0) : 0;
  const top = Math.max(wa.y + MARGIN, display.bounds.y + Math.round(display.bounds.height * clearance) + MARGIN);
  return { x: wa.x + wa.width - size.width - MARGIN, y: top };
}

/** Saved position if it still lands on a connected display, else the default top-right corner. */
function cornerPosition(): { x: number; y: number } {
  const saved = getSettings().overlay.position;
  if (saved) {
    const onScreen = screen.getAllDisplays().some((d) => {
      const b = d.workArea;
      return saved.x + 40 > b.x && saved.x < b.x + b.width - 40 && saved.y >= b.y - 10 && saved.y < b.y + b.height - 40;
    });
    if (onScreen) return saved;
  }
  return defaultCornerPosition();
}

function monitorDisplay(): Electron.Display {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const wanted = getSettings().overlay.monitorDisplayId;
  return (
    displays.find((d) => d.id === wanted) ??
    displays.find((d) => d.id !== primary.id) ??
    primary
  );
}

// ---------- Window lifecycle ----------

function ensureWindow(): BrowserWindow {
  const mode = getSettings().overlay.mode;
  if (win && !win.isDestroyed() && winMode === mode) return win;
  destroyWindow();

  if (mode === 'monitor') {
    const wa = monitorDisplay().workArea;
    const width = 440;
    const height = Math.min(760, wa.height - 40);
    win = createOverlayWindow('monitor', {
      x: Math.round(wa.x + (wa.width - width) / 2),
      y: Math.round(wa.y + (wa.height - height) / 2),
      width,
      height,
    });
  } else {
    win = createOverlayWindow('corner', { ...cornerPosition(), ...size });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    applyClickThrough();
    win.on('moved', () => {
      if (!win || win.isDestroyed()) return;
      const [x, y] = win.getPosition();
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => updateSettings({ overlay: { position: { x, y } } }), 400);
    });
  }
  winMode = mode;
  win.on('closed', () => {
    win = null;
    winMode = null;
    // Closing the monitor window by hand = hide until the popup hotkey or the next game.
    shown = false;
    broadcast();
  });
  win.webContents.once('did-finish-load', () => broadcast());
  return win;
}

function destroyWindow(): void {
  if (win && !win.isDestroyed()) win.destroy();
  win = null;
  winMode = null;
}

function applyClickThrough(): void {
  if (!win || win.isDestroyed() || !isCorner()) return;
  const interactive = altHeld || !altHookOk;
  win.setIgnoreMouseEvents(!interactive);
}

/** Recomputes whether the overlay should be on screen and shows / hides / destroys it. */
function sync(): void {
  const hasTarget = !!game || preview;
  if (!hasTarget) {
    destroyWindow();
    broadcast();
    return;
  }
  const w = ensureWindow();
  if (shown) {
    if (!w.isVisible()) {
      if (isCorner()) w.showInactive(); // never steal focus from the game
      else w.show();
    }
  } else if (w.isVisible()) {
    w.hide();
  }
  broadcast();
}

// ---------- Inputs ----------

/** Does this running game get the overlay automatically? */
export function wantsOverlay(rg: RunningGame): boolean {
  if (rg.moduleId) return moduleById(rg.moduleId).autoOverlay;
  return getSettings().overlay.allGames;
}

/** Called by detection with the game the overlay should follow (or null when none is running). */
export function setOverlayGame(next: RunningGame | null): void {
  const prevKey = game?.key;
  game = next;
  if (next && next.key !== prevKey) {
    const s = getSettings();
    // A new game: show straight away in "always" / "monitor" modes, unless the user turned
    // auto-open off. "popup" mode waits for the hotkey.
    shown = s.startup.onGameLaunch !== 'nothing' && s.overlay.mode !== 'popup';
    // At the default spot, follow the new game's clearance (e.g. below Skillshot City's QUIT).
    if (win && !win.isDestroyed() && isCorner() && !s.overlay.position) {
      const p = defaultCornerPosition();
      win.setPosition(p.x, p.y);
    }
  }
  sync();
}

export function setOverlayPreview(on: boolean): void {
  preview = on;
  if (on) shown = true;
  sync();
}

/** Hotkey actions: the popup key toggles visibility; the rest go to the overlay's panels. */
export function handleOverlayAction(action: HotkeyAction): void {
  if (action === 'popup') {
    if (!game && !preview) {
      // Nothing running: the popup key opens a preview so it never feels dead.
      setOverlayPreview(true);
      return;
    }
    shown = !shown;
    if (!shown && preview && !game) preview = false;
    sync();
    return;
  }
  if (game?.moduleId === 'skillshot-city') {
    // Skillshot City: the tracker owns picks and rounds, then pushes the new state to every window.
    if (action === 'pick1') pickOffer(0);
    else if (action === 'pick2') pickOffer(1);
    else if (action === 'nextRound') nextRound();
    else if (action === 'endMatch') endMatch();
  }
  if (win && !win.isDestroyed()) win.webContents.send(IPC.overlayAction, { action, at: Date.now() });
}

export function setAltHeld(held: boolean): void {
  if (altHeld === held) return;
  altHeld = held;
  applyClickThrough();
  broadcast();
}

export function setAltHookAvailable(ok: boolean): void {
  altHookOk = ok;
  applyClickThrough();
  broadcast();
}

/** The corner overlay window resizes to fit its panel. */
export function resizeOverlay(sender: Electron.WebContents, width: number, height: number): void {
  if (!win || win.isDestroyed() || win.webContents !== sender || !isCorner()) return;
  const w = Math.round(Math.min(Math.max(width, 200), 520));
  const h = Math.round(Math.min(Math.max(height, 80), 900));
  if (w === size.width && h === size.height) return;
  const [x, y] = win.getPosition();
  const atDefault = !getSettings().overlay.position;
  size = { width: w, height: h };
  win.setBounds(atDefault ? { ...defaultCornerPosition(), width: w, height: h } : { x, y, width: w, height: h });
}

/** Whether a corner overlay is on screen (the Alt hook only needs to run then). */
export function cornerOverlayVisible(): boolean {
  return !!win && !win.isDestroyed() && win.isVisible() && isCorner();
}

/** Re-applies settings (mode, opacity, display) to an open overlay. */
export function applyOverlaySettings(next: Settings, prev: Settings): void {
  const a = next.overlay;
  const b = prev.overlay;
  if (a.mode !== b.mode || (a.mode === 'monitor' && a.monitorDisplayId !== b.monitorDisplayId)) {
    destroyWindow();
    if (a.mode === 'popup') shown = preview; // keep a preview open; otherwise wait for the hotkey
    sync();
  } else if (a.position === null && b.position !== null && win && !win.isDestroyed() && isCorner()) {
    win.setPosition(defaultCornerPosition().x, defaultCornerPosition().y);
    broadcast();
  } else {
    broadcast();
  }
}
