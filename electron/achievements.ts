import { app } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  rarityTier,
  type Achievement,
  type AchievementListSource,
  type AchievementTracking,
  type ActionResult,
  type GameAchievements,
  type GameSummary,
  type HubState,
  type LibraryGame,
  type RarityTier,
  type UnlockEvent,
  type UnlockVia,
} from '../shared/types';
import { emulatorRoots, readEmulatorUnlocks, scanEmulatorApps } from './emulators';
import { getLibrary, importSteamLibrary, onLibraryChange } from './library';
import { showPopup } from './popup';
import { getSessions, totalMinutes } from './sessions';
import { getSettings } from './settings';
import { findSteamPath } from './steam';
import {
  readPlaytime,
  readSchema,
  readSteamUser,
  readUserStats,
  statsDir,
  type AchievementDef,
  type SteamUnlocks,
  type SteamUser,
} from './steamLocal';
import { fetchPublicAchievements, fetchRarity } from './steamPublic';

/**
 * The achievement hub: builds every game's achievement list from local sources, watches those
 * sources for new unlocks, fires the popup and keeps the unlock timeline. Everything is local;
 * ticks and custom achievements are stored in achievements.json (shaped to sync to
 * users/{uid}/unlocks later).
 */

const POLL_MS = 10_000;

// ---------- Stored data (ticks and custom achievements) ----------

interface CustomDef {
  id: string;
  name: string;
  description: string;
  createdAt: number;
}

interface Stored {
  /** Game key → achievement id → tick time (epoch ms). */
  manual: Record<string, Record<string, number>>;
  /** Game key → the user's own achievements. */
  custom: Record<string, CustomDef[]>;
}

let stored: Stored | null = null;

function storeFile(): string {
  return path.join(app.getPath('userData'), 'achievements.json');
}

function loadStore(): Stored {
  if (stored) return stored;
  stored = { manual: {}, custom: {} };
  try {
    const raw = JSON.parse(fs.readFileSync(storeFile(), 'utf8')) as Partial<Stored>;
    for (const [k, m] of Object.entries(raw.manual ?? {})) {
      if (!m || typeof m !== 'object') continue;
      const clean: Record<string, number> = {};
      for (const [id, t] of Object.entries(m)) if (Number.isFinite(t)) clean[id] = t;
      stored.manual[k] = clean;
    }
    for (const [k, list] of Object.entries(raw.custom ?? {})) {
      if (!Array.isArray(list)) continue;
      stored.custom[k] = list.filter((d) => d && typeof d.id === 'string' && typeof d.name === 'string');
    }
  } catch {
    // first run
  }
  return stored;
}

function saveStore(): void {
  try {
    fs.mkdirSync(path.dirname(storeFile()), { recursive: true });
    fs.writeFileSync(storeFile(), JSON.stringify(loadStore(), null, 2), 'utf8');
  } catch (err) {
    console.error('Could not save achievements:', err);
  }
}

// ---------- Per-game data ----------

interface GameData {
  key: string;
  name: string;
  appId: number | null;
  tracking: AchievementTracking;
  listSource: AchievementListSource;
  defs: AchievementDef[];
  rarity: Record<string, number>;
  steam: SteamUnlocks | null;
  emu: Map<string, number>;
  emuFiles: string[];
  statNames: Record<string, string>;
  error?: string;
  /** Whether the public list/rarity has been requested (network). */
  fetched: boolean;
}

let steamPath: string | null = null;
let user: SteamUser | null = null;
let emuApps = new Map<number, string[]>();
const data = new Map<string, GameData>();
/** Last-seen unlocked ids per game, for spotting new unlocks. */
const known = new Map<string, Set<string>>();
const mtimes = new Map<string, number>();
let revision = 0;
let ready = false;
const listeners = new Set<(s: HubState) => void>();
const watchers: fs.FSWatcher[] = [];
let pollTimer: NodeJS.Timeout | null = null;
let reconcileTimer: NodeJS.Timeout | null = null;

const isSteamGame = (g: LibraryGame) => (g.source === 'steam' || g.source === 'module') && !!g.steamAppId;

function trackingFor(g: LibraryGame): AchievementTracking {
  if (isSteamGame(g) && steamPath && user) return 'steam';
  if (g.achievementAppId && emuApps.has(g.achievementAppId)) return 'emulator';
  return 'manual';
}

