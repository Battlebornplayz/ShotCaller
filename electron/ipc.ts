import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { IPC } from '../shared/ipc';
import { HOTKEY_ACTIONS, type DisplayInfo, type HotkeyAction, type ProfilePatch, type SettingsPatch, type SignInMethod } from '../shared/types';
import {
  cancelAuthFlow,
  dismissAuthMessage,
  getAuthState,
  linkAccount,
  refreshProfile,
  sendPasswordReset,
  resendVerification,
  signIn,
  signInWithEmail,
  signOut,
  signUpWithEmail,
  unlinkAccount,
  updateProfile,
} from './auth';
import { reportCrash } from './crashReports';
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

  // Accounts. Every argument is coerced here; auth.ts validates the values.
  const METHODS: SignInMethod[] = ['google'];
  const method = (m: unknown): SignInMethod | null => (METHODS.includes(m as SignInMethod) ? (m as SignInMethod) : null);
  const str = (v: unknown, max = 500) => String(v ?? '').slice(0, max);
  const bad = { ok: false as const, error: 'Unknown sign-in method.' };

  ipcMain.handle(IPC.authGetState, () => getAuthState());
  ipcMain.handle(IPC.authSignIn, (_e, m: unknown) => (method(m) ? signIn(method(m)!) : bad));
  ipcMain.handle(IPC.authSignInEmail, (_e, email: unknown, pw: unknown) => signInWithEmail(str(email, 320), str(pw, 200)));
  ipcMain.handle(IPC.authSignUpEmail, (_e, email: unknown, pw: unknown, name: unknown) => signUpWithEmail(str(email, 320), str(pw, 200), str(name, 64)));
  ipcMain.handle(IPC.authSendReset, (_e, email: unknown) => sendPasswordReset(str(email, 320)));
  ipcMain.handle(IPC.authResendVerification, () => resendVerification());
  ipcMain.handle(IPC.authCancel, () => cancelAuthFlow());
  ipcMain.handle(IPC.authDismissMessage, () => dismissAuthMessage());
  ipcMain.handle(IPC.authSignOut, () => signOut());
  ipcMain.handle(IPC.authLink, (_e, m: unknown) => (method(m) ? linkAccount(method(m)!) : bad));
  ipcMain.handle(IPC.authUnlink, (_e, m: unknown) => (method(m) ? unlinkAccount(method(m)!) : bad));
  ipcMain.handle(IPC.profileUpdate, (_e, patch: unknown) => {
    const p = patch && typeof patch === 'object' ? (patch as Record<string, unknown>) : {};
    const clean: ProfilePatch = {};
    if (p.username !== undefined) clean.username = str(p.username, 40);
    if (p.displayName !== undefined) clean.displayName = str(p.displayName, 64);
    if (p.bio !== undefined) clean.bio = str(p.bio, 400);
    if (p.visibility !== undefined) clean.visibility = str(p.visibility, 10) as ProfilePatch['visibility'];
    return updateProfile(clean);
  });
  ipcMain.handle(IPC.profileRefresh, () => refreshProfile());
  ipcMain.on(IPC.crashReport, (_e, message: unknown, stack: unknown) => {
    reportCrash('renderer', str(message, 1000), stack === undefined ? undefined : str(stack, 8000));
  });

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
