import { app, dialog, type BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { games, moduleForSteamApp } from '../games';
import type { Library, LibraryGame, SteamImportInfo } from '../shared/types';
import { readAnkerLibrary, type AnkerGame } from './anker';
import { scanEmulatorApps } from './emulators';
import { findSteamPath, readInstalledApps, readLibraryFolders, type SteamApp } from './steam';
import { listSchemaAppIds, readSteamUser } from './steamLocal';
import { cachedAppName, fetchAppName } from './steamPublic';

/**
 * The user's games: supported modules, the Steam library import (installed games plus games
 * Steam has achievement data for), the Anker Games launcher, emulator achievement folders and
 * games added by hand. Persisted to library.json in userData so the list is ready before scans finish.
 */

interface Stored {
  manual: LibraryGame[];
  pinned: string[];
  steamApps: SteamApp[];
  /** Steam apps with a cached achievement schema that aren't installed (played before). */
  steamPlayed: number[];
  anker: AnkerGame[];
  /** App ids with local emulator achievement files. */
  emulatorApps: number[];
  /** Game key → Steam app id whose achievement list it uses (games added by hand). */
  links: Record<string, number>;
  steam: SteamImportInfo;
}

let store: Stored | null = null;
const listeners = new Set<(lib: Library) => void>();

function file(): string {
  return path.join(app.getPath('userData'), 'library.json');
}

const ids = (v: unknown): number[] => (Array.isArray(v) ? v.filter((n): n is number => Number.isInteger(n) && n > 0) : []);

function load(): Stored {
  if (store) return store;
  const empty: Stored = { manual: [], pinned: [], steamApps: [], steamPlayed: [], anker: [], emulatorApps: [], links: {}, steam: { found: false, libraryFolders: [] } };
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8')) as Partial<Stored>;
    const links: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw.links ?? {})) if (typeof k === 'string' && Number.isInteger(v) && v > 0) links[k] = v;
    store = {
      manual: Array.isArray(raw.manual) ? raw.manual.filter(isManualGame) : [],
      pinned: Array.isArray(raw.pinned) ? raw.pinned.filter((k): k is string => typeof k === 'string') : [],
      steamApps: Array.isArray(raw.steamApps) ? raw.steamApps.filter((a) => a && typeof a.appId === 'number') : [],
      steamPlayed: ids(raw.steamPlayed),
      anker: Array.isArray(raw.anker) ? raw.anker.filter((g) => g && typeof g.id === 'string' && typeof g.title === 'string') : [],
      emulatorApps: ids(raw.emulatorApps),
      links,
      steam: raw.steam && typeof raw.steam === 'object' ? { ...empty.steam, ...raw.steam } : empty.steam,
    };
  } catch {
    store = empty;
  }
  return store;
}

function isManualGame(g: unknown): g is LibraryGame {
  const v = g as LibraryGame;
  return !!v && typeof v.key === 'string' && v.key.startsWith('manual:') && typeof v.name === 'string' && typeof v.exePath === 'string';
}

function save(): void {
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(load(), null, 2), 'utf8');
  } catch (err) {
    console.error('Could not save library:', err);
  }
}

function emit(): void {
  const lib = getLibrary();
  for (const fn of listeners) fn(lib);
}

