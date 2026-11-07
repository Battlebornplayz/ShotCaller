import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { DetectionState, LibraryGame, RunningGame } from '../shared/types';
import { getLibrary } from './library';
import { readRunningAppIdLinux } from './steam';

/**
 * Watches which games are running. Reads only the process list and Steam's own "RunningAppID"
 * value; it never opens or touches game processes.
 *
 * Windows: one long-lived, hidden PowerShell process prints a JSON snapshot every few seconds
 * (much cheaper than spawning a process per poll). Linux: reads /proc directly.
 */

const POLL_SECONDS = 3;
/** A game must be missing this many polls in a row before it counts as closed (avoids flicker). */
const MISSES_TO_STOP = 2;

interface Snapshot {
  steamAppId: number;
  /** Lowercased exe names (with and without .exe). */
  names: Set<string>;
  /** Lowercased full exe paths (and Wine/Proton argv[0] paths on Linux). */
  paths: string[];
}

type Listener = (state: DetectionState, started: RunningGame[], stopped: RunningGame[]) => void;

const running = new Map<string, RunningGame>();
const misses = new Map<string, number>();
let watcher: DetectionState['watcher'] = 'starting';
let watcherError: string | undefined;
const listeners = new Set<Listener>();
let child: ChildProcess | null = null;
let timer: NodeJS.Timeout | null = null;
let stopped = false;
let restartDelay = 2000;

export function getDetectionState(): DetectionState {
  return { running: [...running.values()], watcher, error: watcherError };
}

export function onDetectionChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(started: RunningGame[], stoppedGames: RunningGame[]): void {
  const state = getDetectionState();
  for (const fn of listeners) fn(state, started, stoppedGames);
}

function setWatcher(next: DetectionState['watcher'], error?: string): void {
  if (watcher === next && watcherError === error) return;
  watcher = next;
  watcherError = error;
  emit([], []);
}

const norm = (s: string) => s.toLowerCase().replace(/\//g, '\\');

function matchGame(game: LibraryGame, snap: Snapshot): RunningGame['via'] | null {
  if (game.steamAppId && game.steamAppId === snap.steamAppId) return 'steam';
  for (const exe of game.exeNames) {
    const e = exe.toLowerCase();
    if (snap.names.has(e) || snap.names.has(e.replace(/\.exe$/, ''))) return 'process';
  }
  if (game.exePath) {
    const p = norm(game.exePath);
    if (snap.paths.includes(p)) return 'process';
  }
  if (game.source === 'steam' && game.installDir && game.installed) {
    const dir = norm(game.installDir) + '\\';
    if (snap.paths.some((p) => p.startsWith(dir))) return 'folder';
  }
  return null;
}

function applySnapshot(snap: Snapshot): void {
  const lib = getLibrary();
  const seen = new Set<string>();
  const started: RunningGame[] = [];

  for (const game of lib.games) {
    const via = matchGame(game, snap);
    if (!via) continue;
    seen.add(game.key);
    misses.delete(game.key);
    if (!running.has(game.key)) {
      const rg: RunningGame = {
        key: game.key,
        name: game.name,
        moduleId: game.moduleId,
        steamAppId: game.steamAppId,
        since: Date.now(),
        via,
      };
      running.set(game.key, rg);
      started.push(rg);
    }
  }

  const stoppedGames: RunningGame[] = [];
  for (const [key, rg] of running) {
    if (seen.has(key)) continue;
    const n = (misses.get(key) ?? 0) + 1;
    if (n >= MISSES_TO_STOP) {
      running.delete(key);
      misses.delete(key);
      stoppedGames.push(rg);
    } else {
      misses.set(key, n);
    }
  }

  const wasOk = watcher === 'ok';
  watcher = 'ok';
  watcherError = undefined;
  if (started.length || stoppedGames.length || !wasOk) emit(started, stoppedGames);
}

// ---------- Windows ----------

const PS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$parent = ${process.pid}
while ($true) {
  if (-not (Get-Process -Id $parent)) { exit }
  $app = (Get-ItemProperty -Path 'HKCU:\\Software\\Valve\\Steam' -Name RunningAppID).RunningAppID
  if (-not $app) { $app = 0 }
  $procs = @(Get-Process | ForEach-Object { $_.ProcessName + '|' + $_.Path })
  [Console]::Out.WriteLine((@{ app = [int]$app; procs = $procs } | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
  Start-Sleep -Seconds ${POLL_SECONDS}
}
`;

function startWindows(): void {
  const encoded = Buffer.from(PS_SCRIPT, 'utf16le').toString('base64');
  const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  child = ps;
  let buffer = '';
  ps.stdout?.setEncoding('utf8');
  ps.stdout?.on('data', (chunk: string) => {
    buffer += chunk;
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try {
        const data = JSON.parse(line) as { app: number; procs: string[] | string };
        const procs = Array.isArray(data.procs) ? data.procs : [data.procs];
        const names = new Set<string>();
        const paths: string[] = [];
        for (const entry of procs) {
          const [name, p] = String(entry).split('|');
          if (name) {
            names.add(name.toLowerCase());
            names.add(`${name.toLowerCase()}.exe`);
          }
          if (p) paths.push(norm(p));
        }
        restartDelay = 2000;
        applySnapshot({ steamAppId: Number(data.app) || 0, names, paths });
      } catch {
        // Ignore a malformed line.
      }
    }
  });
  ps.on('error', (err) => setWatcher('error', `Process watcher failed: ${err.message}`));
  ps.on('exit', () => {
    child = null;
    if (stopped) return;
    setWatcher('error', 'Process watcher stopped; restarting…');
    setTimeout(() => !stopped && startWindows(), restartDelay);
    restartDelay = Math.min(restartDelay * 2, 60000);
  });
}

// ---------- Linux ----------

function readText(p: string): string {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

function pollLinux(): void {
  const names = new Set<string>();
  const paths: string[] = [];
  let pids: string[];
  try {
    pids = fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d));
  } catch (err) {
    setWatcher('error', err instanceof Error ? err.message : String(err));
    return;
  }
  for (const pid of pids) {
    const comm = readText(`/proc/${pid}/comm`).trim();
    if (comm) names.add(comm.toLowerCase());
    try {
      const exe = fs.readlinkSync(`/proc/${pid}/exe`);
      names.add(path.basename(exe).toLowerCase());
      paths.push(norm(exe));
    } catch {
      // other users' processes
    }
    // Wine/Proton games: argv[0] is the Windows exe path, e.g. Z:\...\Game.exe
    const argv0 = readText(`/proc/${pid}/cmdline`).split('\0')[0];
    if (argv0 && /\.exe$/i.test(argv0)) {
      const base = argv0.split(/[\\/]/).pop() ?? '';
      names.add(base.toLowerCase());
      paths.push(norm(argv0.replace(/^[A-Z]:/i, '')));
    }
  }
  applySnapshot({ steamAppId: readRunningAppIdLinux(), names, paths });
}

// ---------- Lifecycle ----------

export function startDetection(): void {
  stopped = false;
  if (process.platform === 'win32') startWindows();
  else {
    pollLinux();
    timer = setInterval(pollLinux, POLL_SECONDS * 1000);
  }
}

export function stopDetection(): void {
  stopped = true;
  if (timer) clearInterval(timer);
  timer = null;
  child?.kill();
  child = null;
}
