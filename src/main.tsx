import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/global.css';
import { SplashApp } from './splash/SplashApp';
import { ShellApp } from './shell/ShellApp';

// One renderer bundle serves both windows; the main process passes ?window=splash|main.
const windowName = new URLSearchParams(window.location.search).get('window');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{windowName === 'splash' ? <SplashApp /> : <ShellApp />}</React.StrictMode>,
);
