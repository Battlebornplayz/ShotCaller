import { BrowserWindow, screen } from 'electron';
import { getSettings } from '../settings';
import type { FnDisplay } from '../../shared/fortnite';
import { createFortniteMonitorWindow } from '../windows';

/**
 * The second-monitor window: fills the screen you picked (Fortnite → Options), opens when Fortnite starts and
 * closes when it stops. It never takes focus from the game when it opens. With one screen it stays closed (it
 * would cover the game); you can still open the map from the Fortnite page.
 */

let win: BrowserWindow | null = null;
let fortniteRunning = false;


export function listDisplays(): FnDisplay[] {
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: d.label || `Screen ${i + 1}`,
    primary: d.id === primary,
    width: d.size.width,
    height: d.size.height,
  }));
}

/** The chosen screen, else the first one that isn't the main one, else null (one screen). */
function targetDisplay(): Electron.Display | null {
  const all = screen.getAllDisplays();
  const want = getSettings().fortnite.monitor.displayId;
  const chosen = all.find((d) => d.id === want);
  if (chosen) return chosen;
  const primary = screen.getPrimaryDisplay().id;
  return all.find((d) => d.id !== primary) ?? null;
}

function open(force: boolean): void {
  const display = targetDisplay() ?? (force ? screen.getPrimaryDisplay() : null);
  if (!display) return;
  if (win && !win.isDestroyed()) {
    win.setBounds(display.workArea);
    if (force) win.show();
    return;
  }
  win = createFortniteMonitorWindow(display.workArea);
  win.once('ready-to-show', () => {
    // Opening with the game shouldn't pull focus out of it.
    if (force) win?.show();
    else win?.showInactive();
  });
  win.on('closed', () => {
    win = null;
  });
}

function close(): void {
  if (win && !win.isDestroyed()) win.close();
  win = null;
}

/** Keeps the window in line with Fortnite running and the setting. */
export function syncFortniteMonitor(running: boolean): void {
  fortniteRunning = running;
  const want = running && getSettings().fortnite.monitor.on;
  if (want) open(false);
  else if (!running) close();
}

/** Settings changed (screen or on/off): move, open or close. */
export function fortniteMonitorSettingsChanged(): void {
  const on = getSettings().fortnite.monitor.on;
  if (!on) return close();
  if (fortniteRunning || (win && !win.isDestroyed())) open(false);
}

/** "Open the map window" from the Fortnite page: opens even without Fortnite or a second screen. */
export function showFortniteMonitor(): void {
  open(true);
}
