import { app, dialog, shell, type BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { games, moduleForSteamApp } from '../games';
import type {
  EmulatorId,
  EmulatorOp,
  ExtraStoreId,
  GameCollection,
  GameSource,
  Library,
  LibraryGame,
  MoreSource,
  SteamImportInfo,
  StoreId,
  StoreStatus,
} from '../shared/types';
import { ankerFound, ankerLauncherExe, ankerLibraryFile, readAnkerLibrary, type AnkerGame } from './anker';
import { scanEmulatorApps } from './emulators';
import { getSessions } from './sessions';
import { findSteamPath, readInstalledApps, readLibraryFolders, type SteamApp } from './steam';
import { listSchemaAppIds, readPlaytime, readSteamUser } from './steamLocal';
import {
  cachedAppName,
  cachedGenres,
  cachedNameMatch,
  fetchAppName,
  fetchGenres,
  fetchOwnedGames,
  matchSteamByName,
  normName,
  SOFTWARE_GENRES,
  type OwnedGame,
} from './steamPublic';
import { defaultEpicDataDir, epicFound, epicWatchDir, readEpicGames, type EpicGame } from './stores/epic';
import { cachedGridArt, fetchGridArt, hasSteamGridKey } from './stores/steamGrid';
import { fileToDataUrl, readXboxGames, xboxGamingRoots, type XboxGame } from './stores/xbox';
import { readAmazon } from './stores/amazon';
import { readBattleNet } from './stores/battlenet';
import { readEa } from './stores/ea';
import type { ExtraGame, ExtraStoreResult } from './stores/extra';
import { readGog } from './stores/gog';
import { readItch } from './stores/itch';
import { readRegistry, type RegistrySnapshot } from './stores/registry';
import { readRiot } from './stores/riot';
import { readRockstar } from './stores/rockstar';
import { defaultFolders, EMULATORS, emulatorForFile, findEmulatorExe, scanRoms, type EmulatorConfig, type RomGame } from './stores/roms';
import { readUbisoft } from './stores/ubisoft';

/** The smaller stores of the More section, in the order they're listed. */
export const EXTRA_STORES: { id: ExtraStoreId; name: string }[] = [
  { id: 'gog', name: 'GOG' },
  { id: 'ea', name: 'EA app' },
  { id: 'ubisoft', name: 'Ubisoft Connect' },
  { id: 'battlenet', name: 'Battle.net' },
  { id: 'riot', name: 'Riot Games' },
  { id: 'rockstar', name: 'Rockstar Games' },
  { id: 'amazon', name: 'Amazon Games' },
  { id: 'itch', name: 'itch.io' },
];

/**
 * The user's games, from every source: supported modules, Steam (installed, played, and owned
 * from the public profile), Epic Games and Xbox / Microsoft Store (Phase L1), the Anker Games
 * launcher, emulator achievement folders and games added by hand. A game found on several stores
 * becomes one card. Persisted to library.json in userData so the list is ready before scans finish.
 * Every source is read-only: ShotCaller never changes other launchers' files.
 */

interface Stored {
  manual: LibraryGame[];
  /** Favourites (also shown in the game rail). */
  pinned: string[];
  steamApps: SteamApp[];
  /** Steam apps with a cached achievement schema that aren't installed (played before). */
  steamPlayed: number[];
  /** Everything the Steam account owns (public profile only); null when private or unknown. */
  steamOwned: OwnedGame[] | null;
  /** App id → playtime from Steam's local config. */
  steamPlaytime: Record<string, { minutes: number; lastPlayed: number | null }>;
  anker: AnkerGame[];
  epic: EpicGame[];
  xbox: XboxGame[];
  /** The smaller stores (Phase L2), as last read. */
  extra: Partial<Record<ExtraStoreId, ExtraStoreResult>>;
  /** Emulator settings: program and game folders. */
  emulators: Partial<Record<EmulatorId, EmulatorConfig>>;
  /** Emulator programs found on their own (when not picked). */
  emulatorFound: Partial<Record<EmulatorId, string>>;
  roms: RomGame[];
  /** App ids with local emulator achievement files. */
  emulatorApps: number[];
  /** Game key → Steam app id whose achievement list it uses (games added by hand). */
  links: Record<string, number>;
  steam: SteamImportInfo;
  hidden: string[];
  collections: GameCollection[];
  /** Your own genre edits per game. */
  genreEdits: Record<string, string[]>;
  /** Your own "this is a tool / a game" choice per game. */
  toolEdits: Record<string, boolean>;
  launchOptions: Record<string, string>;
  /** Game key → epoch ms first found (0 = before the Games tab existed). */
  firstSeen: Record<string, number>;
  /** Game key → epoch ms last started from ShotCaller. */
  launched: Record<string, number>;
  /** Folders the user picked for a store. */
  storePaths: Partial<Record<StoreId, string>>;
  scannedAt?: string;
}

let store: Stored | null = null;
let justAdded: Library['justAdded'];
const listeners = new Set<(lib: Library) => void>();

function file(): string {
  return path.join(app.getPath('userData'), 'library.json');
}

const ids = (v: unknown): number[] => (Array.isArray(v) ? v.filter((n): n is number => Number.isInteger(n) && n > 0) : []);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : []);
const obj = <T>(v: unknown): Record<string, T> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, T>) : {});

