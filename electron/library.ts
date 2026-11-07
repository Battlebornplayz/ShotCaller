import { app, dialog, type BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { games, moduleForSteamApp } from '../games';
import type { Library, LibraryGame, SteamImportInfo } from '../shared/types';
import { findSteamPath, readInstalledApps, readLibraryFolders, type SteamApp } from './steam';

/**
 * The user's games: supported modules, the Steam library import and games added by hand.
 * Persisted to library.json in userData so the list is ready before the Steam scan finishes.
 */

interface Stored {
  manual: LibraryGame[];
  pinned: string[];
  steamApps: SteamApp[];
  steam: SteamImportInfo;
}

let store: Stored | null = null;
const listeners = new Set<(lib: Library) => void>();

function file(): string {
  return path.join(app.getPath('userData'), 'library.json');
}

function load(): Stored {
  if (store) return store;
  const empty: Stored = { manual: [], pinned: [], steamApps: [], steam: { found: false, libraryFolders: [] } };
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8')) as Partial<Stored>;
    store = {
      manual: Array.isArray(raw.manual) ? raw.manual.filter(isManualGame) : [],
      pinned: Array.isArray(raw.pinned) ? raw.pinned.filter((k): k is string => typeof k === 'string') : [],
      steamApps: Array.isArray(raw.steamApps) ? raw.steamApps.filter((a) => a && typeof a.appId === 'number') : [],
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
      installDir: a.installDir,
      exeNames: mod?.exeNames ?? [],
      moduleId: mod?.id,
      installed: a.installed,
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
      exeNames: mod.exeNames,
      moduleId: mod.id,
      installed: false,
    });
  }

  list.push(...s.manual.map((g) => ({ ...g, installed: fs.existsSync(g.exePath ?? '') })));

  for (const g of list) g.pinned = pinned.has(g.key);
  const rank = (g: LibraryGame) => (g.moduleId ? 0 : g.pinned ? 1 : 2);
  list.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  return { games: list, steam: s.steam };
}

/** Re-reads the local Steam library. Safe to call any time; it only reads Steam's files. */
export async function importSteamLibrary(): Promise<Library> {
  const s = load();
  try {
    const steamPath = await findSteamPath();
    if (!steamPath) {
      s.steam = { found: false, libraryFolders: [], importedAt: new Date().toISOString() };
    } else {
      const folders = readLibraryFolders(steamPath);
      s.steamApps = readInstalledApps(folders);
      s.steam = { found: true, steamPath, libraryFolders: folders, importedAt: new Date().toISOString() };
    }
  } catch (err) {
    s.steam = { ...s.steam, error: err instanceof Error ? err.message : String(err) };
  }
  save();
  emit();
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

/** Removes a hand-added game (Steam and module games can only be unpinned). */
export function removeGame(key: string): Library {
  const s = load();
  s.manual = s.manual.filter((g) => g.key !== key);
  s.pinned = s.pinned.filter((k) => k !== key);
  save();
  emit();
  return getLibrary();
}
