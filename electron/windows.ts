import { BrowserWindow } from 'electron';
import path from 'node:path';

const PRELOAD = path.join(__dirname, '../preload/index.js');
const BG = '#0F1023';

function loadRenderer(win: BrowserWindow, windowName: 'splash' | 'main'): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    void win.loadURL(`${devUrl}?window=${windowName}`);
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'), {
      query: { window: windowName },
    });
  }
}

export function createSplashWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 880,
    height: 540,
    resizable: false,
    frame: false,
    show: false,
    center: true,
    backgroundColor: BG,
    title: 'ShotCaller',
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true },
  });
  win.once('ready-to-show', () => win.show());
  loadRenderer(win, 'splash');
  return win;
}

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    show: false,
    backgroundColor: BG,
    title: 'ShotCaller',
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true },
  });
  win.once('ready-to-show', () => win.show());
  loadRenderer(win, 'main');
  return win;
}