function load(): Stored {
  if (store) return store;
  const empty: Stored = {
    manual: [],
    pinned: [],
    steamApps: [],
    steamPlayed: [],
    steamOwned: null,
    steamPlaytime: {},
    anker: [],
    epic: [],
    xbox: [],
    extra: {},
    emulators: {},
    emulatorFound: {},
    roms: [],
    emulatorApps: [],
    links: {},
    steam: { found: false, libraryFolders: [] },
    hidden: [],
    collections: [],
    genreEdits: {},
    toolEdits: {},
    launchOptions: {},
    firstSeen: {},
    launched: {},
    storePaths: {},
  };
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8')) as Partial<Stored>;
    const links: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw.links ?? {})) if (typeof k === 'string' && Number.isInteger(v) && v > 0) links[k] = v;
    store = {
      ...empty,
      manual: Array.isArray(raw.manual) ? raw.manual.filter(isManualGame) : [],
      pinned: strs(raw.pinned),
      steamApps: Array.isArray(raw.steamApps) ? raw.steamApps.filter((a) => a && typeof a.appId === 'number') : [],
      steamPlayed: ids(raw.steamPlayed),
      steamOwned: Array.isArray(raw.steamOwned) ? raw.steamOwned.filter((g) => g && typeof g.appId === 'number') : null,
      steamPlaytime: obj(raw.steamPlaytime),
      anker: Array.isArray(raw.anker) ? raw.anker.filter((g) => g && typeof g.id === 'string' && typeof g.title === 'string') : [],
      epic: Array.isArray(raw.epic) ? raw.epic.filter((g) => g && typeof g.appName === 'string') : [],
      xbox: Array.isArray(raw.xbox) ? raw.xbox.filter((g) => g && typeof g.pfn === 'string') : [],
      extra: obj<ExtraStoreResult>(raw.extra),
      emulators: obj<EmulatorConfig>(raw.emulators),
      emulatorFound: obj<string>(raw.emulatorFound),
      roms: Array.isArray(raw.roms) ? raw.roms.filter((r) => r && typeof r.key === 'string' && typeof r.file === 'string') : [],
      emulatorApps: ids(raw.emulatorApps),
      links,
      steam: raw.steam && typeof raw.steam === 'object' ? { ...empty.steam, ...raw.steam } : empty.steam,
      hidden: strs(raw.hidden),
      collections: Array.isArray(raw.collections)
        ? raw.collections.filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string').map((c) => ({ ...c, keys: strs(c.keys) }))
        : [],
      genreEdits: obj(raw.genreEdits),
      toolEdits: obj(raw.toolEdits),
      launchOptions: obj(raw.launchOptions),
      firstSeen: obj(raw.firstSeen),
      launched: obj(raw.launched),
      storePaths: obj(raw.storePaths),
      scannedAt: typeof raw.scannedAt === 'string' ? raw.scannedAt : undefined,
    };
  } catch {
    store = empty;
  }
  return store;
}

const extraKey = (g: ExtraGame) => `${g.store}:${g.id}`;

function isManualGame(g: unknown): g is LibraryGame {
  const v = g as LibraryGame;
  return !!v && typeof v.key === 'string' && v.key.startsWith('manual:') && typeof v.name === 'string' && typeof v.exePath === 'string';
}

function save(): void {
  built = null;
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(load(), null, 2), 'utf8');
  } catch (err) {
    console.error('Could not save library:', err);
  }
}

function emit(): void {
  built = null;
  const lib = getLibrary();
  for (const fn of listeners) fn(lib);
}

