import { app, BrowserWindow, ipcMain } from 'electron';
import { IPC } from '../shared/ipc';
import type { Channel } from '../shared/types';
import { fetchPatchNotes } from './patchNotes';
import { getSettings, setSettings } from './settings';
import { checkForUpdates, downloadUpdate, getUpdateState, installUpdate } from './updater';

/** Called by the splash "Play" button: open the main shell and close the splash. */
let openMainWindow: () => void = () => undefined;

export function registerIpc(onEnter: () => void): void {
  openMainWindow = onEnter;

  ipcMain.handle(IPC.appInfo, () => ({
    version: app.getVersion(),
    packaged: app.isPackaged,
    platform: process.platform,
  }));

  ipcMain.handle(IPC.appEnter, () => {
    openMainWindow();
  });

  ipcMain.handle(IPC.windowControl, (event, action: 'minimize' | 'maximize' | 'close') => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (action === 'minimize') win.minimize();
    else if (action === 'maximize') {
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    } else win.close();
  });

  ipcMain.handle(IPC.settingsGet, () => getSettings());

  ipcMain.handle(IPC.settingsSetChannel, async (_event, channel: Channel) => {
    const next = setSettings({ channel });
    // Switching channel changes what "latest" means, so re-check straight away.
    void checkForUpdates();
    return next;
  });

  ipcMain.handle(IPC.updaterGetState, () => getUpdateState());
  ipcMain.handle(IPC.updaterCheck, () => checkForUpdates());
  ipcMain.handle(IPC.updaterDownload, () => downloadUpdate());
  ipcMain.handle(IPC.updaterInstall, () => installUpdate());

  ipcMain.handle(IPC.patchNotesGet, async () => {
    try {
      return { ok: true as const, notes: await fetchPatchNotes(getSettings().channel) };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });
}
