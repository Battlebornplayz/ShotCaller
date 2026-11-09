/**
 * Watches the Alt key system-wide so the corner overlay can stay click-through until Alt is held.
 * Uses uiohook-napi (an OS-level keyboard hook, the same kind push-to-talk apps use); it observes
 * key presses only and never touches the game. The hook runs only while a corner overlay is
 * visible. If the native module can't load, the overlay falls back to always-interactive.
 */

type UiohookModule = typeof import('uiohook-napi');

let mod: UiohookModule | null = null;
let loadTried = false;
let running = false;
let onMouseDown: (x: number, y: number) => void = () => undefined;
let held = false;
let onChange: (held: boolean) => void = () => undefined;

async function load(): Promise<UiohookModule | null> {
  if (loadTried) return mod;
  loadTried = true;
  try {
    mod = await import('uiohook-napi');
    const { uIOhook, UiohookKey } = mod;
    const isAlt = (code: number) => code === UiohookKey.Alt || code === UiohookKey.AltRight;
    const set = (next: boolean) => {
      if (held === next) return;
      held = next;
      onChange(next);
    };
    uIOhook.on('keydown', (e) => {
      if (isAlt(e.keycode)) set(true);
      else if (!e.altKey) set(false); // missed key-up (e.g. after Alt+Tab)
    });
    uIOhook.on('keyup', (e) => {
      if (isAlt(e.keycode)) set(false);
    });
    uIOhook.on('mousedown', (e) => onMouseDown(e.x, e.y));
  } catch (err) {
    console.error('Alt-key hook unavailable:', err);
    mod = null;
  }
  return mod;
}

/** Loads the hook module. Resolves to whether it's available. */
export async function initAltHook(listener: (held: boolean) => void, mouseDown?: (x: number, y: number) => void): Promise<boolean> {
  onChange = listener;
  if (mouseDown) onMouseDown = mouseDown;
  return (await load()) !== null;
}

/** Start or stop listening. Cheap to call repeatedly. */
export function setAltHookRunning(want: boolean): void {
  if (!mod || want === running) return;
  try {
    if (want) mod.uIOhook.start();
    else {
      mod.uIOhook.stop();
      if (held) {
        held = false;
        onChange(false);
      }
    }
    running = want;
  } catch (err) {
    console.error('Alt-key hook failed:', err);
  }
}

export function disposeAltHook(): void {
  setAltHookRunning(false);
}