export function onLibraryChange(fn: (lib: Library) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const appName = (appId: number) => cachedAppName(appId) ?? `Steam app ${appId}`;

// ---------- Building the merged list ----------

/** Xbox art read from the package (data URLs), kept in memory between builds. */
const xboxArt = new Map<string, { icon?: string; banner?: string }>();
function artForXbox(g: XboxGame): { icon?: string; banner?: string } {
  let a = xboxArt.get(g.pfn);
  if (!a) {
    a = { icon: fileToDataUrl(g.logoFile, 400_000), banner: fileToDataUrl(g.splashFile, 900_000) };
    xboxArt.set(g.pfn, a);
  }
  return a;
}

/** Built list, rebuilt when something changes (and at most every 15 s for playtime). */
let built: { at: number; lib: Library } | null = null;
const BUILD_TTL = 15_000;

/** Merged view: modules first, then favourites, then everything else by name. */
export function getLibrary(): Library {
  if (built && Date.now() - built.at < BUILD_TTL) return built.lib;
  const lib = build();
  built = { at: Date.now(), lib };
  return lib;
}

function build(): Library {
  const s = load();
  const list: LibraryGame[] = [];
  const steamIds = new Set<number>();
  const owned = new Map((s.steamOwned ?? []).map((g) => [g.appId, g]));

  const steamGame = (appId: number, name: string, extra: Partial<LibraryGame>): LibraryGame => {
    const mod = moduleForSteamApp(appId);
    return {
      key: `steam:${appId}`,
      name,
      source: 'steam',
      steamAppId: appId,
      achievementAppId: appId,
      exeNames: mod?.exeNames ?? [],
      moduleId: mod?.id,
      installed: false,
      ...extra,
    };
  };

  for (const a of s.steamApps) {
    steamIds.add(a.appId);
    list.push(
      steamGame(a.appId, a.name, {
        installDir: a.installDir,
        installed: a.installed,
        sizeBytes: a.sizeBytes,
        updateAvailable: a.updateAvailable,
        isTool: a.isTool,
      }),
    );
  }

  for (const appId of s.steamPlayed) {
    if (steamIds.has(appId)) continue;
    steamIds.add(appId);
    list.push(steamGame(appId, moduleForSteamApp(appId)?.name ?? owned.get(appId)?.name ?? appName(appId), {}));
  }

  for (const g of owned.values()) {
    if (steamIds.has(g.appId)) continue;
    steamIds.add(g.appId);
    list.push(steamGame(g.appId, g.name, { owned: true }));
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

  for (const g of list) g.copies = [{ source: g.source, key: g.key, installed: g.installed }];

  // Epic and Xbox games join the card of the same game from Steam or a module (one card per game).
  const byName = new Map<string, LibraryGame>();
  for (const g of list) {
    const n = normName(g.name);
    if (n && (!byName.has(n) || g.installed)) byName.set(n, g);
  }
  const addStoreGame = (g: LibraryGame) => {
    const n = normName(g.name);
    const target = n ? byName.get(n) : undefined;
    if (!target) {
      g.copies = [{ source: g.source, key: g.key, installed: g.installed }];
      // Borrow the Steam version's achievement list and art when the same game is on Steam.
      const match = cachedNameMatch(g.name);
      if (match) g.achievementAppId = match;
      list.push(g);
      if (n) byName.set(n, g);
      return;
    }
    target.copies!.push({ source: g.source, key: g.key, installed: g.installed });
    target.exeNames = [...new Set([...target.exeNames, ...g.exeNames])];
    const dirs = [g.installDir, ...(g.extraDirs ?? [])].filter((d): d is string => !!d);
    if (g.installed && !target.installed) {
      if (target.installDir) dirs.push(target.installDir);
      target.installDir = g.installDir;
      target.installed = true;
      target.owned = false;
    }
    target.extraDirs = [...new Set([...(target.extraDirs ?? []), ...dirs])].filter((d) => d !== target.installDir);
    target.sizeBytes ??= g.sizeBytes;
    target.cover ??= g.cover;
    target.banner ??= g.banner;
    target.icon ??= g.icon;
    if (g.isTool) target.isTool ??= true;
  };

  for (const e of s.epic) {
    addStoreGame({
      key: `epic:${e.appName}`,
      name: e.name,
      source: 'epic',
      installDir: e.installDir,
      exePath: e.exePath,
      exeNames: [],
      installed: true,
      sizeBytes: e.sizeBytes,
      isTool: e.isTool || undefined,
      cover: e.cover,
      banner: e.banner,
    });
  }

  for (const x of s.xbox) {
    const art = artForXbox(x);
    addStoreGame({
      key: `xbox:${x.pfn}`,
      name: x.name,
      source: 'xbox',
      installDir: x.contentDir ?? x.installDir,
      extraDirs: x.contentDir ? [x.installDir] : undefined,
      exeNames: x.exeNames,
      installed: true,
      icon: art.icon,
      banner: art.banner,
    });
  }

  for (const { id } of EXTRA_STORES) {
    for (const e of s.extra[id]?.games ?? []) {
      addStoreGame({
        key: extraKey(e),
        name: e.name,
        source: e.store,
        installDir: e.installDir,
        exeNames: e.exeNames,
        installed: true,
        sizeBytes: e.sizeBytes,
        cover: e.cover,
      });
    }
  }

  const nonSteamApps = new Set<number>();
  /** Playtime the Anker launcher recorded, per card key. */
  const ankerPlay = new Map<string, AnkerGame>();
  for (const g of s.anker) {
    if (g.steamAppId) nonSteamApps.add(g.steamAppId);
    const key = `anker:${g.id}`;
    ankerPlay.set(key, g);
    list.push({
      key,
      name: g.title,
      source: 'anker',
      installDir: g.installDir,
      exePath: g.exePath,
      exeNames: g.exePath ? [path.basename(g.exePath)] : [],
      // Achievements: a list you linked, else the Steam app Anker names, else a Steam game with the same name.
      achievementAppId: s.links[key] ?? g.steamAppId ?? cachedNameMatch(g.title) ?? undefined,
      poster: g.poster,
      installed: true,
      copies: [{ source: 'anker', key, installed: true }],
    });
  }

  // Emulator games: each file in your game folders is a card that opens in its emulator.
  for (const r of s.roms) {
    const installed = fs.existsSync(r.file);
    list.push({
      key: r.key,
      name: r.name,
      source: r.emu,
      installDir: r.installDir,
      romPath: r.file,
      exeNames: [],
      installed,
      sizeBytes: r.sizeBytes,
      copies: [{ source: r.emu, key: r.key, installed }],
    });
  }

  for (const m of s.manual) {
    const linked = s.links[m.key];
    if (linked) nonSteamApps.add(linked);
    const installed = fs.existsSync(m.exePath ?? '');
    list.push({ ...m, achievementAppId: linked, installed, copies: [{ source: 'manual', key: m.key, installed }] });
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
      copies: [{ source: 'emulator', key: `emu:${appId}`, installed: false }],
    });
  }

  // Your own choices, playtime, art and genres.
  const pinned = new Set(s.pinned);
  const hidden = new Set(s.hidden);
  const gridOn = hasSteamGridKey();
  for (const g of list) {
    g.pinned = pinned.has(g.key);
    g.hidden = hidden.has(g.key) || undefined;
    g.addedAt = s.firstSeen[g.key];
    g.launchOptions = s.launchOptions[g.key] || undefined;

    const steamPt = g.steamAppId ? s.steamPlaytime[g.steamAppId] : undefined;
    const sessions = getSessions(g.key);
    const tracked = Math.round(sessions.reduce((n, x) => n + (x.end - x.start), 0) / 60000);
    const anker = ankerPlay.get(g.key);
    const storeMinutes = steamPt?.minutes ?? (g.steamAppId ? owned.get(g.steamAppId)?.minutes : undefined) ?? anker?.playMinutes;
    g.playMinutes = Math.max(storeMinutes ?? 0, tracked) || undefined;
    const last = Math.max(steamPt?.lastPlayed ?? 0, sessions[0]?.end ?? 0, s.launched[g.key] ?? 0, anker?.lastPlayed ?? 0);
    g.lastPlayed = last || undefined;

    const genreApp = g.steamAppId ?? g.achievementAppId;
    g.genres = s.genreEdits[g.key] ?? (genreApp ? cachedGenres(genreApp) : undefined);
    const softwareOnly = !!g.genres?.length && g.genres.every((x) => SOFTWARE_GENRES.has(x));
    const tool = s.toolEdits[g.key] ?? (g.isTool || softwareOnly);
    g.isTool = tool || undefined;

    if (gridOn && !g.steamAppId && !g.achievementAppId) {
      const art = cachedGridArt(g.name);
      if (art) {
        g.cover ??= art.cover;
        g.banner ??= art.banner;
      }
    }
  }

  const rank = (g: LibraryGame) => (g.moduleId ? 0 : g.pinned ? 1 : 2);
  list.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  return { games: list, steam: s.steam, stores: storeStatus(s, list), more: moreStatus(s, list), collections: s.collections, scannedAt: s.scannedAt, justAdded };
}

