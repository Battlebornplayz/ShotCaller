import { app, BrowserWindow } from 'electron';
import { IPC } from '../shared/ipc';
import type { RunningGame } from '../shared/types';
import { disposeHub, initHub, onHubChange } from './achievements';
import { backupGameLog, disposeSkillshot, initSkillshot, onCollectionChange, onSkillshotChange } from './skillshot/tracker';
import { setMcpRunning } from './skillshot/mcpServer';
import { noteMouseDown, onScreenStatus, screenReaderRunning, setScreenReaderRunning } from './skillshot/screenReader';
import { disposeAltHook, initAltHook, setAltHookRunning } from './altHook';
import { disposeFortnite, initFortnite, onFortniteChange, setFortniteRunning } from './fortnite/tracker';
import { onFortniteScreen, setFortniteReaderRunning } from './fortnite/screenReader';
import { initLiveMap, onLiveMap } from './fortnite/liveMap';
import { initFullMap } from './fortnite/fullMap';
import { initSquad, onSquad, stopSquad } from './fortnite/squad';
import { ensureSeasonMap } from './fortnite/seasonMap';
import { fortniteMonitorSettingsChanged, syncFortniteMonitor } from './fortnite/monitorWindow';
import { disposeOnline, initOnline, onShop, onStats, refreshStats, wishlistChanged } from './fortnite/online';
import { disposeAuth, initAuth, onAuthStateChange, refreshProfile } from './auth';
import { initCrashReports } from './crashReports';
import { getDetectionState, onDetectionChange, startDetection, stopDetection } from './detection';
import { disposeHotkeys, initHotkeys, refreshHotkeys, setHotkeysInGame } from './hotkeys';
import { broadcast, registerIpc } from './ipc';
import { getLibrary, importSteamLibrary, onLibraryChange, refreshLibrary, stopStoreWatchers } from './library';
import { playGame } from './launcher';
import {
  applyOverlaySettings,
  cornerOverlayVisible,
  getOverlayState,
  handleOverlayAction,
  onOverlayStateChange,
  setAltHeld,
  setAltHookAvailable,
  setOverlayGame,
  setOverlayPreview,
  wantsOverlay,
} from './overlay';
import { getSettings, onSettingsChange } from './settings';
import { applyLaunchAtLogin, startedHidden } from './startup';
import { disposePopup } from './popup';
import { flushSessions, sessionStarted, sessionStopped } from './sessions';
import { createTray, destroyTray, updateTray } from './tray';
import { checkForUpdates, initUpdater } from './updater';
import { createMainWindow, createSplashWindow } from './windows';

const APP_ID = 'com.battlebornplayz.shotcaller';

