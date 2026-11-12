import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { EmulatorId } from '../../shared/types';
import { exists, readSqlite } from './extra';
import type { RegistrySnapshot } from './registry';

/**
 * Console emulators (Phase L2, L-Q63/64): RPCS3 (PS3), Ryujinx (Switch) and mGBA (Game Boy
 * Advance). You point at your game folders once; each game file becomes a card that opens in the
 * right emulator. ShotCaller only lists files and starts the emulator; it never changes either.
 */

export interface EmulatorConfig {
  /** The emulator's program (picked, or found on its own). */
  exe?: string;
  /** Game folders. Undefined until you change them (then the emulator's own folders are used). */
  folders?: string[];
  /** Single game files dropped on the Games tab. */
  files?: string[];
}

export interface RomGame {
  emu: EmulatorId;
  key: string;
  name: string;
  /** What the emulator opens. */
  file: string;
  installDir: string;
  sizeBytes?: number;
}

export const EMULATORS: { id: EmulatorId; name: string; console: string; exeName: string; exts: string[] }[] = [
  { id: 'rpcs3', name: 'RPCS3', console: 'PlayStation 3', exeName: 'rpcs3.exe', exts: ['.iso', '.pkg'] },
  { id: 'ryujinx', name: 'Ryujinx', console: 'Nintendo Switch', exeName: 'Ryujinx.exe', exts: ['.nsp', '.xci', '.nro'] },
  { id: 'mgba', name: 'mGBA', console: 'Game Boy Advance', exeName: 'mGBA.exe', exts: ['.gba', '.gbc', '.gb'] },
];

/** Which emulator opens a dropped file, by its extension. */
export function emulatorForFile(file: string): EmulatorId | undefined {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.pkg') return undefined; // PS3 packages are installed inside RPCS3 first
  if (path.basename(file).toUpperCase() === 'EBOOT.BIN') return 'rpcs3';
  return EMULATORS.find((e) => e.exts.includes(ext))?.id;
}

/** Looks for the emulator's program in the usual places. */
export function findEmulatorExe(emu: EmulatorId, reg: RegistrySnapshot | null): string | undefined {
  const def = EMULATORS.find((e) => e.id === emu)!;
  const pf = process.env.ProgramFiles ?? 'C:\\Program Files';
  const local = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
  const dirs: string[] = [];
  for (const a of reg?.apps ?? []) {
    if (a.name.toLowerCase().startsWith(def.name.toLowerCase())) {
      if (a.dir) dirs.push(a.dir);
      if (a.icon && a.icon.toLowerCase().endsWith('.exe')) dirs.push(path.dirname(a.icon));
    }
  }
  dirs.push(path.join(pf, def.name), path.join(local, def.name), path.join(os.homedir(), def.name), `C:\\${def.name}`, `D:\\${def.name}`);
  if (emu === 'ryujinx') dirs.push(path.join(local, 'Ryujinx', 'publish'));
  for (const d of dirs) {
    const p = path.join(d, def.exeName);
    if (exists(p)) return p;
  }
  return undefined;
}

/** The emulator's own game folders, used until you pick your own. */
export function defaultFolders(emu: EmulatorId, exe: string | undefined): string[] {
  const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
  const out: string[] = [];
  try {
    if (emu === 'ryujinx') {
      const cfg = JSON.parse(fs.readFileSync(path.join(appData, 'Ryujinx', 'Config.json'), 'utf8')) as { game_dirs?: unknown };
      if (Array.isArray(cfg.game_dirs)) out.push(...cfg.game_dirs.filter((d): d is string => typeof d === 'string'));
    } else if (emu === 'mgba') {
      const rows = readSqlite<{ path: string }>(path.join(appData, 'mGBA', 'library.sqlite3'), 'SELECT path FROM roots');
      out.push(...(rows ?? []).map((r) => r.path));
    } else if (emu === 'rpcs3' && exe) {
      // Games RPCS3 already knows (disc games list) and its installed PSN games.
      const dir = path.dirname(exe);
      try {
        const yml = fs.readFileSync(path.join(dir, 'config', 'games.yml'), 'utf8');
        for (const m of yml.matchAll(/^[A-Z]{4}\d{5}:\s*"?([^"\r\n]+?)"?\s*$/gm)) out.push(path.dirname(path.normalize(m[1].replace(/[\\/]+$/, ''))));
      } catch {
        // no games list
      }
      out.push(path.join(dir, 'dev_hdd0', 'game'));
    }
  } catch {
    // no settings
  }
  return [...new Set(out.map((d) => path.normalize(d)))].filter((d) => exists(d));
}

const keyFor = (emu: EmulatorId, file: string) => `rom:${emu}:${createHash('sha1').update(file.toLowerCase()).digest('hex').slice(0, 12)}`;

