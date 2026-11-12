import { app, shell } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { GameSource, LibraryGame, StoreCopy } from '../shared/types';
import { getLibrary, recordLaunch, removeGame, storeRecords } from './library';
import { markLaunchedFromTab } from './overlay';
import { EPIC_LIBRARY_URI, epicLaunchUri } from './stores/epic';
import { xboxLaunchTarget } from './stores/xbox';

/**
 * Play, Install and Uninstall from the Games tab. Games start through their own store (keeps
 * sign-in, cloud saves, updates and anti-cheat); installs and uninstalls are handed to the store.
 * Only games ShotCaller has no store for (Anker, added by hand) start from their exe.
 */

export interface LaunchResult {
  ok: boolean;
  error?: string;
}

const steamId = (key: string) => Number(key.split(':')[1]);

/** Splits launch options like a shell would (quotes keep spaces). */
function splitArgs(s: string | undefined): string[] {
  if (!s) return [];
  return [...s.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);
}

function findGame(key: string): LibraryGame | undefined {
  return getLibrary().games.find((g) => g.key === key);
}

/** The copy Play uses: the one asked for, else the first installed one. */
function pickCopy(g: LibraryGame, source?: GameSource): StoreCopy | undefined {
  const copies = g.copies ?? [{ source: g.source, key: g.key, installed: g.installed }];
  if (source) return copies.find((c) => c.source === source);
  return copies.find((c) => c.installed && c.source !== 'module') ?? copies.find((c) => c.installed);
}

