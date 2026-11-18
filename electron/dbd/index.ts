import { app, net } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  DBD_STEAM_APP,
  DEFAULT_DBD_SETTINGS,
  type DbdBuild,
  type DbdData,
  type DbdDataStatus,
  type DbdGameSettings,
  type DbdPatchNote,
  type DbdPopularList,
  type DbdSettings,
  type DbdSettingsPatch,
  type DbdSide,
  type DbdState,
} from '../../shared/dbd';
import bundledPopular from '../../games/dbd/builds.json';
import { findSteamPath, parseVdf, readLibraryFolders, vdfGet } from '../steam';
import { readSteamUser } from '../steamLocal';
import { localIcon, savedIconCount } from './icons';
import { fetchPatchNotes } from './news';
import { fetchWikiData } from './wikiFetch';

/**
 * Dead by Daylight module, main side: game data (wiki), patch notes (Steam), saved builds, the hub's settings,
 * Steam's play dates and DbD's own settings file. Never DbD's memory or process (EasyAntiCheat).
 */

const DATA_MAX_AGE = 3 * 86_400_000;
const NEWS_MAX_AGE = 6 * 3_600_000;
const POPULAR_URL = 'https://raw.githubusercontent.com/Battlebornplayz/ShotCaller/main/games/dbd/builds.json';

const dir = () => path.join(app.getPath('userData'), 'dbd');
const file = (name: string) => path.join(dir(), name);

let settings: DbdSettings = { ...DEFAULT_DBD_SETTINGS };
let builds: DbdBuild[] = [];
let data: DbdData | null = null;
let news: { fetchedAt: number; notes: DbdPatchNote[] } | null = null;
let popular: DbdPopularList = bundledPopular as DbdPopularList;
let status: DbdDataStatus = { state: 'idle', error: null, fetchedAt: null, latestPatch: null, icons: 0 };
let steamPath: string | null = null;
let refreshing: Promise<void> | null = null;
let timer: NodeJS.Timeout | null = null;
const listeners = new Set<(s: DbdState) => void>();
const dataListeners = new Set<(fetchedAt: number) => void>();

function readJson<T>(name: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file(name), 'utf8')) as T;
  } catch {
    return null;
  }
}