/** The More section: Anker, the smaller stores, the emulators and games added by hand. */
function moreStatus(s: Stored, list: LibraryGame[]): MoreSource[] {
  const count = (source: GameSource) => list.filter((g) => !g.isTool && !g.hidden && g.copies?.some((c) => c.source === source)).length;
  const anker = ankerLauncherExe();
  const out: MoreSource[] = [
    {
      id: 'anker',
      name: 'Anker Games',
      kind: 'launcher',
      found: ankerFound(),
      path: anker ? path.dirname(anker) : undefined,
      count: count('anker'),
      note: 'Games start from their own file. Achievements use the Steam version’s list.',
    },
  ];
  for (const { id, name } of EXTRA_STORES) {
    const r = s.extra[id];
    out.push({ id, name, kind: 'store', found: !!r?.found, path: r?.path, count: count(id), note: r?.note });
  }
  for (const e of EMULATORS) {
    const exe = emulatorExe(s, e.id);
    out.push({
      id: e.id,
      name: e.name,
      kind: 'emulator',
      found: !!exe,
      path: exe,
      count: count(e.id),
      folders: emulatorFolders(s, e.id),
      note: `${e.console} · ${e.exts.filter((x) => x !== '.pkg').join(' ')}${s.emulators[e.id]?.exe ? ' · program you picked' : ''}`,
    });
  }
  out.push({ id: 'manual', name: 'Added by you', kind: 'other', found: true, count: count('manual') });
  return out;
}

function emulatorExe(s: Stored, emu: EmulatorId): string | undefined {
  const picked = s.emulators[emu]?.exe;
  if (picked && fs.existsSync(picked)) return picked;
  return s.emulatorFound[emu];
}

function emulatorFolders(s: Stored, emu: EmulatorId): string[] {
  return s.emulators[emu]?.folders ?? defaultFolders(emu, emulatorExe(s, emu));
}

function scanAllRoms(s: Stored): void {
  s.roms = EMULATORS.flatMap((e) => scanRoms(e.id, emulatorFolders(s, e.id), s.emulators[e.id]?.files ?? []));
}