function statsFile(appId: number): string | null {
  return steamPath && user ? path.join(statsDir(steamPath), `UserGameStats_${user.accountId}_${appId}.bin`) : null;
}

function mtime(f: string): number {
  try {
    return fs.statSync(f).mtimeMs;
  } catch {
    return 0;
  }
}

function customDefs(key: string): AchievementDef[] {
  return (loadStore().custom[key] ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    hidden: false,
    icon: null,
    iconGray: null,
  }));
}

/** Builds a game's list from local data. With `network`, also fetches the public list/rarity. */
async function build(g: LibraryGame, network: boolean): Promise<GameData> {
  const prev = data.get(g.key);
  const appId = g.achievementAppId ?? null;
  const tracking = trackingFor(g);
  const d: GameData = {
    key: g.key,
    name: g.name,
    appId,
    tracking,
    listSource: 'none',
    defs: [],
    rarity: prev?.appId === appId ? prev.rarity : {},
    steam: null,
    emu: new Map(),
    emuFiles: appId ? (emuApps.get(appId) ?? []) : [],
    statNames: {},
    fetched: prev?.appId === appId ? prev.fetched : false,
  };

  const local = tracking === 'steam' && appId && steamPath ? readSchema(steamPath, appId) : null;
  if (local) {
    d.defs = local.defs;
    d.statNames = local.statNames;
    d.listSource = 'steam-local';
  } else if (appId && (network || tracking !== 'steam')) {
    // Non-Steam games always try (their list only comes from Steam's public page; it's cached).
    try {
      const pub = await fetchPublicAchievements(appId);
      d.defs = pub.defs;
      if (Object.keys(pub.rarity).length) d.rarity = pub.rarity;
      d.listSource = pub.defs.length ? 'steam-public' : 'none';
      d.fetched = true;
    } catch (err) {
      d.error = `Couldn't load the achievement list from Steam (${err instanceof Error ? err.message : String(err)}).`;
    }
  }

  if (network && appId && !Object.keys(d.rarity).length) {
    d.rarity = await fetchRarity(appId);
    d.fetched = true;
  }

  const custom = customDefs(g.key);
  if (custom.length) {
    d.defs = [...d.defs, ...custom];
    if (d.listSource === 'none') d.listSource = 'custom';
  }
  readUnlocks(d);
  return d;
}

function readUnlocks(d: GameData): void {
  if (d.tracking === 'steam' && d.appId && steamPath && user && d.listSource === 'steam-local') {
    const schema = { appId: d.appId, defs: d.defs.filter((x) => x.statId !== undefined), statNames: d.statNames };
    d.steam = readUserStats(steamPath, user.accountId, schema);
    const f = statsFile(d.appId);
    if (f) mtimes.set(f, mtime(f));
  }
  if (d.emuFiles.length) {
    d.emu = readEmulatorUnlocks(d.emuFiles);
    for (const f of d.emuFiles) mtimes.set(f, mtime(f));
  }
}

/** Achievement id → { at, via } across all sources. */
function unlockMap(d: GameData): Map<string, { at: number; via: UnlockVia }> {
  const out = new Map<string, { at: number; via: UnlockVia }>();
  for (const [id, at] of d.steam?.unlocked ?? []) out.set(id, { at, via: 'steam' });
  for (const [id, at] of d.emu) if (!out.has(id)) out.set(id, { at, via: 'emulator' });
  const ticks = loadStore().manual[d.key] ?? {};
  const allowTicks = d.tracking !== 'steam';
  for (const [id, at] of Object.entries(ticks)) {
    if (!out.has(id) && (allowTicks || id.startsWith('custom:'))) out.set(id, { at, via: 'manual' });
  }
  return out;
}

function toAchievements(d: GameData): Achievement[] {
  const unlocks = unlockMap(d);
  return d.defs.map((def) => {
    const u = unlocks.get(def.id);
    let progress: Achievement['progress'];
    if (!u && def.progressStat && def.progressMax && d.steam) {
      const v = d.steam.stats.get(def.progressStat);
      if (v !== undefined && v > 0) progress = { current: Math.min(v, def.progressMax), max: def.progressMax };
    }
    return {
      id: def.id,
      name: def.name,
      description: def.description,
      hidden: def.hidden,
      icon: def.icon,
      iconGray: def.iconGray,
      rarity: d.rarity[def.id] ?? null,
      unlocked: !!u,
      unlockedAt: u && u.at > 0 ? u.at : null,
      via: u?.via ?? null,
      progress,
      custom: def.id.startsWith('custom:') || undefined,
    };
  });
}

