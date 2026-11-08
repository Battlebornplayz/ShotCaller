import fs from 'node:fs';
import path from 'node:path';
import { isKv, kvGet, kvNum, kvStr, parseBinKv, type BinKv, type BinKvValue } from './binkv';
import { parseVdf, vdfGet, type VdfObject } from './steam';

/**
 * Steam's own local files for the signed-in user: who is signed in, achievement schemas,
 * unlocks with their times, and playtime. Nothing here needs a Steam Web API key.
 */

const STEAMID64_BASE = 76561197960265728n;

export interface SteamUser {
  steamId: string;
  accountId: number;
  persona: string;
}

/** The account Steam signed in most recently on this PC (loginusers.vdf). */
export function readSteamUser(steamPath: string): SteamUser | null {
  try {
    const root = parseVdf(fs.readFileSync(path.join(steamPath, 'config', 'loginusers.vdf'), 'utf8'));
    const users = vdfGet(root, 'users');
    if (!users || typeof users === 'string') return null;
    let best: { id: string; u: VdfObject; score: number } | null = null;
    for (const [id, u] of Object.entries(users)) {
      if (typeof u === 'string' || !/^\d{17}$/.test(id)) continue;
      const recent = vdfGet(u, 'MostRecent') === '1' ? 1e12 : 0;
      const score = recent + Number(vdfGet(u, 'Timestamp') ?? 0);
      if (!best || score > best.score) best = { id, u, score };
    }
    if (!best) return null;
    const accountId = Number(BigInt(best.id) - STEAMID64_BASE);
    const persona = vdfGet(best.u, 'PersonaName');
    return { steamId: best.id, accountId, persona: typeof persona === 'string' ? persona : '' };
  } catch {
    return null;
  }
}

export function statsDir(steamPath: string): string {
  return path.join(steamPath, 'appcache', 'stats');
}

export interface AchievementDef {
  /** Steam API name (unique per game). */
  id: string;
  name: string;
  description: string;
  hidden: boolean;
  icon: string | null;
  iconGray: string | null;
  /** Where unlocks are stored in the stats file: stat id + bit. */
  statId?: string;
  bit?: number;
  /** Progress stat, when the schema defines one. */
  progressStat?: string;
  progressMax?: number;
}

export interface Schema {
  appId: number;
  defs: AchievementDef[];
  /** Stat id → stat name, for progress lookups. */
  statNames: Record<string, string>;
}

const iconUrl = (appId: number, file: string | undefined): string | null =>
  file ? `https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/${appId}/${file}` : null;

function localized(node: BinKvValue | undefined): string {
  if (typeof node === 'string') return node;
  if (!isKv(node)) return '';
  return kvStr(node, 'english') ?? Object.values(node).find((v): v is string => typeof v === 'string' && v !== '') ?? '';
}

/** Parses UserGameStatsSchema_<appid>.bin. Returns null if missing or the game has no achievements. */
export function readSchema(steamPath: string, appId: number): Schema | null {
  let root: BinKv;
  try {
    root = parseBinKv(fs.readFileSync(path.join(statsDir(steamPath), `UserGameStatsSchema_${appId}.bin`)));
  } catch {
    return null;
  }
  const game = kvGet(root, String(appId)) ?? Object.values(root).find(isKv);
  const stats = kvGet(game, 'stats');
  if (!isKv(stats)) return null;

  const defs: AchievementDef[] = [];
  const statNames: Record<string, string> = {};
  for (const [statId, stat] of Object.entries(stats)) {
    if (!isKv(stat)) continue;
    const statName = kvStr(stat, 'name');
    if (statName) statNames[statId] = statName;
    const bits = kvGet(stat, 'bits');
    if (!isKv(bits)) continue;
    for (const [bit, b] of Object.entries(bits)) {
      if (!isKv(b)) continue;
      const id = kvStr(b, 'name');
      if (!id) continue;
      const display = kvGet(b, 'display');
      const progress = kvGet(b, 'progress');
      const progressStat = kvStr(kvGet(progress, 'value'), 'operand1');
      const progressMax = kvNum(progress, 'max_val');
      defs.push({
        id,
        name: localized(kvGet(display, 'name')) || id,
        description: localized(kvGet(display, 'desc')),
        hidden: (kvNum(display, 'hidden') ?? kvNum(b, 'hidden') ?? 0) !== 0,
        icon: iconUrl(appId, kvStr(display, 'icon') ?? kvStr(b, 'icon')),
        iconGray: iconUrl(appId, kvStr(display, 'icon_gray') ?? kvStr(b, 'icon_gray')),
        statId,
        bit: Number(bit),
        progressStat,
        progressMax: progressMax && progressMax > 0 ? progressMax : undefined,
      });
    }
  }
  return defs.length ? { appId, defs, statNames } : null;
}

