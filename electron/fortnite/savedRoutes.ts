import { app } from 'electron';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import type { FnSavedRoute, FnStop } from '../../shared/fortnite';
import { cleanStops } from '../../shared/fortniteRoute';
import { getSeasonMapStatus } from './seasonMap';

/** Named routes you saved to reuse, kept in userData/fortnite/saved-routes.json. */

const MAX_SAVED = 40;
const file = () => path.join(app.getPath('userData'), 'fortnite', 'saved-routes.json');

let saved: FnSavedRoute[] | null = null;

function load(): FnSavedRoute[] {
  if (saved) return saved;
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8')) as unknown;
    saved = (Array.isArray(raw) ? raw : []).flatMap((r: Partial<FnSavedRoute>) => {
      const stops = cleanStops(r?.stops);
      return typeof r?.id === 'string' && typeof r.name === 'string' && stops.length ? [{ id: r.id, name: r.name.slice(0, 40), mapId: r.mapId ?? null, stops, savedAt: Number(r.savedAt) || 0 }] : [];
    });
  } catch {
    saved = [];
  }
  return saved;
}

async function write(): Promise<void> {
  try {
    await fsp.mkdir(path.dirname(file()), { recursive: true });
    await fsp.writeFile(file(), JSON.stringify(saved ?? []));
  } catch (err) {
    console.error('[fortnite] could not save the routes:', err);
  }
}

export function listSavedRoutes(): FnSavedRoute[] {
  return [...load()].sort((a, b) => b.savedAt - a.savedAt);
}

/** Saves a route under a name; saving the same name again replaces it. */
export async function saveNamedRoute(name: string, stops: FnStop[]): Promise<FnSavedRoute[]> {
  const clean = name.trim().slice(0, 40);
  if (!clean || !stops.length) return listSavedRoutes();
  const list = load();
  const entry: FnSavedRoute = { id: `r${Date.now().toString(36)}`, name: clean, mapId: getSeasonMapStatus().id, stops, savedAt: Date.now() };
  const i = list.findIndex((r) => r.name.toLowerCase() === clean.toLowerCase());
  if (i >= 0) list[i] = { ...entry, id: list[i].id };
  else list.push(entry);
  saved = list.sort((a, b) => b.savedAt - a.savedAt).slice(0, MAX_SAVED);
  await write();
  return listSavedRoutes();
}

export async function deleteSavedRoute(id: string): Promise<FnSavedRoute[]> {
  saved = load().filter((r) => r.id !== id);
  await write();
  return listSavedRoutes();
}
