import { app, BrowserWindow } from 'electron';
import { IPC } from '../shared/ipc';
import type { RunningGame } from '../shared/types';
import { disposeAltHook, initAltHook, setAltHookRunning } from './altHook';
import { getDetectionState, onDetectionChange, startDetection, stopDetection } from './detection';
import { disposeHotkeys, initHotkeys, refreshHotkeys, setHotkeysInGame } from './hotkeys';
import { broadcast, registerIpc } from './ipc';
import { importSteamLibrary, onLibraryChange } from './library';
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

  function overlayGameFrom(running: RunningGame[]): RunningGame | null {
    // Prefer games with a dedicated module, then the most recently started.
    const eligible = running.filter(wantsOverlay).sort((a, b) => Number(!!b.moduleId) - Number(!!a.moduleId) || b.since - a.since);
    return eligible[0] ?? null;
  }

  function refreshTray(): void {
    const playing = getDetectionState().running;
    updateTray({ playing: playing[0]?.name ?? null, previewOn: getOverlayState().preview });
  }

  app.on('second-instance', () => {
    if (splash && !splash.isDestroyed()) splash.focus();
    else openMain();
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId(APP_ID);
    initUpdater();
    registerIpc({ enterApp, openMain });

    createTray({
      openMain: () => (splash && !splash.isDestroyed() ? splash.focus() : openMain()),
      togglePreview: () => setOverlayPreview(!getOverlayState().preview),
      quit: () => app.quit(),
    });

    applyLaunchAtLogin(getSettings().startup.launchAtLogin);
    initHotkeys(handleOverlayAction);
    setAltHookAvailable(await initAltHook(setAltHeld));

    onOverlayStateChange((state) => {
      setAltHookRunning(cornerOverlayVisible());
      setHotkeysInGame(!!state.game || state.preview);
      refreshTray();
    });

    onDetectionChange((state, started) => {
      broadcast(IPC.detectionChanged, state);
      setOverlayGame(overlayGameFrom(state.running));
      if (started.some(wantsOverlay) && getSettings().startup.onGameLaunch === 'window') openMain();
      refreshTray();
    });

    onLibraryChange((lib) => broadcast(IPC.libraryChanged, lib));

    onSettingsChange((next, prev) => {
      broadcast(IPC.settingsChanged, next);
      if (JSON.stringify(next.hotkeys) !== JSON.stringify(prev.hotkeys) || next.hotkeysOnlyInGame !== prev.hotkeysOnlyInGame) {
        refreshHotkeys();
      }
      if (next.startup.launchAtLogin !== prev.startup.launchAtLogin) applyLaunchAtLogin(next.startup.launchAtLogin);
      if (next.channel !== prev.channel) void checkForUpdates();
      applyOverlaySettings(next, prev);
      if (next.overlay.allGames !== prev.overlay.allGames) setOverlayGame(overlayGameFrom(getDetectionState().running));
    });

    // Detection works off the stored library straight away; the Steam re-scan refreshes it.
    startDetection();
    void importSteamLibrary();

    if (startedHidden()) {
      // Started with the OS: stay in the tray until a game launches or the user opens it.
      void checkForUpdates();
    } else {
      splash = createSplashWindow();
      splash.on('closed', () => {
        splash = null;
        maybeQuit();
      });
      // Check once the splash has loaded, so its first render gets the state updates.
      splash.webContents.once('did-finish-load', () => {
        void checkForUpdates();
      });
    }

    app.on('activate', () => openMain());
  });

  // The tray keeps ShotCaller alive with no windows open (see maybeQuit for the opt-out).
  app.on('window-all-closed', () => {
    maybeQuit();
  });

  app.on('before-quit', () => {
    quitting = true;
    stopDetection();
    disposeHotkeys();
    disposeAltHook();
    destroyTray();
  });
}
