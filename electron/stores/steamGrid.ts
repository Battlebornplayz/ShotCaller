import { app, net, safeStorage } from 'electron';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

/**
 * SteamGridDB art for games the stores have no art for. Optional: the user pastes a free API key,
 * kept encrypted in userData (never in settings, logs or the repo), like the Fortnite key.
 */

let apiKey: string | null | undefined;

const keyFile = () => path.join(app.getPath('userData'), 'steamgriddb', 'key.bin');
const cacheFile = () => path.join(app.getPath('userData'), 'cache', 'steamgriddb.json');

function readKey(): string | null {
  if (apiKey !== undefined) return apiKey;
  try {
    const raw = fs.readFileSync(keyFile());
    apiKey = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf8');
  } catch {
    apiKey = null;
  }
  return apiKey;
}

export function hasSteamGridKey(): boolean {
  return !!readKey();
}

export async function setSteamGridKey(key: string | null): Promise<{ ok: boolean; error?: string }> {
  const k = key?.trim() ?? '';
  if (!k) {
    apiKey = null;
    await fsp.rm(keyFile(), { force: true });
    return { ok: true };
  }
  if (!/^[a-f0-9]{32}$/i.test(k)) return { ok: false, error: 'That doesn’t look like a SteamGridDB key (32 letters and numbers).' };
  // Check it works before saving.
  try {
    const res = await net.fetch('https://www.steamgriddb.com/api/v2/search/autocomplete/portal', { headers: { Authorization: `Bearer ${k}` } });
    if (res.status === 401 || res.status === 403) return { ok: false, error: 'SteamGridDB says that key isn’t valid.' };
  } catch {
    return { ok: false, error: 'Couldn’t reach SteamGridDB. Check your connection and try again.' };
  }
  await fsp.mkdir(path.dirname(keyFile()), { recursive: true });
  await fsp.writeFile(keyFile(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(k) : Buffer.from(k, 'utf8'));
  apiKey = k;
  return { ok: true };
}

export interface GridArt {
  cover?: string;
  banner?: string;
}

let cache: Record<string, GridArt> | null = null;
function loadCache(): Record<string, GridArt> {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(cacheFile(), 'utf8')) as Record<string, GridArt>;
  } catch {
    cache = {};
  }
  return cache;
}

export function cachedGridArt(name: string): GridArt | undefined {
  return loadCache()[name.toLowerCase()];
}

async function api<T>(url: string): Promise<T | null> {
  const k = readKey();
  if (!k) return null;
  const res = await net.fetch(`https://www.steamgriddb.com/api/v2/${url}`, { headers: { Authorization: `Bearer ${k}` } });
  if (!res.ok) return null;
  const body = (await res.json()) as { success?: boolean; data?: T };
  return body.success ? (body.data ?? null) : null;
}

/** Looks a game up by name and stores its best cover and wide art. Null without a key. */
export async function fetchGridArt(name: string): Promise<GridArt | null> {
  if (!readKey()) return null;
  const c = loadCache();
  const id = name.toLowerCase();
  if (c[id]) return c[id];
  try {
    const hits = await api<{ id: number; name: string }[]>(`search/autocomplete/${encodeURIComponent(name)}`);
    const game = hits?.[0];
    const art: GridArt = {};
    if (game) {
      const grids = await api<{ url: string }[]>(`grids/game/${game.id}?dimensions=600x900&types=static`);
      const heroes = await api<{ url: string }[]>(`heroes/game/${game.id}?types=static`);
      art.cover = grids?.[0]?.url;
      art.banner = heroes?.[0]?.url;
    }
    c[id] = art;
    await fsp.mkdir(path.dirname(cacheFile()), { recursive: true });
    await fsp.writeFile(cacheFile(), JSON.stringify(c), 'utf8');
    return art;
  } catch {
    return null;
  }
}
