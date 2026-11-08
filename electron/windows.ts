import { BrowserWindow, nativeImage } from 'electron';
import path from 'node:path';
import iconPath from '../resources/icon.png?asset';

const PRELOAD = path.join(__dirname, '../preload/index.js');
const BG = '#0F1023';

export const APP_ICON = nativeImage.createFromPath(iconPath);

export const OVERLAY_DEFAULT_SIZE = { width: 300, height: 260 };

type WindowName = 'splash' | 'main' | 'overlay' | 'popup';

export const POPUP_SIZE = { width: 440, height: 150 };

/** The achievement unlock card: transparent, click-through, always on top, never focused. */
export function createPopupWindow(bounds: Electron.Rectangle): BrowserWindow {
  const win = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    show: false,
    title: 'ShotCaller unlock',
    webPreferences: { ...webPreferences, autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: false },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true);
  loadRenderer(win, 'popup');
  return win;
}

function loadRenderer(win: BrowserWindow, windowName: WindowName, extra: Record<string, string> = {}): void {
  const query = { window: windowName, ...extra };
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    void win.loadURL(`${devUrl}?${new URLSearchParams(query).toString()}`);
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'), { query });
  }
}

const webPreferences = { preload: PRELOAD, contextIsolation: true, sandbox: true };

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
    icon: APP_ICON,
    webPreferences,
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
    icon: APP_ICON,
    webPreferences,
  });
  win.once('ready-to-show', () => win.show());
  loadRenderer(win, 'main');
  return win;
}

/**
 * corner: transparent, frameless, always-on-top, no taskbar entry, never takes focus.
 * monitor: an ordinary window for a second screen.
 */
export function createOverlayWindow(kind: 'corner' | 'monitor', bounds: Electron.Rectangle): BrowserWindow {
  const win =
    kind === 'corner'
      ? new BrowserWindow({
          ...bounds,
          frame: false,
          transparent: true,
          backgroundColor: '#00000000',
          resizable: false,
          maximizable: false,
          minimizable: false,
          fullscreenable: false,
          alwaysOnTop: true,
          skipTaskbar: true,
          focusable: false,
          hasShadow: false,
          show: false,
          title: 'ShotCaller overlay',
          webPreferences,
        })
      : new BrowserWindow({
          ...bounds,
          minWidth: 360,
          minHeight: 420,
          frame: false,
          backgroundColor: BG,
          show: false,
          title: 'ShotCaller overlay',
          icon: APP_ICON,
          webPreferences,
        });
  loadRenderer(win, 'overlay', { mode: kind });
  return win;
}