function storeStatus(s: Stored, list: LibraryGame[]): StoreStatus[] {
  const count = (source: string) => list.filter((g) => !g.isTool && g.copies?.some((c) => c.source === source && c.installed)).length;
  const epicDir = s.storePaths.epic ?? defaultEpicDataDir();
  const roots = xboxGamingRoots();
  const ownedNote =
    s.steamOwned === null
      ? s.steam.found
        ? `Showing installed games and ${s.steamPlayed.length} you’ve played. Steam only shares the full owned list after signing in (coming later as an option).`
        : undefined
      : `Owned games: ${s.steamOwned.length} from your public Steam profile.`;
  return [
    { id: 'steam', name: 'Steam', found: s.steam.found, path: s.steam.steamPath, custom: !!s.storePaths.steam, count: count('steam'), note: ownedNote, canPick: true },
    { id: 'epic', name: 'Epic Games', found: epicFound(epicDir), path: epicDir, custom: !!s.storePaths.epic, count: count('epic'), canPick: true },
    {
      id: 'xbox',
      name: 'Xbox / Microsoft Store',
      found: s.xbox.length > 0 || roots.length > 0,
      path: roots.join(', ') || undefined,
      custom: false,
      count: count('xbox'),
      note: 'Found through Windows’ app list; nothing to pick.',
      canPick: false,
    },
  ];
}

// ---------- Scanning ----------

let scanning: Promise<Library> | null = null;

/** Re-reads every local source. Safe to call any time; it only reads files. */
export function importSteamLibrary(): Promise<Library> {
  scanning ??= scan().finally(() => (scanning = null));
  return scanning;
}

async function scan(): Promise<Library> {
  const s = load();
  const before = new Set(build().games.map((g) => g.key));
  const firstScan = !s.scannedAt;

  try {
    const steamPath = s.storePaths.steam && fs.existsSync(path.join(s.storePaths.steam, 'steamapps')) ? s.storePaths.steam : await findSteamPath();
    if (!steamPath) {
      s.steam = { found: false, libraryFolders: [], importedAt: new Date().toISOString() };
      s.steamPlayed = [];
    } else {
      const folders = readLibraryFolders(steamPath);
      s.steamApps = readInstalledApps(folders);
      const installed = new Set(s.steamApps.map((a) => a.appId));
      // Only games the signed-in user has stats for (the schema cache also holds other accounts' games).
      const user = readSteamUser(steamPath);
      let statsFiles = new Set<string>();
      if (user) {
        try {
          statsFiles = new Set(fs.readdirSync(path.join(steamPath, 'appcache', 'stats')));
        } catch {
          // none
        }
      }
      s.steamPlayed = listSchemaAppIds(steamPath).filter(
        (id) => !installed.has(id) && user && statsFiles.has(`UserGameStats_${user.accountId}_${id}.bin`),
      );
      s.steamPlaytime = {};
      if (user) for (const [id, pt] of readPlaytime(steamPath, user.accountId)) s.steamPlaytime[id] = pt;
      steamUserId = user?.steamId ?? null;
      if (!user) s.steamOwned = null;
      s.steam = { found: true, steamPath, libraryFolders: folders, importedAt: new Date().toISOString() };
    }
  } catch (err) {
    s.steam = { ...s.steam, error: err instanceof Error ? err.message : String(err) };
  }
  try {
    s.epic = readEpicGames(s.storePaths.epic ?? defaultEpicDataDir());
  } catch (err) {
    console.error('Epic scan failed:', err);
  }
  try {
    s.xbox = await readXboxGames();
    for (const pfn of [...xboxArt.keys()]) if (!s.xbox.some((x) => x.pfn === pfn)) xboxArt.delete(pfn);
  } catch (err) {
    console.error('Xbox scan failed:', err);
  }
  try {
    s.anker = readAnkerLibrary();
  } catch (err) {
    console.error('Anker import failed:', err);
  }
  let reg: RegistrySnapshot | null = null;
  try {
    const snap = await readRegistry();
    reg = snap;
    const readers: Record<ExtraStoreId, () => ExtraStoreResult> = {
      gog: () => readGog(snap),
      ea: () => readEa(snap),
      ubisoft: () => readUbisoft(snap),
      battlenet: () => readBattleNet(snap),
      riot: () => readRiot(),
      rockstar: () => readRockstar(snap),
      amazon: () => readAmazon(),
      itch: () => readItch(),
    };
    for (const { id } of EXTRA_STORES) {
      try {
        s.extra[id] = readers[id]();
      } catch (err) {
        console.error(`${id} scan failed:`, err);
      }
    }
  } catch (err) {
    console.error('Store scan failed:', err);
  }
  for (const e of EMULATORS) {
    const found = findEmulatorExe(e.id, reg);
    if (found) s.emulatorFound[e.id] = found;
    else delete s.emulatorFound[e.id];
  }
  scanAllRoms(s);
  s.emulatorApps = [...scanEmulatorApps().keys()];

  // New games since the last scan (the first scan just records what's there).
  const now = Date.now();
  const after = build().games;
  const added: string[] = [];
  for (const g of after) {
    if (s.firstSeen[g.key] !== undefined) continue;
    s.firstSeen[g.key] = firstScan ? 0 : now;
    if (!firstScan && !before.has(g.key) && g.installed && !g.isTool) added.push(g.key);
  }
  if (added.length) justAdded = { at: now, keys: added };
  s.scannedAt = new Date().toISOString();
  save();
  emit();
  watchStores();
  void fillDetails();
  return getLibrary();
}

