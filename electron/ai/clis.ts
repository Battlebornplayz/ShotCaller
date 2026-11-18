import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AiCliInfo, AiProvider } from '../../shared/ai';

/**
 * Finds the AI command-line tools on this PC: Claude Code (`claude`) and Google's Antigravity CLI (`agy`). Only
 * looks at the usual install folders and PATH; never installs anything.
 */

const EXE: Record<AiProvider, string> = { claude: 'claude', antigravity: 'agy' };

function candidates(provider: AiProvider): string[] {
  const home = os.homedir();
  const local = process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local');
  const roaming = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
  const win = process.platform === 'win32';
  const name = EXE[provider];
  const list =
    provider === 'claude'
      ? [
          path.join(home, '.local', 'bin', win ? 'claude.exe' : 'claude'),
          path.join(roaming, 'npm', 'claude.cmd'),
          path.join(local, 'Programs', 'claude', 'claude.exe'),
        ]
      : [path.join(local, 'agy', 'bin', win ? 'agy.exe' : 'agy'), path.join(home, '.local', 'bin', 'agy')];
  // Then PATH, as Windows would search it.
  const exts = win ? ['.exe', '.cmd'] : [''];
  for (const dir of (process.env.PATH ?? '').split(path.delimiter))
    if (dir) for (const e of exts) list.push(path.join(dir, name + e));
  return list;
}

const found = new Map<AiProvider, string | null>();

export function findCli(provider: AiProvider): string | null {
  const known = found.get(provider);
  if (known && fs.existsSync(known)) return known;
  const hit = candidates(provider).find((p) => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  });
  found.set(provider, hit ?? null);
  return hit ?? null;
}

/** .cmd files (npm installs) need cmd.exe; everything ShotCaller passes them is plain words and file paths. */
export function needsShell(exe: string): boolean {
  return /\.(cmd|bat)$/i.test(exe);
}

function version(exe: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      exe,
      ['--version'],
      { timeout: 15_000, windowsHide: true, shell: needsShell(exe) },
      (err, stdout, stderr) => {
        if (err) return resolve(null);
        const m = `${stdout}${stderr}`.match(/\d+\.\d+\.\d+/);
        resolve(m ? m[0] : null);
      },
    );
  });
}

/** Best guess at "signed in" from the tool's own files, without starting it. Null = can't tell. */
function signedIn(provider: AiProvider): boolean | null {
  const home = os.homedir();
  if (provider === 'claude') {
    // Claude Code keeps its sign-in in ~/.claude/.credentials.json on Windows and Linux (the keychain on macOS).
    if (fs.existsSync(path.join(home, '.claude', '.credentials.json'))) return true;
    return null;
  }
  // Antigravity keeps its sign-in in the system's credential store, so it can't be seen from files.
  return null;
}

let lastSignIn: Partial<Record<AiProvider, boolean>> = {};
/** The chat learns this from a real run ("not signed in" errors, or a good answer). */
export function noteSignIn(provider: AiProvider, ok: boolean): void {
  lastSignIn = { ...lastSignIn, [provider]: ok };
}

export async function checkClis(): Promise<AiCliInfo[]> {
  found.clear();
  return Promise.all(
    (['claude', 'antigravity'] as AiProvider[]).map(async (provider) => {
      const exe = findCli(provider);
      return {
        provider,
        installed: !!exe,
        path: exe,
        version: exe ? await version(exe) : null,
        signedIn: exe ? (lastSignIn[provider] ?? signedIn(provider)) : false,
      };
    }),
  );
}

/** Opens a terminal window running the AI, where the user signs in themselves. ShotCaller never sees the sign-in. */
export function openSignInTerminal(provider: AiProvider): void {
  const exe = findCli(provider);
  if (!exe || process.platform !== 'win32') return;
  // `start` gives it its own console window; /k keeps it open after the AI exits.
  spawn('cmd.exe', ['/c', 'start', '""', 'cmd.exe', '/k', `"${exe}"`], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
    cwd: os.homedir(),
    windowsVerbatimArguments: true,
  }).unref();
}
