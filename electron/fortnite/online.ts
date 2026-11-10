import { app, net, Notification, safeStorage } from 'electron';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import type { FnShopItem, FnShopState, FnStatBlock, FnStats, FnStatsState } from '../../shared/fortnite';
import { getSettings } from '../settings';
import { APP_ICON } from '../windows';

/**
 * fortnite-api.com: your stats (needs your own free key) and the item shop (public). The key is a secret: it
 * lives only in userData/fortnite/key.bin, encrypted with Windows' own protection when available, and is never
 * logged, sent to the renderer or put in settings.
 */

const API = 'https://fortnite-api.com';
const keyFile = () => path.join(app.getPath('userData'), 'fortnite', 'key.bin');
const STATS_MAX_AGE_MS = 5 * 60 * 1000;
const SHOP_CHECK_MS = 30 * 60 * 1000;

let apiKey: string | null = null;
let stats: FnStatsState = { hasKey: false, status: 'idle', error: null, stats: null };
let shop: FnShopState = { status: 'idle', error: null, date: null, items: [], wished: [] };
let alertedFor = '';
const statsListeners = new Set<(s: FnStatsState) => void>();
const shopListeners = new Set<(s: FnShopState) => void>();

// ---------- Key ----------

function loadKey(): void {
  try {
    const raw = fs.readFileSync(keyFile());
    apiKey = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf8');
  } catch {
    apiKey = null;
  }
  stats = { ...stats, hasKey: !!apiKey };
}

/** Saves (or with an empty string, removes) the key. Checks its shape only; the first stats call checks it for real. */
export async function setApiKey(key: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const k = key.trim();
  if (!k) {
    apiKey = null;
    await fsp.rm(keyFile(), { force: true });
    setStats({ hasKey: false, stats: null, status: 'idle', error: null });
    return { ok: true };
  }
  if (!/^[\w-]{8,100}$/.test(k)) return { ok: false, error: 'That doesn’t look like a fortnite-api.com key (letters, numbers and dashes).' };
  await fsp.mkdir(path.dirname(keyFile()), { recursive: true });
  await fsp.writeFile(keyFile(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(k) : Buffer.from(k, 'utf8'));
  apiKey = k;
  setStats({ hasKey: true, error: null });
  void refreshStats(true);
  return { ok: true };
}

// ---------- Stats ----------

export function getStats(): FnStatsState {
  return stats;
}

export function onStats(fn: (s: FnStatsState) => void): () => void {
  statsListeners.add(fn);
  return () => statsListeners.delete(fn);
}

function setStats(patch: Partial<FnStatsState>): void {
  stats = { ...stats, ...patch };
  for (const fn of statsListeners) fn(stats);
}

type Raw = Record<string, unknown>;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function block(raw: unknown): FnStatBlock | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Raw;
  return {
    matches: num(r.matches),
    wins: num(r.wins),
    kills: num(r.kills),
    kd: num(r.kd),
    winRate: num(r.winRate),
    // Solo reports top 10, duo top 5, squad top 3: take the closest the mode has.
    top10: num(r.top10) || num(r.top5) || num(r.top3),
    minutesPlayed: num(r.minutesPlayed),
  };
}

function blocks(all: unknown): Record<string, FnStatBlock> {
  const out: Record<string, FnStatBlock> = {};
  if (!all || typeof all !== 'object') return out;
  for (const [mode, v] of Object.entries(all as Raw)) {
    const b = block(v);
    if (b) out[mode] = b;
  }
  return out;
}

async function call(window: 'season' | 'lifetime', name: string): Promise<Raw> {
  const url = `${API}/v2/stats/br/v2?name=${encodeURIComponent(name)}&timeWindow=${window}`;
  const res = await net.fetch(url, { headers: { Authorization: apiKey ?? '' } });
  const body = (await res.json().catch(() => null)) as { status?: number; error?: string; data?: Raw } | null;
  if (res.status === 401) throw new Error('The key wasn’t accepted. Check it on fortnite-api.com and paste it again.');
  if (res.status === 403) throw new Error('Your stats are private. In Fortnite: Settings → Account and Privacy → Show on career leaderboard → On.');
  if (res.status === 404) throw new Error(`No Epic account called “${name}” was found.`);
  if (!res.ok || !body?.data) throw new Error(body?.error ?? `The stats service answered ${res.status}.`);
  return body.data;
}

