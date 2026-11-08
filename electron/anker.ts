import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Games installed through the Anker Games launcher, read from its own library file.
 * Read-only: ShotCaller never downloads, installs or changes anything there.
 */

export interface AnkerGame {
  id: string;
  title: string;
  installDir: string;
  /** Exe the launcher starts, when it recorded one. */
  exePath?: string;
  steamAppId?: number;
  poster?: string;
}

export function ankerLibraryFile(): string {
  const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'net.ankergames.launcher', 'library.json');
}

/** Strips Windows' long-path prefix (\\?\). */
const cleanPath = (p: string) => p.replace(/^\\\\\?\\/, '');

/** Exe files that are never the game itself. */
const NOT_GAME = /^(unins\d*|uninstall|crashhandler|crashreport|unitycrashhandler(32|64)?|vc_?redist.*|dxsetup|dxwebsetup|ue4prereqsetup.*|setup|launcher_helper|easyanticheat.*|notification_helper)\.exe$/i;

/** Largest .exe up to two folders deep, skipping helpers. */
function guessExe(root: string): string | undefined {
  let best: { p: string; size: number } | undefined;
  const walk = (dir: string, depth: number) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory() && depth < 2 && !/^(redist|_commonredist|directx|engine)$/i.test(e.name)) walk(full, depth + 1);
      else if (e.isFile() && /\.exe$/i.test(e.name) && !NOT_GAME.test(e.name)) {
        try {
          const size = fs.statSync(full).size;
          if (!best || size > best.size) best = { p: full, size };
        } catch {
          // skip
        }
      }
    }
  };
  walk(root, 0);
  return best?.p;
}

export function readAnkerLibrary(): AnkerGame[] {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(ankerLibraryFile(), 'utf8'));
  } catch {
    return [];
  }
  const games = (raw as { games?: Record<string, Record<string, unknown>> })?.games;
  if (!games || typeof games !== 'object') return [];
  const out: AnkerGame[] = [];
  for (const [id, g] of Object.entries(games)) {
    if (!g || typeof g !== 'object') continue;
    const title = typeof g.title === 'string' ? g.title : null;
    const root = typeof g.root === 'string' ? cleanPath(g.root) : null;
    if (!title || !root || !fs.existsSync(root)) continue;
    const source = (g.source as { source?: { steam_app_id?: unknown } } | undefined)?.source;
    const steamAppId = Number(source?.steam_app_id ?? g.steam_app_id);
    const exe = typeof g.executable === 'string' && g.executable ? cleanPath(g.executable) : undefined;
    const exePath = exe ? (path.isAbsolute(exe) ? exe : path.join(root, exe)) : guessExe(root);
    out.push({
      id,
      title,
      installDir: root,
      exePath: exePath && fs.existsSync(exePath) ? exePath : undefined,
      steamAppId: Number.isInteger(steamAppId) && steamAppId > 0 ? steamAppId : undefined,
      poster: typeof g.poster === 'string' && g.poster.startsWith('https://') ? g.poster : undefined,
    });
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}