export function onLibraryChange(fn: (lib: Library) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const appName = (appId: number) => cachedAppName(appId) ?? `Steam app ${appId}`;

/** Merged view: modules first, then pinned, then everything else by name. */
export function getLibrary(): Library {
  const s = load();
  const pinned = new Set(s.pinned);
  const list: LibraryGame[] = [];
  const steamIds = new Set<number>();

  for (const a of s.steamApps) {
    steamIds.add(a.appId);
    const mod = moduleForSteamApp(a.appId);
    list.push({
      key: `steam:${a.appId}`,
      name: a.name,
      source: 'steam',
      steamAppId: a.appId,
      achievementAppId: a.appId,
      installDir: a.installDir,
      exeNames: mod?.exeNames ?? [],
      moduleId: mod?.id,
      installed: a.installed,
    });
  }

  for (const appId of s.steamPlayed) {
    if (steamIds.has(appId)) continue;
    steamIds.add(appId);
    const mod = moduleForSteamApp(appId);
    list.push({
      key: `steam:${appId}`,
      name: mod?.name ?? appName(appId),
      source: 'steam',
      steamAppId: appId,
      achievementAppId: appId,
      exeNames: mod?.exeNames ?? [],
      moduleId: mod?.id,
      installed: false,
    });
  }

  // Supported games that Steam doesn't list here are still detected by exe name.
  for (const mod of games) {
    if (mod.steamAppId && steamIds.has(mod.steamAppId)) continue;
    list.push({
      key: `module:${mod.id}`,
      name: mod.name,
      source: 'module',
      steamAppId: mod.steamAppId,
      achievementAppId: mod.steamAppId,
      exeNames: mod.exeNames,
      moduleId: mod.id,
      installed: false,
    });
  }

  const nonSteamApps = new Set<number>();
  for (const g of s.anker) {
    if (g.steamAppId) nonSteamApps.add(g.steamAppId);
    list.push({
      key: `anker:${g.id}`,
      name: g.title,
      source: 'anker',
      installDir: g.installDir,
      exePath: g.exePath,
      exeNames: g.exePath ? [path.basename(g.exePath)] : [],
      achievementAppId: s.links[`anker:${g.id}`] ?? g.steamAppId,
      poster: g.poster,
      installed: true,
    });
  }

  for (const m of s.manual) {
    const linked = s.links[m.key];
    if (linked) nonSteamApps.add(linked);
    list.push({ ...m, achievementAppId: linked, installed: fs.existsSync(m.exePath ?? '') });
  }

  // Emulator saves for games not otherwise in the library (e.g. installed outside a launcher).
  for (const appId of s.emulatorApps) {
    if (steamIds.has(appId) || nonSteamApps.has(appId)) continue;
    list.push({
      key: `emu:${appId}`,
      name: appName(appId),
      source: 'emulator',
      achievementAppId: appId,
      exeNames: [],
      installed: false,
    });
  }

  for (const g of list) g.pinned = pinned.has(g.key);
  const rank = (g: LibraryGame) => (g.moduleId ? 0 : g.pinned ? 1 : 2);
  list.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  return { games: list, steam: s.steam };
}

/** Fetches store names for apps known only by id, then refreshes the library. */
async function fillNames(appIds: number[]): Promise<void> {
  const missing = appIds.filter((id) => !cachedAppName(id) && !moduleForSteamApp(id));
  if (!missing.length) return;
  for (const id of missing) await fetchAppName(id); // sequential: the store endpoint rate-limits
  emit();
}

/** Re-reads every local source. Safe to call any time; it only reads files. */
export async function importSteamLibrary(): Promise<Library> {
  const s = load();
  try {
    const steamPath = await findSteamPath();
    if (!steamPath) {
      s.steam = { found: false, libraryFolders: [], importedAt: new Date().toISOString() };
      s.steamPlayed = [];
    } else {
      const folders = readLibraryFolders(steamPath);
      s.steamApps = readInstalledApps(folders);
      const installed = new Set(s.steamApps.map((a) => a.appId));
      // Only games the signed-in user has stats for (the schema cache also holds other accounts' games).
      const user = readSteamUser(steamPath);
      const statsFiles = new Set(
        user
          ? (() => {
              try {
                return fs.readdirSync(path.join(steamPath, 'appcache', 'stats'));
              } catch {
                return [];
              }
            })()
          : [],
      );
      s.steamPlayed = listSchemaAppIds(steamPath).filter(
        (id) => !installed.has(id) && user && statsFiles.has(`UserGameStats_${user.accountId}_${id}.bin`),
      );
      s.steam = { found: true, steamPath, libraryFolders: folders, importedAt: new Date().toISOString() };
    }
  } catch (err) {
    s.steam = { ...s.steam, error: err instanceof Error ? err.message : String(err) };
  }
  try {
    s.anker = readAnkerLibrary();
  } catch (err) {
    console.error('Anker import failed:', err);
  }
  s.emulatorApps = [...scanEmulatorApps().keys()];
  save();
  emit();
  void fillNames([...s.steamPlayed, ...s.emulatorApps]);
  return getLibrary();
}

export async function addGameManually(parent: BrowserWindow | null): Promise<LibraryGame | null> {
  const filters =
    process.platform === 'win32'
      ? [{ name: 'Games', extensions: ['exe'] }]
      : [{ name: 'All files', extensions: ['*'] }];
  const opts = { title: 'Choose the game’s executable', properties: ['openFile' as const], filters };
  const result = parent ? await dialog.showOpenDialog(parent, opts) : await dialog.showOpenDialog(opts);
  if (result.canceled || result.filePaths.length === 0) return null;

  const exePath = result.filePaths[0];
  const s = load();
  const existing = s.manual.find((g) => g.exePath?.toLowerCase() === exePath.toLowerCase());
  if (existing) return existing;

  const base = path.basename(exePath);
  const name = base
    .replace(/\.(exe|x86_64|x86|sh|AppImage)$/i, '')
    .replace(/[-_.]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
  const game: LibraryGame = {
    key: `manual:${randomUUID()}`,
    name: name || base,
    source: 'manual',
    exePath,
    installDir: path.dirname(exePath),
    exeNames: [base],
    installed: true,
  };
  s.manual.push(game);
  s.pinned.push(game.key); // hand-added games show in the rail
  save();
  emit();
  return game;
}

export function setPinned(key: string, pinned: boolean): Library {
  const s = load();
  s.pinned = s.pinned.filter((k) => k !== key);
  if (pinned) s.pinned.push(key);
  save();
  emit();
  return getLibrary();
}

/** Links a non-Steam game to a Steam app's achievement list (null unlinks). */
export function setSteamLink(key: string, appId: number | null): boolean {
  const s = load();
  const game = getLibrary().games.find((g) => g.key === key);
  if (!game || game.source === 'steam' || game.source === 'module' || game.source === 'emulator') return false;
  if (appId === null) delete s.links[key];
  else s.links[key] = appId;
  save();
  emit();
  return true;
}

/** Removes a hand-added game (Steam and module games can only be unpinned). */
export function removeGame(key: string): Library {
  const s = load();
  s.manual = s.manual.filter((g) => g.key !== key);
  s.pinned = s.pinned.filter((k) => k !== key);
  delete s.links[key];
  save();
  emit();
  return getLibrary();
}
