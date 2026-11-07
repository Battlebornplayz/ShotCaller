import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Reads the local Steam install: library folders and installed app manifests.
 * Only Steam's own plain-text files are read (libraryfolders.vdf, appmanifest_*.acf, registry.vdf).
 */

export type VdfObject = { [key: string]: string | VdfObject };

/** Minimal parser for Valve's text KeyValues format (VDF / ACF). */
export function parseVdf(text: string): VdfObject {
  const root: VdfObject = {};
  const stack: VdfObject[] = [root];
  let pendingKey: string | null = null;
  let i = 0;
  const n = text.length;

  const readString = (): string => {
    let out = '';
    i++; // opening quote
    while (i < n && text[i] !== '"') {
      if (text[i] === '\\' && i + 1 < n) {
        const next = text[i + 1];
        out += next === 'n' ? '\n' : next === 't' ? '\t' : next;
        i += 2;
      } else {
        out += text[i++];
      }
    }
    i++; // closing quote
    return out;
  };

  while (i < n) {
    const ch = text[i];
    if (ch === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') i++;
    } else if (ch === '"') {
      const s = readString();
      if (pendingKey === null) pendingKey = s;
      else {
        stack[stack.length - 1][pendingKey] = s;
        pendingKey = null;
      }
    } else if (ch === '{') {
      const child: VdfObject = {};
      if (pendingKey !== null) stack[stack.length - 1][pendingKey] = child;
      stack.push(child);
      pendingKey = null;
      i++;
    } else if (ch === '}') {
      if (stack.length > 1) stack.pop();
      pendingKey = null;
      i++;
    } else if (/\s/.test(ch)) {
      i++;
    } else {
      // Unquoted token (rare in Steam files).
      let s = '';
      while (i < n && !/[\s{}"]/.test(text[i])) s += text[i++];
      if (pendingKey === null) pendingKey = s;
      else {
        stack[stack.length - 1][pendingKey] = s;
        pendingKey = null;
      }
    }
  }
  return root;
}

/** Case-insensitive child lookup (Steam isn't consistent about key casing). */
export function vdfGet(obj: VdfObject | string | undefined, key: string): VdfObject | string | undefined {
  if (!obj || typeof obj === 'string') return undefined;
  const lower = key.toLowerCase();
  for (const k of Object.keys(obj)) if (k.toLowerCase() === lower) return obj[k];
  return undefined;
}

function regQuery(key: string, value: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('reg', ['query', key, '/v', value], { windowsHide: true, timeout: 5000 }, (err, stdout) => {
      if (err) return resolve(null);
      const line = stdout.split(/\r?\n/).find((l) => l.trim().startsWith(value));
      const m = line?.match(/REG_\w+\s+(.*)$/);
      resolve(m ? m[1].trim() : null);
    });
  });
}

function exists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

/** Finds the Steam client folder, or null if Steam isn't installed. */
export async function findSteamPath(): Promise<string | null> {
  const candidates: string[] = [];
  if (process.platform === 'win32') {
    const fromReg = await regQuery('HKCU\\Software\\Valve\\Steam', 'SteamPath');
    if (fromReg) candidates.push(path.normalize(fromReg));
    const fromLm = await regQuery('HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath');
    if (fromLm) candidates.push(path.normalize(fromLm));
    candidates.push('C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam');
  } else {
    const home = os.homedir();
    candidates.push(
      path.join(home, '.steam', 'steam'),
      path.join(home, '.local', 'share', 'Steam'),
      path.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
      path.join(home, 'snap', 'steam', 'common', '.local', 'share', 'Steam'),
    );
  }
  for (const c of candidates) {
    if (exists(path.join(c, 'steamapps'))) {
      try {
        return fs.realpathSync(c);
      } catch {
        return c;
      }
    }
  }
  return null;
}

/** All Steam library folders (each contains a steamapps/ folder). */
export function readLibraryFolders(steamPath: string): string[] {
  const folders = new Set<string>([steamPath]);
  const file = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');
  try {
    const root = parseVdf(fs.readFileSync(file, 'utf8'));
    const list = vdfGet(root, 'libraryfolders');
    if (list && typeof list !== 'string') {
      for (const entry of Object.values(list)) {
        // New format: { "path": "..." }; old format: "1" "D:\\SteamLibrary".
        const p = typeof entry === 'string' ? entry : vdfGet(entry, 'path');
        if (typeof p === 'string' && p) folders.add(path.normalize(p));
      }
    }
  } catch {
    // No libraryfolders.vdf: just the main folder.
  }
  return [...folders].filter((f) => exists(path.join(f, 'steamapps')));
}

export interface SteamApp {
  appId: number;
  name: string;
  installDir: string;
  /** Fully installed (StateFlags has the "fully installed" bit). */
  installed: boolean;
}

/** Steam's own runtimes, redistributables and tools: not games. */
const TOOL_APP_IDS = new Set([228980, 1070560, 1391110, 1628350, 1493710, 2180100, 1826330, 1887720, 2348590, 2805730, 250820, 1245040, 1580130]);
const TOOL_NAME = /^(Proton\b|Steam Linux Runtime|Steamworks Common|SteamVR|Steam Audio|Wallpaper Engine)/i;

export function readInstalledApps(libraryFolders: string[]): SteamApp[] {
  const apps = new Map<number, SteamApp>();
  for (const folder of libraryFolders) {
    const steamapps = path.join(folder, 'steamapps');
    let files: string[];
    try {
      files = fs.readdirSync(steamapps).filter((f) => /^appmanifest_\d+\.acf$/i.test(f));
    } catch {
      continue;
    }
    for (const f of files) {
      try {
        const state = vdfGet(parseVdf(fs.readFileSync(path.join(steamapps, f), 'utf8')), 'AppState');
        const appId = Number(vdfGet(state, 'appid'));
        const name = vdfGet(state, 'name');
        const dir = vdfGet(state, 'installdir');
        if (!appId || typeof name !== 'string' || typeof dir !== 'string') continue;
        if (TOOL_APP_IDS.has(appId) || TOOL_NAME.test(name)) continue;
        const flags = Number(vdfGet(state, 'StateFlags') ?? 0);
        apps.set(appId, {
          appId,
          name,
          installDir: path.join(steamapps, 'common', dir),
          installed: (flags & 4) === 4,
        });
      } catch {
        // Skip unreadable manifests.
      }
    }
  }
  return [...apps.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The Steam app currently running, from Steam's own "RunningAppID" value
 * (registry on Windows, registry.vdf on Linux). 0 when nothing is running.
 * On Windows the process watcher reads this itself; this is used on Linux.
 */
export function readRunningAppIdLinux(): number {
  const home = os.homedir();
  for (const p of [path.join(home, '.steam', 'registry.vdf'), path.join(home, '.steam', 'steam', 'registry.vdf')]) {
    try {
      const root = parseVdf(fs.readFileSync(p, 'utf8'));
      let node: VdfObject | string | undefined = root;
      for (const k of ['Registry', 'HKCU', 'Software', 'Valve', 'Steam']) node = vdfGet(node, k);
      const v = vdfGet(node, 'RunningAppID');
      if (typeof v === 'string') return Number(v) || 0;
    } catch {
      // try next
    }
  }
  return 0;
}