function summarize(d: GameData): GameSummary {
  const unlocks = unlockMap(d);
  const ids = new Set(d.defs.map((x) => x.id));
  let unlocked = 0;
  let last: number | null = null;
  for (const [id, u] of unlocks) {
    if (!ids.has(id)) continue;
    unlocked++;
    if (u.at > 0 && (last === null || u.at > last)) last = u.at;
  }
  return { key: d.key, total: d.defs.length, unlocked, lastUnlockAt: last, playtimeMinutes: null };
}

// ---------- State and events ----------

export function getHubState(): HubState {
  const summaries: Record<string, GameSummary> = {};
  for (const d of data.values()) if (d.defs.length) summaries[d.key] = summarize(d);
  return { ready, steamUser: user ? { steamId: user.steamId, persona: user.persona } : null, summaries, revision };
}

export function onHubChange(fn: (s: HubState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(): void {
  revision++;
  const s = getHubState();
  for (const fn of listeners) fn(s);
}

function eventFor(d: GameData, id: string, at: number, via: UnlockVia): UnlockEvent | null {
  const def = d.defs.find((x) => x.id === id);
  if (!def) return null;
  return {
    id: `${d.key}|${id}`,
    gameKey: d.key,
    gameName: d.name,
    appId: d.appId,
    achievementId: id,
    name: def.name,
    description: def.description,
    icon: def.icon,
    rarity: d.rarity[id] ?? null,
    unlockedAt: at,
    via,
  };
}

async function announce(d: GameData, ids: string[]): Promise<void> {
  const popups = getSettings().popups;
  if (!popups.enabled || !ids.length) return;
  if (d.appId && !Object.keys(d.rarity).length) {
    // Rarity makes the card (and its sound); wait briefly for it.
    d.rarity = await Promise.race([fetchRarity(d.appId), new Promise<Record<string, number>>((r) => setTimeout(() => r({}), 2500))]);
  }
  const unlocks = unlockMap(d);
  const events = ids
    .map((id) => eventFor(d, id, unlocks.get(id)?.at || Date.now(), unlocks.get(id)?.via ?? 'manual'))
    .filter((e): e is UnlockEvent => !!e)
    .sort((a, b) => (a.rarity ?? 100) - (b.rarity ?? 100)); // rarest last, so it lingers
  events.reverse();
  for (const event of events) {
    showPopup({ event, tier: rarityTier(event.rarity), sound: popups.sound, volume: popups.volume, corner: popups.corner });
  }
}

/** Re-reads one game's unlocks and announces anything new. */
function refreshUnlocks(key: string): void {
  const d = data.get(key);
  if (!d) return;
  readUnlocks(d);
  const now = new Set(unlockMap(d).keys());
  const before = known.get(key);
  known.set(key, now);
  if (!before) return;
  const fresh = [...now].filter((id) => !before.has(id));
  const lost = [...before].some((id) => !now.has(id));
  if (fresh.length || lost) emit();
  if (fresh.length) void announce(d, fresh);
}

// ---------- Library reconcile ----------

async function reconcile(): Promise<void> {
  emuApps = scanEmulatorApps();
  const lib = getLibrary().games;
  const keys = new Set(lib.map((g) => g.key));
  for (const k of [...data.keys()]) if (!keys.has(k)) data.delete(k);
  for (const g of lib) {
    const prev = data.get(g.key);
    if (prev && prev.appId === (g.achievementAppId ?? null) && prev.name === g.name && prev.tracking === trackingFor(g)) continue;
    const d = await build(g, false);
    data.set(g.key, d);
    if (!known.has(g.key)) known.set(g.key, new Set(unlockMap(d).keys()));
  }
  ready = true;
  emit();
  void warmRarity();
}

let warming = false;
/** Loads global rarity for games with unlocks (one request at a time, cached for a day). */
async function warmRarity(): Promise<void> {
  if (warming) return;
  warming = true;
  try {
    let changed = false;
    for (const d of [...data.values()]) {
      if (!d.appId || Object.keys(d.rarity).length || unlockMap(d).size === 0) continue;
      d.rarity = await fetchRarity(d.appId);
      if (Object.keys(d.rarity).length) changed = true;
    }
    if (changed) emit();
  } finally {
    warming = false;
  }
}

function scheduleReconcile(): void {
  if (reconcileTimer) clearTimeout(reconcileTimer);
  reconcileTimer = setTimeout(() => void reconcile(), 400);
}

// ---------- Watching ----------

function keysForApp(appId: number, tracking?: AchievementTracking): string[] {
  return [...data.values()].filter((d) => d.appId === appId && (!tracking || d.tracking === tracking)).map((d) => d.key);
}

const pending = new Map<string, NodeJS.Timeout>();
function debounce(id: string, fn: () => void, ms = 300): void {
  const t = pending.get(id);
  if (t) clearTimeout(t);
  pending.set(
    id,
    setTimeout(() => {
      pending.delete(id);
      fn();
    }, ms),
  );
}

function onStatsFile(name: string): void {
  const stats = /^UserGameStats_(\d+)_(\d+)\.bin$/i.exec(name);
  if (stats && user && Number(stats[1]) === user.accountId) {
    const appId = Number(stats[2]);
    const keys = keysForApp(appId, 'steam');
    if (!keys.length) debounce('library', () => void importSteamLibrary(), 1000);
    for (const k of keys) {
      const d = data.get(k);
      if (d && d.listSource !== 'steam-local') debounce(`rebuild:${k}`, () => void rebuild(k));
      else debounce(`stats:${k}`, () => refreshUnlocks(k));
    }
    return;
  }
  const schema = /^UserGameStatsSchema_(\d+)\.bin$/i.exec(name);
  if (schema) for (const k of keysForApp(Number(schema[1]), 'steam')) debounce(`rebuild:${k}`, () => void rebuild(k), 800);
}

async function rebuild(key: string): Promise<void> {
  const g = getLibrary().games.find((x) => x.key === key);
  if (!g) return;
  const before = known.get(key);
  const d = await build(g, false);
  data.set(key, d);
  const now = new Set(unlockMap(d).keys());
  known.set(key, now);
  emit();
  if (before) {
    const fresh = [...now].filter((id) => !before.has(id));
    if (fresh.length) void announce(d, fresh);
  }
}

function onEmulatorFile(rel: string): void {
  const m = /^(\d+)[\\/]/.exec(rel);
  if (!m) return;
  const appId = Number(m[1]);
  if (!/achievements\.(json|ini)$/i.test(rel)) return;
  const keys = keysForApp(appId);
  if (!keys.length || !emuApps.has(appId)) {
    debounce('library', () => void importSteamLibrary(), 1000);
    return;
  }
  for (const k of keys) debounce(`emu:${k}`, () => refreshUnlocks(k));
}

function watch(dir: string, recursive: boolean, fn: (name: string) => void): void {
  try {
    const w = fs.watch(dir, { recursive }, (_event, name) => name && fn(String(name)));
    w.on('error', () => w.close());
    watchers.push(w);
  } catch (err) {
    console.error('Could not watch', dir, err);
  }
}

/** Fallback for missed watch events: compare file times every few seconds. */
function poll(): void {
  for (const d of data.values()) {
    const files = [...d.emuFiles];
    if (d.tracking === 'steam' && d.appId) {
      const f = statsFile(d.appId);
      if (f) files.push(f);
    }
    for (const f of files) {
      const t = mtime(f);
      const seen = mtimes.get(f);
      if (seen !== undefined && t !== seen) {
        mtimes.set(f, t);
        if (d.listSource !== 'steam-local' && d.tracking === 'steam') void rebuild(d.key);
        else refreshUnlocks(d.key);
      } else if (seen === undefined) mtimes.set(f, t);
    }
  }
}

// ---------- Public API ----------

export async function initHub(): Promise<void> {
  steamPath = await findSteamPath();
  user = steamPath ? readSteamUser(steamPath) : null;
  if (steamPath) watch(statsDir(steamPath), false, onStatsFile);
  for (const root of emulatorRoots()) watch(root.dir, process.platform !== 'linux', onEmulatorFile);
  onLibraryChange(() => scheduleReconcile());
  await reconcile();
  pollTimer = setInterval(poll, POLL_MS);
}

export function disposeHub(): void {
  for (const w of watchers) w.close();
  watchers.length = 0;
  if (pollTimer) clearInterval(pollTimer);
}

export async function getGameAchievements(key: string): Promise<GameAchievements | null> {
  const g = getLibrary().games.find((x) => x.key === key);
  if (!g) return null;
  let d = data.get(key);
  if (!d || (!d.fetched && d.appId)) {
    d = await build(g, true);
    data.set(key, d);
    if (!known.has(key)) known.set(key, new Set(unlockMap(d).keys()));
  }
  let playtimeMinutes: number | null = null;
  let lastPlayed: number | null = null;
  if (d.tracking === 'steam' && d.appId && steamPath && user) {
    const pt = readPlaytime(steamPath, user.accountId).get(d.appId);
    if (pt) {
      playtimeMinutes = pt.minutes;
      lastPlayed = pt.lastPlayed;
    }
  }
  const sessions = getSessions(key);
  if (playtimeMinutes === null && sessions.length) playtimeMinutes = totalMinutes(key);
  if (lastPlayed === null && sessions.length) lastPlayed = sessions[0].end;
  const achievements = toAchievements(d);
  return {
    key,
    name: d.name,
    appId: d.appId,
    listSource: d.listSource,
    tracking: d.tracking,
    achievements,
    total: achievements.length,
    unlocked: achievements.filter((a) => a.unlocked).length,
    playtimeMinutes,
    lastPlayed,
    sessions: sessions.slice(0, 50),
    error: d.error,
  };
}

export function getTimeline(limit: number): UnlockEvent[] {
  const out: UnlockEvent[] = [];
  for (const d of data.values()) {
    for (const [id, u] of unlockMap(d)) {
      const e = eventFor(d, id, u.at, u.via);
      if (e) out.push(e);
    }
  }
  out.sort((a, b) => b.unlockedAt - a.unlockedAt);
  return out.slice(0, Math.max(1, Math.min(limit, 2000)));
}

export function setManualUnlock(key: string, id: string, unlocked: boolean): ActionResult {
  const d = data.get(key);
  if (!d) return { ok: false, error: 'Unknown game.' };
  if (!d.defs.some((x) => x.id === id)) return { ok: false, error: 'Unknown achievement.' };
  if (d.tracking === 'steam' && !id.startsWith('custom:')) return { ok: false, error: 'Steam tracks this one itself.' };
  const s = loadStore();
  const ticks = (s.manual[key] ??= {});
  if (unlocked) ticks[id] = Date.now();
  else delete ticks[id];
  saveStore();
  refreshUnlocks(key);
  emit();
  return { ok: true };
}

export async function addCustomAchievement(key: string, name: string, description: string): Promise<ActionResult> {
  const n = name.trim().slice(0, 80);
  if (!n) return { ok: false, error: 'Give it a name.' };
  if (!getLibrary().games.some((g) => g.key === key)) return { ok: false, error: 'Unknown game.' };
  const s = loadStore();
  const list = (s.custom[key] ??= []);
  if (list.length >= 500) return { ok: false, error: 'That’s the limit for one game.' };
  list.push({ id: `custom:${randomUUID()}`, name: n, description: description.trim().slice(0, 300), createdAt: Date.now() });
  saveStore();
  await rebuild(key);
  return { ok: true };
}

export async function removeCustomAchievement(key: string, id: string): Promise<ActionResult> {
  const s = loadStore();
  const list = s.custom[key];
  if (!list?.some((c) => c.id === id)) return { ok: false, error: 'Unknown achievement.' };
  s.custom[key] = list.filter((c) => c.id !== id);
  if (s.manual[key]) delete s.manual[key][id];
  saveStore();
  await rebuild(key);
  return { ok: true };
}

/** Shows a sample card for a tier (Settings → Test). */
export function testPopup(tier: RarityTier): void {
  const sample: Record<RarityTier, [string, number]> = {
    common: ['First Steps', 72.4],
    uncommon: ['Getting the Hang of It', 38.1],
    rare: ['Sharpshooter', 17.6],
    epic: ['Untouchable', 6.3],
    legendary: ['Beyond Godlike', 0.8],
  };
  const [name, rarity] = sample[tier];
  const popups = getSettings().popups;
  showPopup({
    event: {
      id: `test|${tier}`,
      gameKey: 'test',
      gameName: 'ShotCaller',
      appId: null,
      achievementId: tier,
      name,
      description: 'This is how an unlock looks.',
      icon: null,
      rarity,
      unlockedAt: Date.now(),
      via: 'manual',
    },
    tier,
    sound: popups.sound,
    volume: popups.volume,
    corner: popups.corner,
    test: true,
  });
}