// Only one ShotCaller at a time: a second launch opens the first one's window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let splash: BrowserWindow | null = null;
  let main: BrowserWindow | null = null;
  let quitting = false;

  /** Quit unless ShotCaller is meant to keep running in the tray. */
  function maybeQuit(): void {
    if (quitting) return;
    if (!getSettings().startup.closeToTray && !main && !splash) app.quit();
  }

  function openMain(): void {
    if (main && !main.isDestroyed()) {
      if (main.isMinimized()) main.restore();
      main.show();
      main.focus();
      return;
    }
    main = createMainWindow();
    // Cheap fallback to realtime: re-read the synced profile whenever the window is focused.
    main.on('focus', () => void refreshProfile());
    main.on('closed', () => {
      main = null;
      maybeQuit();
    });
  }

  function enterApp(): void {
    openMain();
    if (splash && !splash.isDestroyed()) splash.close();
    splash = null;
  }

  /**
   * What opening ShotCaller shows: the launcher, then Play goes on to the app. If a window is already up, it
   * just comes to the front. Starting with the OS stays in the tray, and in-game shortcuts go straight to the app.
   */
  function showLauncher(): void {
    if (splash && !splash.isDestroyed()) {
      if (splash.isMinimized()) splash.restore();
      splash.show();
      splash.focus();
      return;
    }
    if (main && !main.isDestroyed()) {
      openMain();
      return;
    }
    splash = createSplashWindow();
    splash.on('closed', () => {
      splash = null;
      maybeQuit();
    });
    // Check once the launcher has loaded, so its first render gets the state updates.
    splash.webContents.once('did-finish-load', () => {
      void checkForUpdates();
    });
  }

  function overlayGameFrom(running: RunningGame[]): RunningGame | null {
    // Prefer games with a dedicated module, then the most recently started.
    const eligible = running.filter(wantsOverlay).sort((a, b) => Number(!!b.moduleId) - Number(!!a.moduleId) || b.since - a.since);
    return eligible[0] ?? null;
  }

  function refreshTray(): void {
    const playing = getDetectionState().running;
    const recent = getLibrary()
      .games.filter((g) => g.lastPlayed && g.installed && !g.hidden && !g.isTool)
      .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
      .slice(0, 5)
      .map((g) => ({ key: g.key, name: g.name }));
    updateTray({ playing: playing[0]?.name ?? null, previewOn: getOverlayState().preview, recent });
  }

  app.on('second-instance', () => showLauncher());

  app.whenReady().then(async () => {
    app.setAppUserModelId(APP_ID);
    initUpdater();
    initCrashReports();
    initAuth();
    onAuthStateChange((state) => broadcast(IPC.authState, state));
    registerIpc({ enterApp, openMain });

    createTray({
      openMain: showLauncher,
      togglePreview: () => setOverlayPreview(!getOverlayState().preview),
      play: (key) => {
        if (!playGame(key).ok) {
          openMain();
          broadcast(IPC.quickOpen, key);
        }
      },
      quit: () => app.quit(),
    });

    applyLaunchAtLogin(getSettings().startup.launchAtLogin);
    initHotkeys(handleOverlayAction);
    setAltHookAvailable(await initAltHook(setAltHeld, noteMouseDown));
    // The screen reader also watches for clicks on the offer cards, even when no corner overlay is up.
    const syncInputHook = () => setAltHookRunning(cornerOverlayVisible() || screenReaderRunning());
    const syncScreenReader = () => {
      const playing = getDetectionState().running.some((rg) => rg.moduleId === 'skillshot-city');
      setScreenReaderRunning(playing, getSettings().skillshot.screenReader);
      syncInputHook();
    };
    const syncFortnite = () => {
      const playing = getDetectionState().running.some((rg) => rg.moduleId === 'fortnite');
      const fn = getSettings().fortnite;
      setFortniteRunning(playing);
      setFortniteReaderRunning(playing, fn.screenReader, fn.recorder);
      if (playing) {
        void ensureSeasonMap();
        void refreshStats();
      }
      syncFortniteMonitor(playing);
    };

    onOverlayStateChange((state) => {
      syncInputHook();
      setHotkeysInGame(!!state.game || state.preview);
      refreshTray();
    });

    onDetectionChange((state, started, stopped) => {
      broadcast(IPC.detectionChanged, state);
      for (const rg of started) sessionStarted(rg);
      for (const rg of stopped) sessionStopped(rg);
      if (stopped.length) refreshLibrary(); // playtime and "recently played"
      // The game writes its log in batches, so give it a moment to finish after it closes.
      if (stopped.some((rg) => rg.moduleId === 'skillshot-city')) setTimeout(() => void backupGameLog(), 5000);
      setOverlayGame(overlayGameFrom(state.running));
      syncScreenReader();
      syncFortnite();
      if (started.some(wantsOverlay) && getSettings().startup.onGameLaunch === 'window') openMain();
      refreshTray();
    });

    let trayRecent = '';
    onLibraryChange((lib) => {
      broadcast(IPC.libraryChanged, lib);
      const sig = lib.games
        .filter((g) => g.lastPlayed)
        .map((g) => `${g.key}:${g.lastPlayed}`)
        .join('|');
      if (sig !== trayRecent) {
        trayRecent = sig;
        refreshTray();
      }
    });

    onSettingsChange((next, prev) => {
      broadcast(IPC.settingsChanged, next);
      if (JSON.stringify(next.hotkeys) !== JSON.stringify(prev.hotkeys) || next.hotkeysOnlyInGame !== prev.hotkeysOnlyInGame) {
        refreshHotkeys();
      }
      if (next.startup.launchAtLogin !== prev.startup.launchAtLogin) applyLaunchAtLogin(next.startup.launchAtLogin);
      if (next.channel !== prev.channel) void checkForUpdates();
      if (next.skillshot.screenReader !== prev.skillshot.screenReader) syncScreenReader();
      if (next.fortnite.screenReader !== prev.fortnite.screenReader || next.fortnite.recorder !== prev.fortnite.recorder) syncFortnite();
      if (JSON.stringify(next.fortnite.monitor) !== JSON.stringify(prev.fortnite.monitor)) fortniteMonitorSettingsChanged();
      if (JSON.stringify(next.fortnite.wishlist) !== JSON.stringify(prev.fortnite.wishlist)) wishlistChanged();
      if (next.mcp.enabled !== prev.mcp.enabled) setMcpRunning(next.mcp.enabled);
      applyOverlaySettings(next, prev);
      if (next.overlay.allGames !== prev.overlay.allGames) setOverlayGame(overlayGameFrom(getDetectionState().running));
    });

    // Detection works off the stored library straight away; the Steam re-scan refreshes it.
    startDetection();
    onHubChange((state) => broadcast(IPC.hubChanged, state));
    onSkillshotChange((state) => broadcast(IPC.skillshotChanged, state));
    onCollectionChange((c) => broadcast(IPC.skillshotCollectionChanged, c));
    onScreenStatus((s) => broadcast(IPC.skillshotScreenChanged, s));
    initFortnite();
    onFortniteChange((s) => broadcast(IPC.fortniteChanged, s));
    onFortniteScreen((s) => broadcast(IPC.fortniteScreenChanged, s));
    initLiveMap();
    initFullMap();
    onLiveMap((s) => broadcast(IPC.fortniteMapChanged, s));
    initSquad();
    onSquad((s) => broadcast(IPC.fortniteSquadChanged, s));
    onStats((s) => broadcast(IPC.fortniteStatsChanged, s));
    onShop((s) => broadcast(IPC.fortniteShopChanged, s));
    initOnline();
    // The map is small to keep and needed for the lobby view too: load it (and look for a new season) now.
    void ensureSeasonMap();
    syncScreenReader();
    syncFortnite(); // Starts in the right state ("off" or "game not running") before any game is seen.
    setMcpRunning(getSettings().mcp.enabled);
    void importSteamLibrary().then(() => Promise.all([initHub(), initSkillshot()]));

    if (startedHidden()) {
      // Started with the OS: stay in the tray until a game launches or the user opens it.
      void checkForUpdates();
    } else {
      showLauncher();
    }

    app.on('activate', () => showLauncher());
  });

  // The tray keeps ShotCaller alive with no windows open (see maybeQuit for the opt-out).
  app.on('window-all-closed', () => {
    maybeQuit();
  });

  app.on('before-quit', () => {
    quitting = true;
    stopDetection();
    stopStoreWatchers();
    flushSessions();
    disposeHub();
    setScreenReaderRunning(false, false);
    stopSquad();
    setFortniteReaderRunning(false, false, false);
    disposeFortnite();
    disposeOnline();
    setMcpRunning(false);
    disposeSkillshot();
    disposePopup();
    disposeHotkeys();
    disposeAltHook();
    destroyTray();
    disposeAuth();
  });
}