/** "Animal_Crossing [0100...][v0] (USA)" → "Animal Crossing". */
export function cleanRomName(file: string, dropVersion = false): string {
  const base = path.basename(file, path.extname(file));
  let n = base
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/_+/g, ' ')
    .replace(/\.(?!\d)|(?<!\d)\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Switch updates are often named "Game v1.0.2"; dropping the version folds them into the game.
  if (dropVersion) n = n.replace(/\s+v?\d+(\.\d+){1,3}$/i, '').trim();
  return n || base;
}

/** Switch updates and DLC (title id not ending in 000, or labelled) aren't games of their own. */
function isSwitchExtra(file: string): boolean {
  const name = path.basename(file);
  if (/\[(dlc|upd|update)\]|\bdlc\b|\bupdate\b/i.test(name)) return true;
  const tid = name.match(/\[(01[0-9a-f]{14})\]/i)?.[1];
  return !!tid && !tid.toLowerCase().endsWith('000');
}

/** TITLE from a PS3 PARAM.SFO. */
function sfoTitle(file: string): string | undefined {
  try {
    const b = fs.readFileSync(file);
    if (b.readUInt32BE(0) !== 0x00505346) return undefined;
    const keys = b.readUInt32LE(8);
    const data = b.readUInt32LE(12);
    const count = b.readUInt32LE(16);
    for (let i = 0; i < count; i++) {
      const e = 20 + i * 16;
      const keyOff = b.readUInt16LE(e);
      const len = b.readUInt32LE(e + 4);
      const dataOff = b.readUInt32LE(e + 12);
      const end = b.indexOf(0, keys + keyOff);
      if (b.toString('utf8', keys + keyOff, end) === 'TITLE') {
        return b.toString('utf8', data + dataOff, data + dataOff + len).replace(/\0+$/, '').replace(/\s+/g, ' ').trim();
      }
    }
  } catch {
    // not readable
  }
  return undefined;
}

const MAX_ENTRIES = 5000;

/** Every game file in the folders (four levels deep at most). */
export function scanRoms(emu: EmulatorId, folders: string[], files: string[]): RomGame[] {
  const def = EMULATORS.find((e) => e.id === emu)!;
  const out = new Map<string, RomGame>();
  let seen = 0;
  const add = (file: string, name: string, dir: string) => {
    let size: number | undefined;
    try {
      size = fs.statSync(file).size;
    } catch {
      return;
    }
    // Two copies of one game: keep the bigger file (usually the full game, not a patch).
    const id = name.toLowerCase();
    const prev = out.get(id);
    if (prev && (prev.sizeBytes ?? 0) >= size) return;
    out.set(id, { emu, key: keyFor(emu, file), name, file, installDir: dir, sizeBytes: size });
  };

  const walk = (dir: string, depth: number) => {
    if (seen > MAX_ENTRIES) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (emu === 'rpcs3') {
      // A PS3 disc folder (PS3_GAME/…) or an installed PSN game (PARAM.SFO + USRDIR).
      const disc = path.join(dir, 'PS3_GAME');
      const sfo = exists(path.join(disc, 'PARAM.SFO')) ? path.join(disc, 'PARAM.SFO') : exists(path.join(dir, 'PARAM.SFO')) ? path.join(dir, 'PARAM.SFO') : null;
      const eboot = [path.join(disc, 'USRDIR', 'EBOOT.BIN'), path.join(dir, 'USRDIR', 'EBOOT.BIN')].find((p) => exists(p));
      if (sfo && eboot) {
        add(eboot, sfoTitle(sfo) ?? path.basename(dir), dir);
        return;
      }
    }
    for (const e of entries) {
      if (++seen > MAX_ENTRIES) return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (depth < 4 && !e.name.startsWith('.')) walk(full, depth + 1);
      } else if (e.isFile() && def.exts.includes(path.extname(e.name).toLowerCase()) && path.extname(e.name).toLowerCase() !== '.pkg') {
        if (emu === 'ryujinx' && isSwitchExtra(full)) continue;
        add(full, cleanRomName(full, emu === 'ryujinx'), dir);
      }
    }
  };
  for (const f of folders) walk(f, 0);
  for (const f of files) {
    if (!exists(f)) continue;
    if (emu === 'rpcs3' && path.basename(f).toUpperCase() === 'EBOOT.BIN') {
      const gameDir = path.dirname(path.dirname(f));
      const sfo = [path.join(gameDir, 'PARAM.SFO')].find((p) => exists(p));
      add(f, (sfo && sfoTitle(sfo)) || path.basename(path.dirname(gameDir)), gameDir);
    } else {
      add(f, cleanRomName(f, emu === 'ryujinx'), path.dirname(f));
    }
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Arguments that open one game in the emulator. */
export function emulatorArgs(emu: EmulatorId, file: string): string[] {
  return emu === 'rpcs3' ? ['--no-gui', file] : [file];
}
