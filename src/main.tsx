import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/global.css';
import { SplashApp } from './splash/SplashApp';
import { ShellApp } from './shell/ShellApp';
import { OverlayApp } from './overlay/OverlayApp';

// One renderer bundle serves every window; the main process passes ?window=splash|main|overlay.
const windowName = new URLSearchParams(window.location.search).get('window');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {windowName === 'splash' ? <SplashApp /> : windowName === 'overlay' ? <OverlayApp /> : <ShellApp />}
  </React.StrictMode>,
);
