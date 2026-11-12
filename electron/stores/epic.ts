import fs from 'node:fs';
import path from 'node:path';

/**
 * Epic Games Launcher: installed games from its own manifest files on this PC (no sign-in).
 * Read-only: ShotCaller never changes anything in the launcher's folders.
 */

export interface EpicGame {
  appName: string;
  name: string;
  namespace: string;
  catalogItemId: string;
  installDir: string;
  exePath?: string;
  sizeBytes?: number;
  /** Not a game (Unreal Engine, plugins, apps). */
  isTool: boolean;
  cover?: string;
  banner?: string;
}

export function defaultEpicDataDir(): string {
  return path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data');
}

/** Manifests folder inside the data folder (or the folder itself when the user picked Manifests). */
function manifestsDir(dataDir: string): string {
  return path.basename(dataDir).toLowerCase() === 'manifests' ? dataDir : path.join(dataDir, 'Manifests');
}

export function epicWatchDir(dataDir: string): string {
  return manifestsDir(dataDir);
}

export function epicFound(dataDir: string): boolean {
  return fs.existsSync(manifestsDir(dataDir));
}

type KeyImage = { type?: string; url?: string };

/** Catalog item id → art, from the launcher's catalog cache (base64 JSON). */
function readArt(dataDir: string): Map<string, { cover?: string; banner?: string }> {
  const out = new Map<string, { cover?: string; banner?: string }>();
  const root = path.basename(dataDir).toLowerCase() === 'manifests' ? path.dirname(dataDir) : dataDir;
  try {
    const raw = fs.readFileSync(path.join(root, 'Catalog', 'catcache.bin'), 'utf8');
    const items = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) as { id?: string; keyImages?: KeyImage[] }[];
    for (const item of Array.isArray(items) ? items : []) {
      if (!item?.id || !Array.isArray(item.keyImages)) continue;
      const pick = (...types: string[]) => {
        for (const t of types) {
          const u = item.keyImages!.find((k) => k.type === t)?.url;
          if (u && u.startsWith('https://')) return u;
        }
        return undefined;
      };
      out.set(item.id, { cover: pick('DieselGameBoxTall', 'OfferImageTall'), banner: pick('DieselGameBox', 'OfferImageWide', 'DieselGameBoxLogo') });
    }
  } catch {
    // no catalog cache
  }
  return out;
}

export function readEpicGames(dataDir: string): EpicGame[] {
  const dir = manifestsDir(dataDir);
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => /\.item$/i.test(f));
  } catch {
    return [];
  }
  const art = readArt(dataDir);
  const out = new Map<string, EpicGame>();
  for (const f of files) {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8').replace(/^\uFEFF/, '')) as Record<string, unknown>;
      const appName = String(m.AppName ?? '');
      const name = String(m.DisplayName ?? '');
      const installDir = String(m.InstallLocation ?? '');
      if (!appName || !name || !installDir || m.bIsIncompleteInstall === true) continue;
      const cats = Array.isArray(m.AppCategories) ? (m.AppCategories as string[]) : [];
      // DLC and add-on content (e.g. "LEGO Fortnite Content") belongs to its main game.
      if (cats.includes('hidden') || cats.includes('addons')) continue;
      const main = String(m.MainGameAppName ?? '');
      if (main && main !== appName) continue;
      if (!fs.existsSync(installDir)) continue;
      const exe = String(m.LaunchExecutable ?? '');
      const namespace = String(m.CatalogNamespace ?? '');
      const catalogItemId = String(m.CatalogItemId ?? '');
      const size = Number(m.InstallSize);
      out.set(appName, {
        appName,
        name: name.replace(/[®™]/g, '').trim(),
        namespace,
        catalogItemId,
        installDir,
        exePath: exe ? path.join(installDir, exe) : undefined,
        sizeBytes: Number.isFinite(size) && size > 0 ? size : undefined,
        isTool: !cats.includes('games') || namespace === 'ue',
        ...art.get(catalogItemId),
      });
    } catch {
      // skip unreadable manifest
    }
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Launch through the Epic launcher (keeps sign-in, cloud saves, anti-cheat). */
export function epicLaunchUri(g: Pick<EpicGame, 'namespace' | 'catalogItemId' | 'appName'>): string {
  return `com.epicgames.launcher://apps/${encodeURIComponent(g.namespace)}%3A${encodeURIComponent(g.catalogItemId)}%3A${encodeURIComponent(g.appName)}?action=launch&silent=true`;
}

export const EPIC_LIBRARY_URI = 'com.epicgames.launcher://store/library';
