import { app, shell } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { EmulatorId, ExtraStoreId, GameSource, LibraryGame, StoreCopy } from '../shared/types';
import { ankerLauncherExe } from './anker';
import { extraGameKey, getLibrary, recordLaunch, removeGame, storeRecords } from './library';
import { emulatorArgs, EMULATORS } from './stores/roms';
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

const EXTRA: ExtraStoreId[] = ['gog', 'ea', 'ubisoft', 'battlenet', 'riot', 'rockstar', 'amazon', 'itch'];
const isExtra = (s: GameSource): s is ExtraStoreId => (EXTRA as string[]).includes(s);
const isEmulator = (s: GameSource): s is EmulatorId => EMULATORS.some((e) => e.id === s);

function startProgram(exe: string): void {
  spawn(exe, [], { cwd: path.dirname(exe), detached: true, stdio: 'ignore' }).on('error', () => undefined).unref();
}

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
  if (/^[a-z]:\\/i.test(target)) {
    void shell.openPath(target);
  } else if (target.startsWith('shell:')) {
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
      return a?.exePath ? { exe: a.exePath, args: splitArgs(g.launchOptions ?? a.args) } : null;
    }
    case 'manual': {
      const m = recs.manual.find((r) => r.key === copy.key);
      if (!m?.exePath) return null;
      // An internet shortcut (.url) opens whatever link it holds (steam://, a store page…).
      if (/\.url$/i.test(m.exePath)) return { target: m.exePath };
      return { exe: m.exePath, args: splitArgs(g.launchOptions) };
    }
    default: {
      if (isExtra(copy.source)) {
        const e = recs.extra[copy.source]?.games.find((x) => extraGameKey(x) === copy.key);
        if (!e || (!e.launch.exe && !e.launch.target)) return null;
        return e.launch.exe ? { exe: e.launch.exe, args: e.launch.args ?? [] } : { target: e.launch.target };
      }
      if (isEmulator(copy.source)) {
        const r = recs.roms.find((x) => x.key === copy.key);
        const exe = recs.emulatorExe(copy.source);
        if (!r || !exe) return null;
        return { exe, args: [...emulatorArgs(copy.source, r.file), ...splitArgs(g.launchOptions)] };
      }
      return null;
    }
  }
}

export function playGame(key: string, source?: GameSource): LaunchResult {
  const g = findGame(key);
  if (!g) return { ok: false, error: 'That game isn’t in your library any more.' };
  const copy = pickCopy(g, source);
  if (!copy || !copy.installed) return { ok: false, error: 'It isn’t installed. Use Install first.' };
  const t = launchTarget(g, copy);
  if (!t) {
    if (isEmulator(copy.source)) {
      const name = EMULATORS.find((e) => e.id === copy.source)?.name;
      return { ok: false, error: `Show ShotCaller where ${name} is: Games › More › ${name} › Pick program.` };
    }
    return { ok: false, error: 'ShotCaller can’t start this one. Start it from its own launcher.' };
  }
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
    case 'anker': {
      const exe = ankerLauncherExe();
      if (!exe) return { ok: false, error: 'Uninstall it from the Anker launcher.' };
      startProgram(exe);
      return { ok: true };
    }
    default:
      if (isExtra(copy.source)) {
        // The store does the uninstall; ShotCaller opens it.
        const r = openStoreApp(copy.source);
        return r.ok ? r : { ok: false, error: 'Uninstall it from its own launcher.' };
      }
      if (isEmulator(copy.source)) {
        removeGame(copy.key);
        return { ok: true };
      }
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
  else if (copy.source === 'anker') {
    const exe = ankerLauncherExe();
    if (!exe) return { ok: false, error: 'The Anker launcher isn’t installed.' };
    startProgram(exe);
  } else if (isExtra(copy.source)) return openStoreApp(copy.source);
  else if (isEmulator(copy.source)) {
    const exe = storeRecords().emulatorExe(copy.source);
    if (!exe) return { ok: false, error: 'Pick the emulator’s program first (Games › More).' };
    startProgram(exe);
  } else return { ok: false, error: 'This game has no store page.' };
  return { ok: true };
}

/** Opens one of the smaller stores' own app. */
function openStoreApp(store: ExtraStoreId): LaunchResult {
  const t = storeRecords().extra[store]?.openTarget;
  if (t?.exe && fs.existsSync(t.exe)) startProgram(t.exe);
  else if (t?.target) void shell.openExternal(t.target);
  else return { ok: false, error: 'That store’s app wasn’t found.' };
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
    if (t.target && /^[a-z]:\\/i.test(t.target)) {
      fs.copyFileSync(t.target, path.join(desktop, `${name}.url`));
      return { ok: true };
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