export interface SteamUnlocks {
  /** Achievement id → unlock time in epoch ms (0 if Steam didn't record one). */
  unlocked: Map<string, number>;
  /** Stat name → value, for progress bars. */
  stats: Map<string, number>;
}

/** Parses UserGameStats_<accountid>_<appid>.bin against its schema. */
export function readUserStats(steamPath: string, accountId: number, schema: Schema): SteamUnlocks {
  const out: SteamUnlocks = { unlocked: new Map(), stats: new Map() };
  let root: BinKv;
  try {
    root = parseBinKv(fs.readFileSync(path.join(statsDir(steamPath), `UserGameStats_${accountId}_${schema.appId}.bin`)));
  } catch {
    return out;
  }
  const cache = kvGet(root, 'cache') ?? root;
  if (!isKv(cache)) return out;

  for (const [statId, entry] of Object.entries(cache)) {
    if (!isKv(entry)) continue;
    const data = kvNum(entry, 'data');
    const name = schema.statNames[statId];
    if (name && data !== undefined) out.stats.set(name, data);
  }
  for (const def of schema.defs) {
    if (def.statId === undefined || def.bit === undefined) continue;
    const entry = kvGet(cache, def.statId);
    const data = kvNum(entry, 'data');
    if (data === undefined || ((data >>> def.bit) & 1) === 0) continue;
    const time = kvNum(kvGet(entry, 'AchievementTimes'), String(def.bit)) ?? 0;
    out.unlocked.set(def.id, time > 0 ? time * 1000 : 0);
  }
  return out;
}

/** App ids that have a cached schema on this PC (games the user has launched through Steam). */
export function listSchemaAppIds(steamPath: string): number[] {
  try {
    return fs
      .readdirSync(statsDir(steamPath))
      .map((f) => /^UserGameStatsSchema_(\d+)\.bin$/i.exec(f)?.[1])
      .filter((v): v is string => !!v)
      .map(Number);
  } catch {
    return [];
  }
}

export interface Playtime {
  minutes: number;
  lastPlayed: number | null;
}

/** Playtime per app from userdata/<accountid>/config/localconfig.vdf. */
export function readPlaytime(steamPath: string, accountId: number): Map<number, Playtime> {
  const out = new Map<number, Playtime>();
  try {
    const root = parseVdf(fs.readFileSync(path.join(steamPath, 'userdata', String(accountId), 'config', 'localconfig.vdf'), 'utf8'));
    let node: VdfObject | string | undefined = vdfGet(root, 'UserLocalConfigStore');
    for (const k of ['Software', 'Valve', 'Steam', 'apps']) node = vdfGet(node, k);
    if (!node || typeof node === 'string') return out;
    for (const [id, app] of Object.entries(node)) {
      if (typeof app === 'string') continue;
      const minutes = Number(vdfGet(app, 'Playtime') ?? 0);
      const last = Number(vdfGet(app, 'LastPlayed') ?? 0);
      if (minutes > 0 || last > 0) out.set(Number(id), { minutes, lastPlayed: last > 0 ? last * 1000 : null });
    }
  } catch {
    // no localconfig
  }
  return out;
}
