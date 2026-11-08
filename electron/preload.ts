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

  getHub: () => ipcRenderer.invoke(IPC.hubGet),
  onHub: (cb) => on(IPC.hubChanged, cb),
  getGameAchievements: (key) => ipcRenderer.invoke(IPC.hubGame, key),
  getTimeline: (limit) => ipcRenderer.invoke(IPC.hubTimeline, limit),
  setManualUnlock: (key, id, unlocked) => ipcRenderer.invoke(IPC.hubSetManual, key, id, unlocked),
  searchSteamApps: (term) => ipcRenderer.invoke(IPC.hubSearchSteam, term),
  linkSteamApp: (key, appId) => ipcRenderer.invoke(IPC.hubLinkSteam, key, appId),
  addCustomAchievement: (key, name, description) => ipcRenderer.invoke(IPC.hubAddCustom, key, name, description),
  removeCustomAchievement: (key, id) => ipcRenderer.invoke(IPC.hubRemoveCustom, key, id),
  testPopup: (tier) => ipcRenderer.invoke(IPC.hubTestPopup, tier),
  getSkillshot: () => ipcRenderer.invoke(IPC.skillshotGet),
  onSkillshot: (cb) => on(IPC.skillshotChanged, cb),
  getSkillshotData: () => ipcRenderer.invoke(IPC.skillshotData),
  getSkillshotMatches: () => ipcRenderer.invoke(IPC.skillshotMatches),
  getSkillCollection: () => ipcRenderer.invoke(IPC.skillshotCollection),
  onSkillCollection: (cb) => on(IPC.skillshotCollectionChanged, cb),
  setSkillshotOffer: (ids) => ipcRenderer.invoke(IPC.skillshotSetOffer, ids),
  pickSkillshot: (which) => ipcRenderer.invoke(IPC.skillshotPick, which),
  setSkillshotGoal: (ids, locked) => ipcRenderer.invoke(IPC.skillshotSetGoal, ids, locked),
  setSkillshotClass: (id) => ipcRenderer.invoke(IPC.skillshotSetClass, id),
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
  onPopup: (cb) => on(IPC.popupShow, cb),
  popupDone: () => ipcRenderer.send(IPC.popupDone),

  getAuthState: () => ipcRenderer.invoke(IPC.authGetState),
  onAuthState: (cb) => on(IPC.authState, cb),
  signIn: (method) => ipcRenderer.invoke(IPC.authSignIn, method),
  signInWithEmail: (email, password) => ipcRenderer.invoke(IPC.authSignInEmail, email, password),
  signUpWithEmail: (email, password, displayName) => ipcRenderer.invoke(IPC.authSignUpEmail, email, password, displayName),
  sendPasswordReset: (email) => ipcRenderer.invoke(IPC.authSendReset, email),
  resendVerification: () => ipcRenderer.invoke(IPC.authResendVerification),
  cancelAuthFlow: () => ipcRenderer.invoke(IPC.authCancel),
  dismissAuthMessage: () => ipcRenderer.invoke(IPC.authDismissMessage),
  signOut: () => ipcRenderer.invoke(IPC.authSignOut),
  linkAccount: (method) => ipcRenderer.invoke(IPC.authLink, method),
  unlinkAccount: (method) => ipcRenderer.invoke(IPC.authUnlink, method),
  updateProfile: (patch) => ipcRenderer.invoke(IPC.profileUpdate, patch),
  refreshProfile: () => ipcRenderer.invoke(IPC.profileRefresh),
  reportError: (message, stack) => ipcRenderer.send(IPC.crashReport, message, stack),

  enterApp: () => ipcRenderer.invoke(IPC.appEnter),
  openMainWindow: () => ipcRenderer.invoke(IPC.appOpenMain),
  windowControl: (action) => ipcRenderer.invoke(IPC.windowControl, action),
};

contextBridge.exposeInMainWorld('shotcaller', api);
