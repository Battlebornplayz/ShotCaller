import { app, BrowserWindow, ipcMain, screen, shell } from 'electron';
import { IPC } from '../shared/ipc';
import {
  HOTKEY_ACTIONS,
  RARITY_TIERS,
  type DisplayInfo,
  type HotkeyAction,
  type ProfilePatch,
  type RarityTier,
  type SettingsPatch,
  type SignInMethod,
} from '../shared/types';
import {
  addCustomAchievement,
  getGameAchievements,
  getHubState,
  getTimeline,
  removeCustomAchievement,
  setManualUnlock,
  testPopup,
} from './achievements';
import { popupDone } from './popup';
import {
  getMatches,
  getSkillshotData,
  getSkillshotState,
  getSkillCollection,
  pickOffer,
  setClass,
  setGoal,
  setOffer,
} from './skillshot/tracker';
import { getMcpInfo } from './skillshot/mcpServer';
import { getScreenPreview, getScreenStatus } from './skillshot/screenReader';
import { searchSteamApps } from './steamPublic';
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
import { addGameManually, getLibrary, importSteamLibrary, removeGame, setPinned, setSteamLink } from './library';
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

  // Achievement hub
  const key = (k: unknown) => str(k, 200);
  ipcMain.handle(IPC.hubGet, () => getHubState());
  ipcMain.handle(IPC.hubGame, (_e, k: unknown) => getGameAchievements(key(k)));
  ipcMain.handle(IPC.hubTimeline, (_e, limit: unknown) => getTimeline(Number.isFinite(limit) ? Number(limit) : 200));
  ipcMain.handle(IPC.hubSetManual, (_e, k: unknown, id: unknown, on: unknown) => setManualUnlock(key(k), str(id, 200), !!on));
  ipcMain.handle(IPC.hubSearchSteam, async (_e, term: unknown) => {
    try {
      return await searchSteamApps(str(term, 100));
    } catch {
      return [];
    }
  });
  ipcMain.handle(IPC.hubLinkSteam, (_e, k: unknown, appId: unknown) => {
    const id = appId === null ? null : Number(appId);
    if (id !== null && !(Number.isInteger(id) && id > 0)) return { ok: false, error: 'Not a Steam app id.' };
    return setSteamLink(key(k), id) ? { ok: true } : { ok: false, error: 'This game can’t be linked.' };
  });
  ipcMain.handle(IPC.hubAddCustom, (_e, k: unknown, name: unknown, desc: unknown) => addCustomAchievement(key(k), str(name, 80), str(desc, 300)));
  ipcMain.handle(IPC.hubRemoveCustom, (_e, k: unknown, id: unknown) => removeCustomAchievement(key(k), str(id, 200)));
  ipcMain.handle(IPC.hubTestPopup, (_e, tier: unknown) => {
    if (RARITY_TIERS.includes(tier as RarityTier)) testPopup(tier as RarityTier);
  });
  ipcMain.on(IPC.popupDone, () => popupDone());

  // Skillshot City helper
  const ids = (v: unknown): string[] => (Array.isArray(v) ? v.slice(0, 8).map((x) => str(x, 40)) : []);
  ipcMain.handle(IPC.skillshotGet, () => getSkillshotState());
  ipcMain.handle(IPC.skillshotData, () => getSkillshotData());
  ipcMain.handle(IPC.skillshotMatches, () => getMatches());
  ipcMain.handle(IPC.skillshotCollection, () => getSkillCollection());
  ipcMain.handle(IPC.skillshotScreen, () => getScreenStatus());
  ipcMain.handle(IPC.skillshotScreenPreview, () => getScreenPreview());
  ipcMain.handle(IPC.mcpInfo, () => getMcpInfo());
  ipcMain.handle(IPC.skillshotSetOffer, (_e, v: unknown) => setOffer(ids(v), 'manual'));
  ipcMain.handle(IPC.skillshotPick, (_e, which: unknown) => {
    if (which === 0 || which === 1 || which === 2) pickOffer(which);
    else if (typeof which === 'string') pickOffer(str(which, 40));
  });
  ipcMain.handle(IPC.skillshotSetGoal, (_e, v: unknown, locked: unknown) => setGoal(ids(v), !!locked));
  ipcMain.handle(IPC.skillshotSetClass, (_e, id: unknown) => setClass(id === null ? null : str(id, 40)));

  // Links out: Steam pages and web searches only.
  const ALLOWED_HOSTS = new Set(['steamcommunity.com', 'store.steampowered.com', 'www.google.com', 'www.youtube.com']);
  ipcMain.handle(IPC.openExternal, (_e, url: unknown) => {
    try {
      const u = new URL(str(url, 2000));
      if (u.protocol === 'https:' && ALLOWED_HOSTS.has(u.hostname)) void shell.openExternal(u.toString());
    } catch {
      // ignore bad URLs
    }
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
