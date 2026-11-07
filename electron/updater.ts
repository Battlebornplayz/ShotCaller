import { app, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import { IPC } from '../shared/ipc';
import type { UpdateState } from '../shared/types';
import { getSettings } from './settings';

let state: UpdateState = { status: 'idle' };
let latestVersion = '';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function broadcast(next: UpdateState): void {
  state = next;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.updaterState, next);
  }
}

export function getUpdateState(): UpdateState {
  return state;
}

/** Wires electron-updater events to the renderer. Call once at startup. */
export function initUpdater(): void {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => broadcast({ status: 'checking' }));

  autoUpdater.on('update-available', (info) => {
    latestVersion = info.version;
    broadcast({ status: 'available', version: info.version });
  });

  autoUpdater.on('update-not-available', () => {
    broadcast({ status: 'up-to-date', version: app.getVersion() });
  });

  autoUpdater.on('download-progress', (progress) => {
    broadcast({
      status: 'downloading',
      version: latestVersion,
      percent: Math.round(progress.percent),
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    latestVersion = info.version;
    broadcast({ status: 'downloaded', version: info.version });
  });

  autoUpdater.on('error', (err) => {
    broadcast({ status: 'error', message: errorMessage(err) });
  });
}

/** Stable users get full releases only; beta users also get pre-releases. */
function applyChannel(): void {
  autoUpdater.allowPrerelease = getSettings().channel === 'beta';
}

export async function checkForUpdates(): Promise<void> {
  if (!app.isPackaged) {
    broadcast({ status: 'dev' });
    return;
  }
  applyChannel();
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    broadcast({ status: 'error', message: errorMessage(err) });
  }
}

export async function downloadUpdate(): Promise<void> {
  if (state.status !== 'available') return;
  try {
    await autoUpdater.downloadUpdate();
  } catch (err) {
    broadcast({ status: 'error', message: errorMessage(err) });
  }
}

export function installUpdate(): void {
  if (state.status !== 'downloaded') return;
  // Silent: reinstall into the existing location without showing the installer wizard
  // (the wizard's "only me / all users" page can move the install), then relaunch.
  autoUpdater.quitAndInstall(true, true);
}