function writeJson(name: string, value: unknown): void {
  try {
    fs.mkdirSync(dir(), { recursive: true });
    const tmp = `${file(name)}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value));
    fs.renameSync(tmp, file(name));
  } catch (e) {
    console.warn('[dbd] could not save', name, e);
  }
}

// ---------------------------------------------------------------------------------------------
// Settings and builds

const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const scale = (v: unknown) => (typeof v === 'number' && v >= 50 && v <= 150 ? Math.round(v) : null);
const text = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const side = (v: unknown): DbdSide => (v === 'killer' ? 'killer' : 'survivor');

function cleanSettings(raw: Record<string, unknown>, prev: DbdSettings): DbdSettings {
  const has = (k: keyof DbdSettings) => Object.prototype.hasOwnProperty.call(raw, k);
  return {
    catchupBanner: bool(raw.catchupBanner, prev.catchupBanner),
    patchNotice: bool(raw.patchNotice, prev.patchNotice),
    newTags: bool(raw.newTags, prev.newTags),
    popularOnline: bool(raw.popularOnline, prev.popularOnline),
    side: has('side') ? side(raw.side) : prev.side,
    catchupFrom: has('catchupFrom') ? (typeof raw.catchupFrom === 'number' && raw.catchupFrom > 1.4e12 && raw.catchupFrom < Date.now() ? raw.catchupFrom : null) : prev.catchupFrom,
    seenPatch: has('seenPatch') ? text(raw.seenPatch, 20) || null : prev.seenPatch,
    menuScale: has('menuScale') ? scale(raw.menuScale) : prev.menuScale,
    hudScale: has('hudScale') ? scale(raw.hudScale) : prev.hudScale,
    monitorId: has('monitorId') ? (typeof raw.monitorId === 'number' && Number.isFinite(raw.monitorId) ? raw.monitorId : null) : prev.monitorId,
    setupDone: bool(raw.setupDone, prev.setupDone),
  };
}

function cleanBuild(raw: unknown): DbdBuild | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const list = (v: unknown, n: number) => (Array.isArray(v) ? v.slice(0, n).map((x) => text(x, 60)) : []);
  const perks = list(r.perks, 4);
  while (perks.length < 4) perks.push('');
  const name = text(r.name, 60);
  if (!name) return null;
  const now = Date.now();
  return {
    id: typeof r.id === 'string' && /^[\w-]{4,40}$/.test(r.id) ? r.id : `b${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name,
    side: side(r.side),
    perks,
    killer: text(r.killer, 60) || null,
    item: text(r.item, 60) || null,
    addons: list(r.addons, 2).filter(Boolean),
    offering: text(r.offering, 60) || null,
    notes: text(r.notes, 500),
    from: r.from === 'popular' || r.from === 'friend' || r.from === 'ai' ? r.from : 'mine',
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : now,
    updatedAt: now,
  };
}

export function updateDbdSettings(patch: DbdSettingsPatch): DbdState {
  settings = cleanSettings((patch ?? {}) as Record<string, unknown>, settings);
  writeJson('settings.json', settings);
  emit();
  return getDbdState();
}

export function saveDbdBuild(raw: unknown): DbdState {
  const b = cleanBuild(raw);
  if (b) {
    const i = builds.findIndex((x) => x.id === b.id);
    if (i >= 0) builds[i] = { ...b, createdAt: builds[i].createdAt };
    else builds.unshift(b);
    builds = builds.slice(0, 300);
    writeJson('builds.json', builds);
    emit();
  }
  return getDbdState();
}

export function deleteDbdBuild(id: string): DbdState {
  builds = builds.filter((b) => b.id !== id);
  writeJson('builds.json', builds);
  emit();
  return getDbdState();
}

// ---------------------------------------------------------------------------------------------
// Steam (play dates, DbD's build id) and DbD's own settings file

interface SteamInfo {
  lastPlayed: number | null;
  lastSessionMin: number | null;
  hours: number | null;
  build: string | null;
}

function readSteamInfo(): SteamInfo {
  const out: SteamInfo = { lastPlayed: null, lastSessionMin: null, hours: null, build: null };
  if (!steamPath) return out;
  try {
    const user = readSteamUser(steamPath);
    if (user) {
      const root = parseVdf(fs.readFileSync(path.join(steamPath, 'userdata', String(user.accountId), 'config', 'localconfig.vdf'), 'utf8'));
      let node = vdfGet(root, 'UserLocalConfigStore');
      for (const k of ['Software', 'Valve', 'Steam', 'apps', String(DBD_STEAM_APP)]) node = vdfGet(node, k);
      const last = Number(vdfGet(node, 'LastPlayed') ?? 0);
      const minutes = Number(vdfGet(node, 'Playtime') ?? 0);
      const cloud = vdfGet(node, 'autocloud');
      const launch = Number(vdfGet(cloud, 'lastlaunch') ?? 0);
      const exit = Number(vdfGet(cloud, 'lastexit') ?? 0);
      out.lastPlayed = last > 0 ? last * 1000 : null;
      out.hours = minutes > 0 ? Math.round(minutes / 60) : null;
      out.lastSessionMin = launch > 0 && exit >= launch ? Math.round((exit - launch) / 60) : null;
    }
  } catch {
    // No localconfig.
  }
  try {
    for (const lib of readLibraryFolders(steamPath)) {
      const f = path.join(lib, 'steamapps', `appmanifest_${DBD_STEAM_APP}.acf`);
      if (!fs.existsSync(f)) continue;
      const b = vdfGet(vdfGet(parseVdf(fs.readFileSync(f, 'utf8')), 'AppState'), 'buildid');
      if (typeof b === 'string') out.build = b;
      break;
    }
  } catch {
    // Not installed through Steam.
  }
  return out;
}

const GAME_INI = () => path.join(process.env.LOCALAPPDATA ?? path.join(app.getPath('home'), 'AppData', 'Local'), 'DeadByDaylight', 'Saved', 'Config', 'WindowsClient', 'GameUserSettings.ini');

/** Only this one settings file is opened (user, 2026-11-17): scales, screen size, window mode. */
function readGameSettings(): DbdGameSettings {
  const none: DbdGameSettings = { found: false, menuScale: null, hudScale: null, width: null, height: null, windowMode: null };
  let ini: string;
  try {
    ini = fs.readFileSync(GAME_INI(), 'utf8');
  } catch {
    return none;
  }
  const n = (key: string) => {
    const m = ini.match(new RegExp(`^${key}=(-?\\d+)`, 'm'));
    return m ? Number(m[1]) : null;
  };
  return { found: true, menuScale: n('MenuScaleFactor'), hudScale: n('HudScaleFactor'), width: n('ResolutionSizeX'), height: n('ResolutionSizeY'), windowMode: n('FullscreenMode') };
}

// ---------------------------------------------------------------------------------------------
// State

export function getDbdState(): DbdState {
  const steam = readSteamInfo();
  return {
    settings,
    builds,
    steamLastPlayed: steam.lastPlayed,
    steamLastSessionMin: steam.lastSessionMin,
    steamHours: steam.hours,
    game: readGameSettings(),
    data: { ...status, icons: savedIconCount() },
  };
}

function emit(): void {
  const s = getDbdState();
  for (const l of listeners) l(s);
}

export function onDbdChange(fn: (s: DbdState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Fires when a new data set is ready (the hub reloads it). */
export function onDbdData(fn: (fetchedAt: number) => void): () => void {
  dataListeners.add(fn);
  return () => dataListeners.delete(fn);
}

/** The data set with icons pointing at the local copies. */
export function getDbdData(): DbdData | null {
  if (!data) return null;
  const fix = <T extends { icon: string | null }>(x: T): T => ({ ...x, icon: localIcon(x.icon) });
  return {
    ...data,
    killers: data.killers.map(fix),
    survivors: data.survivors.map(fix),
    perks: data.perks.map(fix),
    items: data.items.map(fix),
    addons: data.addons.map(fix),
    offerings: data.offerings.map(fix),
  };
}

export function getDbdPopular(): DbdPopularList {
  return popular;
}

export async function getDbdNews(force = false): Promise<DbdPatchNote[]> {
  if (!force && news && Date.now() - news.fetchedAt < NEWS_MAX_AGE) return news.notes;
  try {
    news = { fetchedAt: Date.now(), notes: await fetchPatchNotes() };
    writeJson('news.json', news);
  } catch (e) {
    console.warn('[dbd] patch notes:', e instanceof Error ? e.message : e);
  }
  return news?.notes ?? [];
}

async function refreshPopular(): Promise<void> {
  if (!settings.popularOnline) return;
  try {
    const res = await net.fetch(POPULAR_URL, { headers: { Accept: 'application/json' } });
    if (!res.ok) return;
    const j = (await res.json()) as DbdPopularList;
    if (Array.isArray(j.builds) && typeof j.checkedPatch === 'string' && j.updated >= popular.updated) {
      popular = j;
      writeJson('popular.json', j);
    }
  } catch {
    // Offline: the bundled list stays.
  }
}

/** Fetches the wiki data now (the Refresh button), or when it's old or DbD updated. */
export function refreshDbdData(force = true): Promise<void> {
  if (refreshing) return refreshing;
  const steam = readSteamInfo();
  if (!force && data && Date.now() - data.fetchedAt < DATA_MAX_AGE && (!steam.build || steam.build === data.steamBuild)) return Promise.resolve();
  status = { ...status, state: 'loading', error: null };
  emit();
  refreshing = (async () => {
    try {
      const next = await fetchWikiData(steam.build);
      if (next.perks.length < 100 || next.killers.length < 20) throw new Error('The DbD wiki sent less than expected; keeping the saved data');
      data = next;
      writeJson('data.json', data);
      status = { state: 'ready', error: null, fetchedAt: data.fetchedAt, latestPatch: data.latestPatch, icons: 0 };
      for (const l of dataListeners) l(data.fetchedAt);
      void getDbdNews(true);
    } catch (e) {
      status = { ...status, state: data ? 'ready' : 'error', error: e instanceof Error ? e.message : String(e) };
    } finally {
      refreshing = null;
      emit();
    }
  })();
  return refreshing;
}

export async function initDbd(): Promise<void> {
  settings = cleanSettings(readJson<Record<string, unknown>>('settings.json') ?? {}, DEFAULT_DBD_SETTINGS);
  builds = (readJson<unknown[]>('builds.json') ?? []).map(cleanBuild).filter((b): b is DbdBuild => !!b);
  data = readJson<DbdData>('data.json');
  news = readJson('news.json');
  const savedPopular = readJson<DbdPopularList>('popular.json');
  if (savedPopular && savedPopular.updated >= popular.updated) popular = savedPopular;
  if (data) status = { state: 'ready', error: null, fetchedAt: data.fetchedAt, latestPatch: data.latestPatch, icons: 0 };
  steamPath = await findSteamPath().catch(() => null);
  void refreshDbdData(false);
  void refreshPopular();
  // DbD updates while ShotCaller runs: check every 6 hours.
  timer = setInterval(() => void refreshDbdData(false), 6 * 3_600_000);
  timer.unref();
}

export function disposeDbd(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
