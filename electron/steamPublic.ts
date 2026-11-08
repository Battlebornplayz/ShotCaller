import { app, net } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { SteamAppMatch } from '../shared/types';
import type { AchievementDef } from './steamLocal';

/**
 * Steam's public, keyless endpoints: global rarity, the public achievement page (for games
 * Steam hasn't cached locally), store search and app names. Responses are cached in userData.
 */

const DAY = 24 * 60 * 60 * 1000;

function cacheFile(name: string): string {
  return path.join(app.getPath('userData'), 'cache', 'steam', name);
}

function readCache<T>(name: string, maxAge: number): T | null {
  try {
    const f = cacheFile(name);
    if (Date.now() - fs.statSync(f).mtimeMs > maxAge) return null;
    return JSON.parse(fs.readFileSync(f, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** Any age, for when the network is down. */
function readStale<T>(name: string): T | null {
  return readCache<T>(name, Number.MAX_SAFE_INTEGER);
}

function writeCache(name: string, value: unknown): void {
  try {
    fs.mkdirSync(path.dirname(cacheFile(name)), { recursive: true });
    fs.writeFileSync(cacheFile(name), JSON.stringify(value), 'utf8');
  } catch (err) {
    console.error('Could not write Steam cache:', err);
  }
}

async function get(url: string): Promise<string> {
  const res = await net.fetch(url, { headers: { 'Accept-Language': 'en-US,en;q=0.8' } });
  if (!res.ok) throw new Error(`Steam returned ${res.status}`);
  return res.text();
}

/** Coalesces concurrent requests for the same key. */
const inflight = new Map<string, Promise<unknown>>();
function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

// ---------- Global rarity ----------

/** Achievement id → percent of players who have it. */
export function fetchRarity(appId: number): Promise<Record<string, number>> {
  const name = `rarity_${appId}.json`;
  const fresh = readCache<Record<string, number>>(name, DAY);
  if (fresh) return Promise.resolve(fresh);
  return once(name, async () => {
    try {
      const text = await get(`https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${appId}`);
      const list = (JSON.parse(text) as { achievementpercentages?: { achievements?: { name: string; percent: number | string }[] } })
        .achievementpercentages?.achievements;
      const out: Record<string, number> = {};
      for (const a of list ?? []) {
        const pct = Number(a.percent);
        if (typeof a.name === 'string' && Number.isFinite(pct)) out[a.name] = Math.round(pct * 10) / 10;
      }
      writeCache(name, out);
      return out;
    } catch {
      return readStale<Record<string, number>>(name) ?? {};
    }
  });
}

// ---------- Public achievement page ----------

export interface PublicAchievements {
  defs: AchievementDef[];
  rarity: Record<string, number>;
}

/** Collects every JSON value embedded in the page, parsing JSON-in-strings as it goes. */
function walkJson(value: unknown, visit: (v: Record<string, unknown>) => void, depth = 0): void {
  if (depth > 40 || value === null) return;
  if (typeof value === 'string') {
    const t = value.trimStart();
    if ((t.startsWith('{') || t.startsWith('[')) && value.length > 20 && /api_name|percentages/.test(value)) {
      try {
        walkJson(JSON.parse(value), visit, depth + 1);
      } catch {
        // not JSON
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) walkJson(v, visit, depth + 1);
    return;
  }
  if (typeof value === 'object') {
    visit(value as Record<string, unknown>);
    for (const v of Object.values(value)) walkJson(v, visit, depth + 1);
  }
}

export function parseAchievementPage(html: string, appId: number): PublicAchievements {
  const byKey = new Map<number, AchievementDef>();
  const pctByKey: Record<string, number> = {};
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).filter((s) => s.includes('api_name'));
  for (const script of scripts) {
    let data: unknown;
    try {
      data = JSON.parse(script.trim());
    } catch {
      const m = /JSON\.parse\(("(?:[^"\\]|\\.)*")\)/.exec(script);
      if (!m) continue;
      try {
        data = JSON.parse(JSON.parse(m[1]) as string);
      } catch {
        continue;
      }
    }
    walkJson(data, (o) => {
      if (typeof o.api_name === 'string' && typeof o.name === 'string') {
        const key = Number(o.internal_key);
        const icon = typeof o.icon_achieved === 'string' ? o.icon_achieved : undefined;
        const gray = typeof o.icon_unachieved === 'string' ? o.icon_unachieved : undefined;
        const url = (f?: string) => (f ? `https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/${appId}/${f}` : null);
        if (!byKey.has(key) && o.archived !== true) {
          byKey.set(key, {
            id: o.api_name,
            name: o.name,
            description: typeof o.description === 'string' ? o.description : '',
            hidden: o.hidden === true,
            icon: url(icon),
            iconGray: url(gray),
          });
        }
      }
      if (o.percentages && typeof o.percentages === 'object' && !Array.isArray(o.percentages)) {
        for (const [k, v] of Object.entries(o.percentages as Record<string, unknown>)) {
          if (typeof v === 'number') pctByKey[k] = Math.round(v * 10) / 10;
        }
      }
    });
  }
  const rarity: Record<string, number> = {};
  for (const [key, def] of byKey) if (pctByKey[key] !== undefined) rarity[def.id] = pctByKey[key];
  return { defs: [...byKey.values()], rarity };
}

/** The achievement list of any Steam game from its public community page. */
export function fetchPublicAchievements(appId: number): Promise<PublicAchievements> {
  const name = `public_${appId}.json`;
  const fresh = readCache<PublicAchievements>(name, 7 * DAY);
  if (fresh) return Promise.resolve(fresh);
  return once(name, async () => {
    try {
      const parsed = parseAchievementPage(await get(`https://steamcommunity.com/stats/${appId}/achievements/?l=english`), appId);
      if (parsed.defs.length) writeCache(name, parsed);
      return parsed;
    } catch (err) {
      const stale = readStale<PublicAchievements>(name);
      if (stale) return stale;
      throw err;
    }
  });
}

// ---------- Store search and names ----------

export async function searchSteamApps(term: string): Promise<SteamAppMatch[]> {
  const q = term.trim().slice(0, 100);
  if (!q) return [];
  if (/^\d{2,8}$/.test(q)) {
    const name = await fetchAppName(Number(q));
    return name ? [{ appId: Number(q), name, image: `https://cdn.akamai.steamstatic.com/steam/apps/${q}/capsule_231x87.jpg` }] : [];
  }
  const text = await get(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&cc=us&l=english`);
  const items = (JSON.parse(text) as { items?: { type: string; id: number; name: string; tiny_image?: string }[] }).items ?? [];
  return items
    .filter((i) => i.type === 'app' && Number.isInteger(i.id))
    .slice(0, 10)
    .map((i) => ({ appId: i.id, name: i.name, image: i.tiny_image ?? null }));
}

const NAMES_FILE = 'app_names.json';
let names: Record<string, string> | null = null;

export function cachedAppName(appId: number): string | undefined {
  names ??= readStale<Record<string, string>>(NAMES_FILE) ?? {};
  return names[appId];
}

/** Store name for an app id (cached forever). */
export function fetchAppName(appId: number): Promise<string | null> {
  const known = cachedAppName(appId);
  if (known) return Promise.resolve(known);
  return once(`name_${appId}`, async () => {
    try {
      const text = await get(`https://store.steampowered.com/api/appdetails?appids=${appId}&filters=basic`);
      const entry = (JSON.parse(text) as Record<string, { success?: boolean; data?: { name?: string } }>)[appId];
      const name = entry?.success ? entry.data?.name : undefined;
      if (!name) return null;
      names![appId] = name;
      writeCache(NAMES_FILE, names);
      return name;
    } catch {
      return null;
    }
  });
}