function startExe(exePath: string, args: string[]): LaunchResult {
  if (!fs.existsSync(exePath)) return { ok: false, error: 'The game’s file isn’t there any more.' };
  try {
    const child = spawn(exePath, args, { cwd: path.dirname(exePath), detached: true, stdio: 'ignore', windowsHide: false });
    child.on('error', () => undefined);
    child.unref();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function openTarget(target: string): void {
  if (target.startsWith('shell:')) {
    spawn('explorer.exe', [target], { detached: true, stdio: 'ignore' }).unref();
  } else {
    void shell.openExternal(target);
  }
}

/** The thing that starts one copy: a store link, a Windows app target or an exe. */
function launchTarget(g: LibraryGame, copy: StoreCopy): { target?: string; exe?: string; args?: string[] } | null {
  const recs = storeRecords();
  switch (copy.source) {
    case 'steam': {
      const id = steamId(copy.key);
      const opts = g.launchOptions?.trim();
      return { target: opts ? `steam://run/${id}//${encodeURIComponent(opts)}/` : `steam://rungameid/${id}` };
    }
    case 'epic': {
      const e = recs.epic.find((x) => `epic:${x.appName}` === copy.key);
      return e ? { target: epicLaunchUri(e) } : null;
    }
    case 'xbox': {
      const x = recs.xbox.find((r) => `xbox:${r.pfn}` === copy.key);
      return x ? { target: xboxLaunchTarget(x) } : null;
    }
    case 'anker': {
      const a = recs.anker.find((r) => `anker:${r.id}` === copy.key);
      return a?.exePath ? { exe: a.exePath, args: splitArgs(g.launchOptions) } : null;
    }
    case 'manual': {
      const m = recs.manual.find((r) => r.key === copy.key);
      return m?.exePath ? { exe: m.exePath, args: splitArgs(g.launchOptions) } : null;
    }
    default:
      return null;
  }
}

export function playGame(key: string, source?: GameSource): LaunchResult {
  const g = findGame(key);
  if (!g) return { ok: false, error: 'That game isn’t in your library any more.' };
  const copy = pickCopy(g, source);
  if (!copy || !copy.installed) return { ok: false, error: 'It isn’t installed. Use Install first.' };
  const t = launchTarget(g, copy);
  if (!t) return { ok: false, error: 'ShotCaller can’t start this one. Start it from its own launcher.' };
  if (t.exe) {
    const r = startExe(t.exe, t.args ?? []);
    if (!r.ok) return r;
  } else if (t.target) {
    openTarget(t.target);
  }
  markLaunchedFromTab(g.key);
  recordLaunch(g.key);
  return { ok: true };
}

export function installGame(key: string): LaunchResult {
  const g = findGame(key);
  const steam = g?.copies?.find((c) => c.source === 'steam');
  if (!g || !steam) return { ok: false, error: 'Install it from its store.' };
  void shell.openExternal(`steam://install/${steamId(steam.key)}`);
  return { ok: true };
}

/** Hands the uninstall to the store (after the user confirmed in the app). */
export function uninstallGame(key: string): LaunchResult {
  const g = findGame(key);
  const copy = g && pickCopy(g);
  if (!g || !copy) return { ok: false, error: 'It isn’t installed.' };
  switch (copy.source) {
    case 'steam':
      void shell.openExternal(`steam://uninstall/${steamId(copy.key)}`);
      return { ok: true };
    case 'epic':
      void shell.openExternal(EPIC_LIBRARY_URI);
      return { ok: true };
    case 'xbox':
      void shell.openExternal('ms-settings:appsfeatures');
      return { ok: true };
    case 'manual':
      removeGame(copy.key);
      return { ok: true };
    default:
      return { ok: false, error: 'Uninstall it from its own launcher.' };
  }
}

export function openGameFolder(key: string): LaunchResult {
  const dir = findGame(key)?.installDir;
  if (!dir || !fs.existsSync(dir)) return { ok: false, error: 'No install folder found.' };
  void shell.openPath(dir);
  return { ok: true };
}

export function openInStore(key: string): LaunchResult {
  const g = findGame(key);
  const copy = g && (pickCopy(g) ?? g.copies?.[0]);
  if (!g || !copy) return { ok: false };
  if (copy.source === 'steam') void shell.openExternal(`steam://nav/games/details/${steamId(copy.key)}`);
  else if (copy.source === 'epic') void shell.openExternal(EPIC_LIBRARY_URI);
  else if (copy.source === 'xbox') void shell.openExternal('xbox://');
  else return { ok: false, error: 'This game has no store page.' };
  return { ok: true };
}

const safeFileName = (s: string) =>
  [...s]
    .filter((c) => c.charCodeAt(0) >= 32 && !'<>:"/\\|?*'.includes(c))
    .join('')
    .trim() || 'Game';

/** Desktop shortcut that starts the game the same way Play does. */
export function createDesktopShortcut(key: string): LaunchResult {
  const g = findGame(key);
  const copy = g && pickCopy(g);
  if (!g || !copy) return { ok: false, error: 'Install the game first.' };
  const t = launchTarget(g, copy);
  if (!t) return { ok: false, error: 'This game can’t have a shortcut from ShotCaller.' };
  const desktop = app.getPath('desktop');
  const name = safeFileName(g.name);
  try {
    if (t.exe) {
      const ok = shell.writeShortcutLink(path.join(desktop, `${name}.lnk`), {
        target: t.exe,
        cwd: path.dirname(t.exe),
        args: g.launchOptions ?? '',
        icon: t.exe,
        iconIndex: 0,
      });
      return ok ? { ok: true } : { ok: false, error: 'Windows didn’t make the shortcut.' };
    }
    if (t.target?.startsWith('shell:')) {
      const ok = shell.writeShortcutLink(path.join(desktop, `${name}.lnk`), { target: 'explorer.exe', args: t.target });
      return ok ? { ok: true } : { ok: false, error: 'Windows didn’t make the shortcut.' };
    }
    const exeForIcon = g.installDir && fs.existsSync(g.installDir) ? findIconExe(g.installDir) : undefined;
    const body = ['[InternetShortcut]', `URL=${t.target}`, ...(exeForIcon ? [`IconFile=${exeForIcon}`, 'IconIndex=0'] : [])].join('\r\n');
    fs.writeFileSync(path.join(desktop, `${name}.url`), body + '\r\n', 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** First exe in the folder (one level), for a shortcut's icon. */
function findIconExe(dir: string): string | undefined {
  try {
    const exe = fs.readdirSync(dir).find((f) => /\.exe$/i.test(f) && !/unins|crash|setup|redist/i.test(f));
    return exe ? path.join(dir, exe) : undefined;
  } catch {
    return undefined;
  }
}