let filling = false;
let steamUserId: string | null = null;
/** Background lookups: Steam names, genres, Steam matches for Epic/Xbox games, SteamGridDB art. */
async function fillDetails(): Promise<void> {
  if (filling) return;
  filling = true;
  try {
    const s = load();
    // Owned list from the public profile (network; kept out of the scan so it never slows it down).
    if (steamUserId) {
      const owned = await fetchOwnedGames(steamUserId);
      const before = JSON.stringify(s.steamOwned?.map((g) => g.appId) ?? null);
      s.steamOwned = owned;
      if (JSON.stringify(owned?.map((g) => g.appId) ?? null) !== before) {
        for (const g of getLibrary().games) if (s.firstSeen[g.key] === undefined) s.firstSeen[g.key] = 0;
      }
      save();
      emit();
    }
    const missingNames = [...s.steamPlayed, ...s.emulatorApps].filter((id) => !cachedAppName(id) && !moduleForSteamApp(id));
    for (const id of missingNames) await fetchAppName(id); // sequential: the store endpoint rate-limits
    if (missingNames.length) emit();

    const names = [
      ...s.epic.map((g) => g.name),
      ...s.xbox.map((g) => g.name),
      ...Object.values(s.extra).flatMap((r) => r?.games.map((g) => g.name) ?? []),
      ...s.anker.filter((g) => !g.steamAppId).map((g) => g.title),
    ];
    for (const name of names) {
      if (cachedNameMatch(name) === undefined) {
        await matchSteamByName(name);
        await pause(300);
      }
    }
    emit();

    // Genres: installed and played games first, then the rest of the owned list.
    const lib = getLibrary().games;
    const wanted = lib
      .filter((g) => !s.genreEdits[g.key])
      .sort((a, b) => Number(b.installed) - Number(a.installed) || Number(!!b.lastPlayed) - Number(!!a.lastPlayed))
      .map((g) => g.steamAppId ?? g.achievementAppId)
      .filter((id): id is number => !!id && cachedGenres(id) === undefined);
    let n = 0;
    for (const id of [...new Set(wanted)]) {
      const r = await fetchGenres(id);
      if (r === null) break; // rate-limited or offline: try again next scan
      if (++n % 25 === 0) emit();
      await pause(350);
    }
    if (n) emit();

    if (hasSteamGridKey()) {
      const noArt = getLibrary().games.filter((g) => !g.steamAppId && !g.achievementAppId && !g.cover && !g.poster && !cachedGridArt(g.name));
      for (const g of noArt) await fetchGridArt(g.name);
      if (noArt.length) emit();
    }
  } catch (err) {
    console.error('Library details failed:', err);
  } finally {
    filling = false;
  }
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- Watching store files ----------

const watchers = new Map<string, fs.FSWatcher>();
const ROM_FILE = /\.(nsp|xci|nro|gba|gbc|gb|iso)$/i;
let rescanTimer: NodeJS.Timeout | null = null;

function scheduleRescan(): void {
  if (rescanTimer) clearTimeout(rescanTimer);
  rescanTimer = setTimeout(() => {
    rescanTimer = null;
    void importSteamLibrary();
  }, 4000);
}

/** Rescans when a store's install files change (a game installed, removed or updated). */
function watchStores(): void {
  const s = load();
  const dirs = new Set<string>();
  for (const f of s.steam.libraryFolders ?? []) dirs.add(path.join(f, 'steamapps'));
  dirs.add(epicWatchDir(s.storePaths.epic ?? defaultEpicDataDir()));
  for (const r of xboxGamingRoots()) dirs.add(r);
  dirs.add(path.dirname(ankerLibraryFile()));
  for (const e of EMULATORS) for (const f of emulatorFolders(s, e.id)) dirs.add(f);
  for (const [dir, w] of watchers) {
    if (!dirs.has(dir)) {
      w.close();
      watchers.delete(dir);
    }
  }
  for (const dir of dirs) {
    if (watchers.has(dir) || !fs.existsSync(dir)) continue;
    try {
      const w = fs.watch(dir, (_event, name) => {
        const n = String(name ?? '');
        if (!n || /^appmanifest_\d+\.acf$/i.test(n) || /\.item$/i.test(n) || /^library\.json$/i.test(n) || ROM_FILE.test(n) || !n.includes('.')) scheduleRescan();
      });
      w.on('error', () => {
        w.close();
        watchers.delete(dir);
      });
      watchers.set(dir, w);
    } catch {
      // can't watch this folder; Refresh still works
    }
  }
}

export function stopStoreWatchers(): void {
  for (const w of watchers.values()) w.close();
  watchers.clear();
}

// ---------- Changes from the app ----------

export async function addGameManually(parent: BrowserWindow | null): Promise<LibraryGame | null> {
  const filters =
    process.platform === 'win32'
      ? [{ name: 'Games', extensions: ['exe'] }]
      : [{ name: 'All files', extensions: ['*'] }];
  const opts = { title: 'Choose the game’s executable', properties: ['openFile' as const], filters };
  const result = parent ? await dialog.showOpenDialog(parent, opts) : await dialog.showOpenDialog(opts);
  if (result.canceled || result.filePaths.length === 0) return null;

  const r = addGameFromPath(result.filePaths[0]);
  return r.game ?? null;
}

const niceName = (file: string) =>
  path
    .basename(file)
    .replace(/\.(exe|lnk|url|x86_64|x86|sh|AppImage)$/i, '')
    .replace(/[-_.]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim() || path.basename(file);

/**
 * Adds a game from a file you browsed to or dropped on the Games tab: an exe, a Windows shortcut
 * (.lnk, read to its exe and options), an internet shortcut (.url, e.g. steam:// or a store link,
 * opened as it is), or a game file an emulator opens (added to that emulator's list).
 */
export function addGameFromPath(filePath: string): { game?: LibraryGame; error?: string } {
  const s = load();
  const file = path.normalize(String(filePath ?? ''));
  if (!file || !fs.existsSync(file)) return { error: 'That file isn’t there.' };
  if (fs.statSync(file).isDirectory()) return { error: 'Drop the game’s .exe or a shortcut, not a folder.' };
  const ext = path.extname(file).toLowerCase();

  const emu = emulatorForFile(file);
  if (emu) {
    const cfg = (s.emulators[emu] ??= {});
    cfg.files = [...new Set([...(cfg.files ?? []), file])];
    scanAllRoms(s);
    for (const r of s.roms) s.firstSeen[r.key] ??= Date.now();
    save();
    emit();
    const rom = s.roms.find((r) => r.file.toLowerCase() === file.toLowerCase());
    const game = rom ? getLibrary().games.find((g) => g.key === rom.key) : undefined;
    return game ? { game } : { error: 'Added, but it looks like an update or DLC, not a game of its own.' };
  }

  let exePath = file;
  let options: string | undefined;
  if (ext === '.lnk') {
    try {
      const link = shell.readShortcutLink(file);
      if (!link.target) return { error: 'That shortcut doesn’t point at a program.' };
      exePath = link.target;
      options = link.args?.trim() || undefined;
    } catch {
      return { error: 'Windows couldn’t read that shortcut.' };
    }
  } else if (ext !== '.url' && ext !== '.exe' && process.platform === 'win32') {
    return { error: 'ShotCaller can add an .exe, a shortcut (.lnk or .url) or a game file for RPCS3, Ryujinx or mGBA.' };
  }

  const existing = s.manual.find((g) => g.exePath?.toLowerCase() === exePath.toLowerCase());
  if (existing) return { game: existing };
  const game: LibraryGame = {
    key: `manual:${randomUUID()}`,
    name: niceName(ext === '.lnk' || ext === '.url' ? file : exePath),
    source: 'manual',
    exePath,
    installDir: ext === '.url' ? undefined : path.dirname(exePath),
    exeNames: ext === '.url' ? [] : [path.basename(exePath)],
    installed: true,
  };
  s.manual.push(game);
  s.pinned.push(game.key); // hand-added games show in the rail
  s.firstSeen[game.key] = Date.now();
  if (options) s.launchOptions[game.key] = options;
  save();
  emit();
  return { game };
}

/** Emulator settings from the More section: pick its program, add or remove a game folder. */
export async function emulatorOp(op: EmulatorOp, parent: BrowserWindow | null): Promise<Library> {
  const s = load();
  const def = EMULATORS.find((e) => e.id === op.emu);
  if (!def) return getLibrary();
  const cfg = (s.emulators[op.emu] ??= {});
  const ask = async (opts: Electron.OpenDialogOptions) => {
    const r = parent ? await dialog.showOpenDialog(parent, opts) : await dialog.showOpenDialog(opts);
    return r.canceled ? undefined : r.filePaths[0];
  };
  if (op.op === 'pickExe') {
    const p = await ask({ title: `Choose ${def.name} (${def.exeName})`, properties: ['openFile'], filters: [{ name: def.name, extensions: ['exe'] }] });
    if (!p) return getLibrary();
    cfg.exe = p;
  } else if (op.op === 'resetExe') {
    delete cfg.exe;
  } else if (op.op === 'addFolder') {
    const p = await ask({ title: `Choose a folder with your ${def.console} games`, properties: ['openDirectory'] });
    if (!p) return getLibrary();
    cfg.folders = [...new Set([...emulatorFolders(s, op.emu), path.normalize(p)])];
  } else if (op.op === 'removeFolder') {
    cfg.folders = emulatorFolders(s, op.emu).filter((f) => f !== op.folder);
    cfg.files = (cfg.files ?? []).filter((f) => !f.startsWith(op.folder));
  }
  const before = new Set(s.roms.map((r) => r.key));
  scanAllRoms(s);
  for (const r of s.roms) if (!before.has(r.key)) s.firstSeen[r.key] ??= Date.now();
  save();
  emit();
  watchStores();
  return getLibrary();
}

/** Favourite (also shows the game in the rail). */
export function setPinned(key: string, pinned: boolean): Library {
  const s = load();
  s.pinned = s.pinned.filter((k) => k !== key);
  if (pinned) s.pinned.push(key);
  save();
  emit();
  return getLibrary();
}

export function setHidden(key: string, hidden: boolean): Library {
  const s = load();
  s.hidden = s.hidden.filter((k) => k !== key);
  if (hidden) s.hidden.push(key);
  save();
  emit();
  return getLibrary();
}

/** Your own genres for a game (null puts Steam's back). */
export function setGenres(key: string, list: string[] | null): Library {
  const s = load();
  if (list === null) delete s.genreEdits[key];
  else s.genreEdits[key] = [...new Set(list.map((g) => g.trim()).filter(Boolean))].slice(0, 12);
  save();
  emit();
  return getLibrary();
}

/** Move a game to Tools (true), back to games (false) or to the automatic choice (null). */
export function setIsTool(key: string, tool: boolean | null): Library {
  const s = load();
  if (tool === null) delete s.toolEdits[key];
  else s.toolEdits[key] = tool;
  save();
  emit();
  return getLibrary();
}

export function setLaunchOptions(key: string, options: string): Library {
  const s = load();
  const v = options.trim().slice(0, 500);
  if (v) s.launchOptions[key] = v;
  else delete s.launchOptions[key];
  save();
  emit();
  return getLibrary();
}

export function createCollection(name: string): GameCollection | null {
  const n = name.trim().slice(0, 40);
  if (!n) return null;
  const c: GameCollection = { id: randomUUID(), name: n, keys: [] };
  load().collections.push(c);
  save();
  emit();
  return c;
}

export function renameCollection(id: string, name: string): Library {
  const c = load().collections.find((x) => x.id === id);
  const n = name.trim().slice(0, 40);
  if (c && n) c.name = n;
  save();
  emit();
  return getLibrary();
}

export function deleteCollection(id: string): Library {
  const s = load();
  s.collections = s.collections.filter((c) => c.id !== id);
  save();
  emit();
  return getLibrary();
}

export function setInCollection(id: string, key: string, inIt: boolean): Library {
  const c = load().collections.find((x) => x.id === id);
  if (c) {
    c.keys = c.keys.filter((k) => k !== key);
    if (inIt) c.keys.push(key);
  }
  save();
  emit();
  return getLibrary();
}

/** Remembers a Play from ShotCaller (recently played, tray menu). */
export function recordLaunch(key: string): void {
  load().launched[key] = Date.now();
  save();
  emit();
}

/** Lets the user point at a store's folder (null goes back to finding it on its own). */
export async function setStorePath(id: StoreId, parent: BrowserWindow | null, reset = false): Promise<Library> {
  const s = load();
  if (reset) delete s.storePaths[id];
  else {
    const title = id === 'steam' ? 'Choose your Steam folder (the one with steamapps inside)' : 'Choose Epic’s data folder (…\\EpicGamesLauncher\\Data)';
    const opts = { title, properties: ['openDirectory' as const] };
    const r = parent ? await dialog.showOpenDialog(parent, opts) : await dialog.showOpenDialog(opts);
    if (r.canceled || !r.filePaths[0]) return getLibrary();
    s.storePaths[id] = r.filePaths[0];
  }
  save();
  return importSteamLibrary();
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
  // An emulator game you dropped in by itself leaves that emulator's list.
  const rom = s.roms.find((r) => r.key === key);
  if (rom) {
    const cfg = s.emulators[rom.emu];
    if (cfg?.files) cfg.files = cfg.files.filter((f) => f.toLowerCase() !== rom.file.toLowerCase());
    scanAllRoms(s);
  }
  s.pinned = s.pinned.filter((k) => k !== key);
  delete s.links[key];
  save();
  emit();
  return getLibrary();
}

/** Raw store records, for launching. */
export function storeRecords(): {
  epic: EpicGame[];
  xbox: XboxGame[];
  anker: AnkerGame[];
  manual: LibraryGame[];
  extra: Partial<Record<ExtraStoreId, ExtraStoreResult>>;
  roms: RomGame[];
  emulatorExe: (emu: EmulatorId) => string | undefined;
} {
  const s = load();
  return { epic: s.epic, xbox: s.xbox, anker: s.anker, manual: s.manual, extra: s.extra, roms: s.roms, emulatorExe: (emu) => emulatorExe(s, emu) };
}

export const extraGameKey = extraKey;

/** Rebuild now (e.g. after a play session ends, so playtime updates). */
export function refreshLibrary(): void {
  emit();
}
