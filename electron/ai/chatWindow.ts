import { BrowserWindow, screen } from 'electron';
import { getDbdState } from '../dbd';
import { getSettings } from '../settings';
import { createAiChatWindow } from '../windows';

/**
 * The small Ask AI chat on the second monitor (Phase D2). Opens while a game runs when "Chat on the second monitor"
 * is on, on the screen picked in DbD → Options (else the first screen that isn't the main one), and never with a
 * single screen (it would cover the game). The chat panel's pop-out button opens it any time.
 */

const SIZE = { width: 420, height: 640 };
let win: BrowserWindow | null = null;
let dbdRunning = false;

function targetDisplay(): Electron.Display | null {
  const all = screen.getAllDisplays();
  const want = getDbdState().settings.monitorId;
  const chosen = all.find((d) => d.id === want);
  if (chosen) return chosen;
  const primary = screen.getPrimaryDisplay().id;
  return all.find((d) => d.id !== primary) ?? null;
}

function open(force: boolean): void {
  const display = targetDisplay() ?? (force ? screen.getPrimaryDisplay() : null);
  if (!display) return;
  if (win && !win.isDestroyed()) {
    if (force) win.show();
    return;
  }
  const a = display.workArea;
  // Top right of that screen.
  const bounds = {
    x: a.x + a.width - SIZE.width - 16,
    y: a.y + 16,
    width: SIZE.width,
    height: Math.min(SIZE.height, a.height - 32),
  };
  win = createAiChatWindow(bounds);
  win.once('ready-to-show', () => {
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

/** Keeps the window in line with DbD running and the settings. */
export function syncAiChatWindow(running = dbdRunning): void {
  dbdRunning = running;
  const s = getSettings().mcp;
  if (!s.chat) return close();
  if (running && s.chatMonitor) open(false);
  else if (!running && win) close();
}

export function showAiChatWindow(): void {
  if (getSettings().mcp.chat) open(true);
}
