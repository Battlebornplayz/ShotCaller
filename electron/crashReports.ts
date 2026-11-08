// Opt-in, anonymous crash reports (Settings → Privacy). Off by default.
// A report is the error message and stack, the app version and the OS: no user id, no game data.
// Stored create-only in Firestore `crashReports`; the rules let nobody read them back through the app.

import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { app } from 'electron';
import os from 'node:os';
import { getDb } from './auth';
import { getSettings } from './settings';

const MAX_PER_SESSION = 5;
let sent = 0;
const seen = new Set<string>();

/** Strips the user's home folder from paths in stacks. */
function scrub(text: string): string {
  const home = os.homedir();
  return home ? text.split(home).join('~') : text;
}

export function reportCrash(processName: 'main' | 'renderer', message: string, stack?: string): void {
  if (!getSettings().privacy.crashReports) return;
  const db = getDb();
  if (!db || sent >= MAX_PER_SESSION) return;
  const key = `${processName}:${message}`;
  if (seen.has(key)) return;
  seen.add(key);
  sent += 1;
  addDoc(collection(db, 'crashReports'), {
    appVersion: app.getVersion().slice(0, 40),
    platform: process.platform.slice(0, 20),
    process: processName,
    message: scrub(String(message)).slice(0, 1000),
    stack: stack ? scrub(String(stack)).slice(0, 8000) : null,
    createdAt: serverTimestamp(),
  }).catch((err) => console.warn('Crash report not sent:', err?.message ?? err));
}

export function initCrashReports(): void {
  // The monitor variant observes without changing Electron's default handling.
  process.on('uncaughtExceptionMonitor', (err) => reportCrash('main', err?.message ?? String(err), err?.stack));
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
    const err = reason instanceof Error ? reason : new Error(String(reason));
    reportCrash('main', err.message, err.stack);
  });
  app.on('render-process-gone', (_e, _wc, details) => {
    if (details.reason !== 'clean-exit') reportCrash('renderer', `Renderer gone: ${details.reason} (exit ${details.exitCode})`);
  });
}
