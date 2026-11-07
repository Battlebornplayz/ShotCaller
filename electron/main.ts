import { app, BrowserWindow } from 'electron';
import { registerIpc } from './ipc';
import { checkForUpdates, initUpdater } from './updater';
import { createMainWindow, createSplashWindow } from './windows';

const APP_ID = 'com.battlebornplayz.shotcaller';

// Only one ShotCaller at a time: a second launch focuses the first window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let splash: BrowserWindow | null = null;
  let main: BrowserWindow | null = null;

  app.on('second-instance', () => {
    const win = main ?? splash;
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  function enterApp(): void {
    if (!main || main.isDestroyed()) {
      main = createMainWindow();
      main.on('closed', () => {
        main = null;
      });
    }
    if (splash && !splash.isDestroyed()) splash.close();
    splash = null;
  }

  app.whenReady().then(() => {
    app.setAppUserModelId(APP_ID);
    initUpdater();
    registerIpc(enterApp);

    splash = createSplashWindow();
    splash.on('closed', () => {
      splash = null;
      // Closing the splash without pressing Play quits, unless the main shell is open.
      if (!main) app.quit();
    });

    // Check once the splash has loaded, so its first render gets the state updates.
    splash.webContents.once('did-finish-load', () => {
      void checkForUpdates();
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) enterApp();
    });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
