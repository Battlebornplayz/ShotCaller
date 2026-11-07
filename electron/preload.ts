import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc';
import type { ShotCallerApi } from '../shared/types';

/** Subscribes to a main-process event; returns the unsubscribe function. */
function on<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: ShotCallerApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.appInfo),

  getSettings: () => ipcRenderer.invoke(IPC.settingsGet),
  updateSettings: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch),
  onSettings: (cb) => on(IPC.settingsChanged, cb),

  getUpdateState: () => ipcRenderer.invoke(IPC.updaterGetState),
  checkForUpdates: () => ipcRenderer.invoke(IPC.updaterCheck),
  downloadUpdate: () => ipcRenderer.invoke(IPC.updaterDownload),
  installUpdate: () => ipcRenderer.invoke(IPC.updaterInstall),
  getPatchNotes: () => ipcRenderer.invoke(IPC.patchNotesGet),
  onUpdateState: (cb) => on(IPC.updaterState, cb),

  getLibrary: () => ipcRenderer.invoke(IPC.libraryGet),
  importSteam: () => ipcRenderer.invoke(IPC.libraryImportSteam),
  addGameManually: () => ipcRenderer.invoke(IPC.libraryAddManual),
  setGamePinned: (key, pinned) => ipcRenderer.invoke(IPC.librarySetPinned, key, pinned),
  removeGame: (key) => ipcRenderer.invoke(IPC.libraryRemove, key),
  onLibrary: (cb) => on(IPC.libraryChanged, cb),

  getDetection: () => ipcRenderer.invoke(IPC.detectionGet),
  onDetection: (cb) => on(IPC.detectionChanged, cb),

  getOverlayState: () => ipcRenderer.invoke(IPC.overlayGetState),
  onOverlayState: (cb) => on(IPC.overlayState, cb),
  onOverlayAction: (cb) => on(IPC.overlayAction, cb),
  setOverlayPreview: (on) => ipcRenderer.invoke(IPC.overlaySetPreview, on),
  triggerAction: (action) => ipcRenderer.invoke(IPC.overlayTrigger, action),
  reportOverlaySize: (width, height) => ipcRenderer.send(IPC.overlayResize, width, height),

  getHotkeyStatus: () => ipcRenderer.invoke(IPC.hotkeysGetStatus),
  onHotkeyStatus: (cb) => on(IPC.hotkeysStatus, cb),
  setHotkeyCapture: (capturing) => ipcRenderer.invoke(IPC.hotkeysSetCapture, capturing),

  getDisplays: () => ipcRenderer.invoke(IPC.displaysGet),

  enterApp: () => ipcRenderer.invoke(IPC.appEnter),
  openMainWindow: () => ipcRenderer.invoke(IPC.appOpenMain),
  windowControl: (action) => ipcRenderer.invoke(IPC.windowControl, action),
};

contextBridge.exposeInMainWorld('shotcaller', api);
