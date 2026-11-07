import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc';
import type { Channel, ShotCallerApi, UpdateState } from '../shared/types';

const api: ShotCallerApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.appInfo),
  getSettings: () => ipcRenderer.invoke(IPC.settingsGet),
  setChannel: (channel: Channel) => ipcRenderer.invoke(IPC.settingsSetChannel, channel),
  getUpdateState: () => ipcRenderer.invoke(IPC.updaterGetState),
  checkForUpdates: () => ipcRenderer.invoke(IPC.updaterCheck),
  downloadUpdate: () => ipcRenderer.invoke(IPC.updaterDownload),
  installUpdate: () => ipcRenderer.invoke(IPC.updaterInstall),
  getPatchNotes: () => ipcRenderer.invoke(IPC.patchNotesGet),
  onUpdateState: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: UpdateState) => callback(state);
    ipcRenderer.on(IPC.updaterState, listener);
    return () => ipcRenderer.removeListener(IPC.updaterState, listener);
  },
  enterApp: () => ipcRenderer.invoke(IPC.appEnter),
  windowControl: (action) => ipcRenderer.invoke(IPC.windowControl, action),
};

contextBridge.exposeInMainWorld('shotcaller', api);
