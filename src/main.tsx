import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/global.css';
import { SplashApp } from './splash/SplashApp';
import { ShellApp } from './shell/ShellApp';
import { OverlayApp } from './overlay/OverlayApp';
import { PopupApp } from './popup/PopupApp';
import { FnMonitorApp } from './fnmonitor/FnMonitorApp';

// One renderer bundle serves every window; the main process passes ?window=splash|main|overlay.
// Uncaught renderer errors go to the opt-in crash reporter (it drops them unless the user turned it on).
window.addEventListener('error', (e) => window.shotcaller?.reportError(String(e.message), e.error?.stack));
window.addEventListener('unhandledrejection', (e) => {
  const err = e.reason instanceof Error ? e.reason : new Error(String(e.reason));
  window.shotcaller?.reportError(err.message, err.stack);
});

const windowName = new URLSearchParams(window.location.search).get('window');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {windowName === 'splash' ? <SplashApp /> : windowName === 'overlay' ? <OverlayApp /> : windowName === 'popup' ? <PopupApp /> : windowName === 'fnmonitor' ? <FnMonitorApp /> : <ShellApp />}
  </React.StrictMode>,
);
