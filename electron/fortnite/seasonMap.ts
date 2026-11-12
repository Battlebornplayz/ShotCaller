import { app, nativeImage, net } from 'electron';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { MapLocator, bgraToGrey, type GreyImage } from '../../shared/fortniteMap';
import type { FnPlace } from '../../shared/fortnite';

/**
 * The season map from fortnite-api.com (public, no key): `map.png` (plain, used for matching) and
 * `map_en.png` (with place names, shown to you). Kept in userData/fortnite/map/<id>/, where the id comes from
 * the server's last-modified date, so a new season's map is noticed and downloaded by itself; older maps stay
 * so their pins can be shown in the archive. Checked at most every 6 hours.
 */

const BLANK_URL = 'https://fortnite-api.com/images/map.png';
const NAMES_URL = 'https://fortnite-api.com/images/map_en.png';
const PLACES_URL = 'https://fortnite-api.com/v1/map';
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

export interface SeasonMapStatus {
  status: 'none' | 'loading' | 'ready' | 'error';
  id: string | null;
  error: string | null;
  fetchedAt: number | null;
}

interface Meta {
  id: string;
  lastModified: string | null;
  fetchedAt: number;
}

const root = () => path.join(app.getPath('userData'), 'fortnite', 'map');
const metaFile = () => path.join(root(), 'current.json');

let status: SeasonMapStatus = { status: 'none', id: null, error: null, fetchedAt: null };
let locator: MapLocator | null = null;
/** The plain season map in grey (2048), for the full-map (M) matcher. */
let grey: GreyImage | null = null;
let namesDataUrl: string | null = null;
let checking: Promise<void> | null = null;
const listeners = new Set<(s: SeasonMapStatus) => void>();

export function getSeasonMapStatus(): SeasonMapStatus {
  return status;
}

export function onSeasonMap(fn: (s: SeasonMapStatus) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function set(next: Partial<SeasonMapStatus>): void {
  status = { ...status, ...next };
  for (const fn of listeners) fn(status);
}

/** The locator for the current map, or null until it's loaded. */
export function getLocator(): MapLocator | null {
  return locator;
}

export function getSeasonMapGrey(): GreyImage | null {
  return grey;
}

/** Named places on the current map (map px), for drop stats. Empty until fetched. */
let places: FnPlace[] = [];
export function getPlaces(): FnPlace[] {
  return places;
}

/**
 * Game-world position (cm) -> map px. Fitted from the place names drawn on Fortnite's full map against the
 * public place list (12 places, every one within 1 px): 1 map px = 1.46 m on both axes. Measured on Crossbones
 * Isle (Nov 2026); a new island may need a new fit (places that land off the island show it).
 */
const WORLD_TO_MAP = { ax: 0.0068521, bx: 968.53, ay: 0.0068484, by: 1018.33 };

async function loadPlaces(dir: string, fetchIfMissing: boolean): Promise<void> {
  const file = path.join(dir, 'places.json');
  try {
    places = JSON.parse(await fsp.readFile(file, 'utf8')) as FnPlace[];
    return;
  } catch {
    places = [];
  }
  if (!fetchIfMissing) return;
  try {
    const res = await net.fetch(PLACES_URL);
    if (!res.ok) return;
    const body = (await res.json()) as { data?: { pois?: { name?: string; id?: string; location?: { x?: number; y?: number } }[] } };
    const list: FnPlace[] = [];
    for (const p of body.data?.pois ?? []) {
      // Named places only (not landmarks or unnamed spots).
      if (!p.name || !p.location || !/POI\.Generic/i.test(p.id ?? '')) continue;
      const x = Number(p.location.x) * WORLD_TO_MAP.ax + WORLD_TO_MAP.bx;
      const y = Number(p.location.y) * WORLD_TO_MAP.ay + WORLD_TO_MAP.by;
      if (Number.isFinite(x) && Number.isFinite(y) && x > 0 && y > 0 && x < 2048 && y < 2048) list.push({ name: p.name, x: Math.round(x), y: Math.round(y) });
    }
    places = list;
    await fsp.writeFile(file, JSON.stringify(list));
  } catch {
    // Drop stats by place wait for the next try.
  }
}

/** The map with place names, as a data URL for the renderer (about 3 MB, sent once per window). */
export function getMapImage(): string | null {
  return namesDataUrl;
}

const idFrom = (lastModified: string | null, size: number) => {
  const t = lastModified ? Date.parse(lastModified) : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) + `-${size}` : `size-${size}`;
};

async function readMeta(): Promise<Meta | null> {
  try {
    return JSON.parse(await fsp.readFile(metaFile(), 'utf8')) as Meta;
  } catch {
    return null;
  }
}

async function load(id: string): Promise<void> {
  const dir = path.join(root(), id);
  const blank = nativeImage.createFromPath(path.join(dir, 'map.png'));
  const names = nativeImage.createFromPath(path.join(dir, 'map_en.png'));
  if (blank.isEmpty() || names.isEmpty()) throw new Error('The saved map pictures could not be opened.');
  const { width, height } = blank.getSize();
  // Building the matcher's map levels takes a moment; let the event loop breathe first.
  await new Promise((r) => setTimeout(r, 0));
  grey = bgraToGrey(new Uint8Array(blank.toBitmap()), width, height);
  locator = new MapLocator(grey);
  namesDataUrl = names.toDataURL();
  await loadPlaces(dir, true);
}

async function download(url: string, file: string): Promise<void> {
  const res = await net.fetch(url);
  if (!res.ok) throw new Error(`The map service answered ${res.status}.`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fsp.writeFile(`${file}.tmp`, buf);
  await fsp.rename(`${file}.tmp`, file);
}

async function check(force: boolean): Promise<void> {
  const meta = await readMeta();
  // Use what's saved straight away; look for a newer map in the background.
  if (meta && !locator) {
    try {
      await load(meta.id);
      set({ status: 'ready', id: meta.id, fetchedAt: meta.fetchedAt, error: null });
    } catch {
      // Fall through to a fresh download.
    }
  }
  if (!force && meta && locator && Date.now() - meta.fetchedAt < CHECK_EVERY_MS) return;
  if (!locator) set({ status: 'loading', error: null });
  try {
    const head = await net.fetch(BLANK_URL, { method: 'HEAD' });
    if (!head.ok) throw new Error(`The map service answered ${head.status}.`);
    const id = idFrom(head.headers.get('last-modified'), Number(head.headers.get('content-length') ?? 0));
    if (meta?.id !== id || !locator) {
      const dir = path.join(root(), id);
      await fsp.mkdir(dir, { recursive: true });
      await download(BLANK_URL, path.join(dir, 'map.png'));
      await download(NAMES_URL, path.join(dir, 'map_en.png'));
      await load(id);
    }
    const next: Meta = { id, lastModified: head.headers.get('last-modified'), fetchedAt: Date.now() };
    await fsp.writeFile(metaFile(), JSON.stringify(next));
    set({ status: 'ready', id, fetchedAt: next.fetchedAt, error: null });
  } catch (err) {
    if (locator) return; // Keep using the saved map; try again next time.
    set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
  }
}

/** Loads the saved map and checks for a newer one (at most every 6 hours unless forced). */
export function ensureSeasonMap(force = false): Promise<void> {
  if (!checking) {
    checking = check(force).finally(() => {
      checking = null;
    });
  }
  return checking;
}
