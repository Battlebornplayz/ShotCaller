import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Local achievement files written by Steam emulators that ship with non-Steam game copies
 * (Goldberg / GSE, CODEX / RUNE, OnlineFix). Read-only: ShotCaller never writes them.
 * The user opted into this in Phase 5 (DESIGN.md, Phase 5 decisions).
 */

export interface EmuRoot {
  dir: string;
  /** Relative path inside <dir>/<appid>/ to the achievement file. */
  files: string[];
  format: 'json' | 'ini';
}

export function emulatorRoots(): EmuRoot[] {
  const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
  const pub = process.env.PUBLIC ?? 'C:\\Users\\Public';
  const docs = path.join(pub, 'Documents');
  const roots: EmuRoot[] = [
    { dir: path.join(appData, 'GSE Saves'), files: ['achievements.json'], format: 'json' },
    { dir: path.join(appData, 'Goldberg SteamEmu Saves'), files: ['achievements.json'], format: 'json' },
    { dir: path.join(docs, 'Steam', 'CODEX'), files: ['achievements.ini'], format: 'ini' },
    { dir: path.join(docs, 'Steam', 'RUNE'), files: ['achievements.ini'], format: 'ini' },
    { dir: path.join(appData, 'Steam', 'CODEX'), files: ['achievements.ini'], format: 'ini' },
    { dir: path.join(docs, 'OnlineFix'), files: [path.join('Stats', 'Achievements.ini'), path.join('Stats', 'achievements.ini')], format: 'ini' },
  ];
  if (process.platform !== 'win32') {
    // Native Linux builds of Goldberg/GSE save here.
    const xdg = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share');
    roots.push({ dir: path.join(xdg, 'GSE Saves'), files: ['achievements.json'], format: 'json' });
    roots.push({ dir: path.join(xdg, 'Goldberg SteamEmu Saves'), files: ['achievements.json'], format: 'json' });
  }
  return roots.filter((r) => {
    try {
      return fs.statSync(r.dir).isDirectory();
    } catch {
      return false;
    }
  });
}

/** Unix seconds or ms → epoch ms. */
function toMs(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n < 1e11 ? n * 1000 : n;
}

const truthy = (v: string | undefined) => !!v && /^(1|true)$/i.test(v.trim());

function parseJson(text: string): Map<string, number> {
  const out = new Map<string, number>();
  const data = JSON.parse(text) as unknown;
  // GSE: { API: { earned, earned_time } }; older Goldberg forks: [{ name, earned, earned_time }].
  const entries: [string, Record<string, unknown>][] = Array.isArray(data)
    ? data.filter((e) => e && typeof e.name === 'string').map((e) => [e.name as string, e])
    : Object.entries((data ?? {}) as Record<string, Record<string, unknown>>);
  for (const [id, e] of entries) {
    if (e && typeof e === 'object' && (e.earned === true || e.earned === 1)) out.set(id, toMs(e.earned_time));
  }
  return out;
}

function parseIni(text: string): Map<string, number> {
  const out = new Map<string, number>();
  let section: string | null = null;
  let values: Record<string, string> = {};
  const flush = () => {
    if (section && section !== 'SteamAchievements' && (truthy(values.achieved) || truthy(values.unlocked))) {
      out.set(section, toMs(values.unlocktime ?? values.timestamp ?? values.time));
    }
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    const sec = /^\[(.+)\]$/.exec(line);
    if (sec) {
      flush();
      section = sec[1];
      values = {};
      continue;
    }
    const eq = line.indexOf('=');
    if (eq > 0) values[line.slice(0, eq).trim().toLowerCase()] = line.slice(eq + 1).trim();
  }
  flush();
  return out;
}

export interface EmuUnlocks {
  /** Achievement id → unlock time (epoch ms, 0 if unknown). */
  unlocked: Map<string, number>;
  /** Files read, for watching. */
  files: string[];
}

/** Every app id with emulator achievement data, mapped to the files that hold it. */
export function scanEmulatorApps(): Map<number, string[]> {
  const apps = new Map<number, string[]>();
  for (const root of emulatorRoots()) {
    let dirs: string[];
    try {
      dirs = fs.readdirSync(root.dir).filter((d) => /^\d+$/.test(d) && d !== '0');
    } catch {
      continue;
    }
    for (const d of dirs) {
      for (const f of root.files) {
        const full = path.join(root.dir, d, f);
        if (fs.existsSync(full)) {
          const list = apps.get(Number(d)) ?? [];
          if (!list.includes(full)) list.push(full);
          apps.set(Number(d), list);
          break;
        }
      }
    }
  }
  return apps;
}

/** Merged unlocks for one app across every emulator file that has it (earliest time wins). */
export function readEmulatorUnlocks(files: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const f of files) {
    try {
      const text = fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '');
      const map = f.toLowerCase().endsWith('.json') ? parseJson(text) : parseIni(text);
      for (const [id, t] of map) {
        const prev = out.get(id);
        if (prev === undefined || (t > 0 && (prev === 0 || t < prev))) out.set(id, t);
      }
    } catch {
      // Half-written or unreadable file: try again on the next change.
    }
  }
  return out;
}
