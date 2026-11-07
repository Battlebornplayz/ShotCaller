import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { IPC } from '../shared/ipc';
import { HOTKEY_ACTIONS, type DisplayInfo, type HotkeyAction, type SettingsPatch } from '../shared/types';
import { getDetectionState } from './detection';
import { getHotkeyStatus, setHotkeyCapture } from './hotkeys';
import { addGameManually, getLibrary, importSteamLibrary, removeGame, setPinned } from './library';
import { getOverlayState, handleOverlayAction, resizeOverlay, setOverlayPreview } from './overlay';
import { fetchPatchNotes } from './patchNotes';
import { getSettings, updateSettings } from './settings';
import { checkForUpdates, downloadUpdate, getUpdateState, installUpdate } from './updater';

export interface IpcHandlers {
  /** Splash "Play": open the main shell and close the splash. */
  enterApp: () => void;
  openMain: () => void;
}

/** Sends an event to every open window. */
export function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

export function registerIpc(h: IpcHandlers): void {
  ipcMain.handle(IPC.appInfo, () => ({
    version: app.getVersion(),
    packaged: app.isPackaged,
    platform: process.platform,
  }));
  ipcMain.handle(IPC.appEnter, () => h.enterApp());
  ipcMain.handle(IPC.appOpenMain, () => h.openMain());

  ipcMain.handle(IPC.windowControl, (event, action: 'minimize' | 'maximize' | 'close') => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (action === 'minimize') win.minimize();
    else if (action === 'maximize') {
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    } else win.close();
  });

  // Settings (sanitized in settings.ts; side effects run from its change listener in main.ts)
  ipcMain.handle(IPC.settingsGet, () => getSettings());
  ipcMain.handle(IPC.settingsUpdate, (_e, patch: SettingsPatch) => updateSettings(patch));

  // Updates
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

  // Library
  ipcMain.handle(IPC.libraryGet, () => getLibrary());
  ipcMain.handle(IPC.libraryImportSteam, () => importSteamLibrary());
  ipcMain.handle(IPC.libraryAddManual, (event) => addGameManually(BrowserWindow.fromWebContents(event.sender)));
  ipcMain.handle(IPC.librarySetPinned, (_e, key: string, pinned: boolean) => setPinned(String(key), !!pinned));
  ipcMain.handle(IPC.libraryRemove, (_e, key: string) => removeGame(String(key)));

  // Detection
  ipcMain.handle(IPC.detectionGet, () => getDetectionState());

  // Overlay
  ipcMain.handle(IPC.overlayGetState, () => getOverlayState());
  ipcMain.handle(IPC.overlaySetPreview, (_e, on: boolean) => setOverlayPreview(!!on));
  ipcMain.handle(IPC.overlayTrigger, (_e, action: HotkeyAction) => {
    if (HOTKEY_ACTIONS.includes(action)) handleOverlayAction(action);
  });
  ipcMain.on(IPC.overlayResize, (event, width: unknown, height: unknown) => {
    if (typeof width === 'number' && typeof height === 'number') resizeOverlay(event.sender, width, height);
  });

  // Hotkeys
  ipcMain.handle(IPC.hotkeysGetStatus, () => getHotkeyStatus());
  ipcMain.handle(IPC.hotkeysSetCapture, (_e, on: boolean) => setHotkeyCapture(!!on));

  ipcMain.handle(IPC.displaysGet, (): DisplayInfo[] => {
    const primary = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map((d, i) => ({
      id: d.id,
      label: d.label || `Display ${i + 1}`,
      primary: d.id === primary,
      width: d.size.width,
      height: d.size.height,
    }));
  });
}