/** Fetches season and lifetime stats (cached for 5 minutes unless forced). */
export async function refreshStats(force = false): Promise<FnStatsState> {
  const name = getSettings().fortnite.epicName;
  if (!apiKey) return stats;
  if (!name) {
    setStats({ status: 'error', error: 'Type your Epic name first.' });
    return stats;
  }
  if (!force && stats.stats && stats.stats.name.toLowerCase() === name.toLowerCase() && Date.now() - stats.stats.fetchedAt < STATS_MAX_AGE_MS) return stats;
  setStats({ status: 'loading', error: null });
  try {
    const [season, lifetime] = await Promise.all([call('season', name), call('lifetime', name)]);
    const bp = season.battlePass as Raw | undefined;
    const sStats = (season.stats as Raw | undefined)?.all;
    const lStats = (lifetime.stats as Raw | undefined)?.all;
    const next: FnStats = {
      name: String((season.account as Raw | undefined)?.name ?? name),
      battlePass: bp ? { level: num(bp.level), progress: num(bp.progress) } : null,
      season: blocks(sStats),
      lifetime: blocks(lStats),
      fetchedAt: Date.now(),
    };
    setStats({ status: 'ready', stats: next, error: null });
  } catch (err) {
    setStats({ status: 'error', error: err instanceof Error ? err.message : String(err) });
  }
  return stats;
}

// ---------- Item shop ----------

export function getShop(): FnShopState {
  return shop;
}

export function onShop(fn: (s: FnShopState) => void): () => void {
  shopListeners.add(fn);
  return () => shopListeners.delete(fn);
}

function setShop(patch: Partial<FnShopState>): void {
  shop = { ...shop, ...patch };
  for (const fn of shopListeners) fn(shop);
}

function toItem(r: Raw, price: number): FnShopItem | null {
  if (typeof r.id !== 'string' || typeof r.name !== 'string') return null;
  const images = (r.images ?? {}) as Raw;
  const type = (r.type ?? {}) as Raw;
  const rarity = (r.rarity ?? {}) as Raw;
  return {
    id: r.id,
    name: r.name,
    type: String(type.displayValue ?? ''),
    rarity: String(rarity.value ?? ''),
    price,
    image: (typeof images.smallIcon === 'string' ? images.smallIcon : typeof images.icon === 'string' ? images.icon : null) as string | null,
  };
}

/** Marks wishlisted items in the shop and, once per shop day, tells you about them. */
function checkWishlist(): void {
  const ids = new Set(getSettings().fortnite.wishlist.map((w) => w.id));
  const wished = shop.items.filter((i) => ids.has(i.id));
  setShop({ wished });
  const sig = `${shop.date}:${wished.map((w) => w.id).join(',')}`;
  if (wished.length && sig !== alertedFor && Notification.isSupported()) {
    alertedFor = sig;
    new Notification({
      title: 'On your wishlist, in the shop today',
      body: wished.map((w) => `${w.name} (${w.price} V-Bucks)`).join(', '),
      icon: APP_ICON,
    }).show();
  }
}

export async function refreshShop(): Promise<FnShopState> {
  setShop({ status: shop.items.length ? shop.status : 'loading', error: null });
  try {
    const res = await net.fetch(`${API}/v2/shop`);
    const body = (await res.json()) as { data?: { date?: string; entries?: Raw[] } };
    if (!res.ok || !body.data) throw new Error(`The shop service answered ${res.status}.`);
    const byId = new Map<string, FnShopItem>();
    for (const e of body.data.entries ?? []) {
      for (const r of (e.brItems as Raw[] | undefined) ?? []) {
        const item = toItem(r, num(e.finalPrice));
        if (item && !byId.has(item.id)) byId.set(item.id, item);
      }
    }
    setShop({ status: 'ready', date: body.data.date ?? null, items: [...byId.values()] });
    checkWishlist();
  } catch (err) {
    setShop({ status: 'error', error: err instanceof Error ? err.message : String(err) });
  }
  return shop;
}

/** Cosmetics whose name contains `q`, for adding to the wishlist (public, no key). */
export async function searchCosmetics(q: string): Promise<FnShopItem[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  try {
    const res = await net.fetch(`${API}/v2/cosmetics/br/search/all?name=${encodeURIComponent(term)}&matchMethod=contains`);
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: Raw[] };
    return (body.data ?? []).slice(0, 30).map((r) => toItem(r, 0)).filter((i): i is FnShopItem => !!i);
  } catch {
    return [];
  }
}

let shopTimer: NodeJS.Timeout | null = null;

export function initOnline(): void {
  loadKey();
  void refreshShop();
  shopTimer = setInterval(() => void refreshShop(), SHOP_CHECK_MS);
}

/** The wishlist changed in settings: check it against today's shop again. */
export function wishlistChanged(): void {
  if (shop.items.length) checkWishlist();
}

export function disposeOnline(): void {
  if (shopTimer) clearInterval(shopTimer);
  shopTimer = null;
}
