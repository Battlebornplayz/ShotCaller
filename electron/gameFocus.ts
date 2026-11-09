import { createRequire } from 'node:module';

/**
 * Brings the game back if clicking the overlay minimizes it. While Alt is held (and briefly after),
 * this watches the window that was in front when Alt went down and restores it if it gets minimized.
 * It only uses ordinary window calls on the game's window. It never touches the game's process.
 * Windows only; anywhere else, or if the native library fails to load, it does nothing.
 */

const POLL_MS = 250;
/** Keep watching this long after Alt is released: a click can minimize the game a moment later. */
const LINGER_MS = 3000;
const SW_RESTORE = 9;

interface User32 {
  GetForegroundWindow(): unknown;
  GetWindowThreadProcessId(hwnd: unknown, pid: [number]): number;
  IsIconic(hwnd: unknown): boolean;
  ShowWindow(hwnd: unknown, cmd: number): boolean;
  SetForegroundWindow(hwnd: unknown): boolean;
}

let user32: User32 | null | undefined;

function loadUser32(): User32 | null {
  if (user32 !== undefined) return user32;
  user32 = null;
  if (process.platform !== 'win32') return null;
  try {
    const koffi = createRequire(import.meta.url)('koffi') as typeof import('koffi');
    const lib = koffi.load('user32.dll');
    user32 = {
      GetForegroundWindow: lib.func('void* __stdcall GetForegroundWindow()'),
      GetWindowThreadProcessId: lib.func('uint32_t __stdcall GetWindowThreadProcessId(void* hwnd, _Out_ uint32_t* pid)'),
      IsIconic: lib.func('bool __stdcall IsIconic(void* hwnd)'),
      ShowWindow: lib.func('bool __stdcall ShowWindow(void* hwnd, int cmd)'),
      SetForegroundWindow: lib.func('bool __stdcall SetForegroundWindow(void* hwnd)'),
    };
  } catch (err) {
    console.warn('[gameFocus] native window calls unavailable:', err);
  }
  return user32;
}

let target: unknown = null;
let timer: ReturnType<typeof setInterval> | null = null;
let stopAt: number | null = null;

function stop(): void {
  if (timer) clearInterval(timer);
  timer = null;
  stopAt = null;
}

function poll(): void {
  if (stopAt !== null && Date.now() > stopAt) return stop();
  const api = loadUser32();
  if (!api || !target) return;
  try {
    if (api.IsIconic(target)) {
      api.ShowWindow(target, SW_RESTORE);
      api.SetForegroundWindow(target);
    }
  } catch {
    stop();
  }
}

/** Alt went down over a game: remember the window in front, unless it's one of ours. */
export function watchGameWindow(): void {
  const api = loadUser32();
  if (!api) return;
  try {
    const hwnd = api.GetForegroundWindow();
    const pid: [number] = [0];
    if (hwnd) api.GetWindowThreadProcessId(hwnd, pid);
    if (hwnd && pid[0] !== process.pid) target = hwnd;
  } catch {
    return;
  }
  stopAt = null;
  timer ??= setInterval(poll, POLL_MS);
}

/** Alt was released: keep watching a little longer, then stop. */
export function releaseGameWindow(): void {
  if (timer) stopAt = Date.now() + LINGER_MS;
}

export function resetGameWindow(): void {
  stop();
  target = null;
}
