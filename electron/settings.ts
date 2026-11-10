import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_HOTKEYS,
  HOTKEY_ACTIONS,
  type GameLaunchAction,
  type LibraryView,
  type PopupCorner,
  type OverlayMode,
  type Settings,
  type SettingsPatch,
} from '../shared/types';
import { DEFAULT_FORTNITE_SETTINGS } from '../shared/fortnite';

const DEFAULTS: Settings = {
  channel: 'stable',
  popups: { enabled: true, sound: true, volume: 0.6, corner: 'bottom-right' },
  libraryView: 'grid',
  privacy: { crashReports: false },
  overlay: { mode: 'always', idleOpacity: 0.7, position: null, monitorDisplayId: null, allGames: false },
  hotkeys: { ...DEFAULT_HOTKEYS },
  hotkeysOnlyInGame: true,
  startup: { launchAtLogin: true, onGameLaunch: 'overlay', closeToTray: true },
  skillshot: { offerSound: true, memoryReader: false, screenReader: true },
  fortnite: { ...DEFAULT_FORTNITE_SETTINGS, card: { ...DEFAULT_FORTNITE_SETTINGS.card } },
  mcp: { enabled: false, allowActions: false },
};

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const v = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.round(Math.min(max, Math.max(min, v)) * 100) / 100;
}

let cache: Settings | null = null;
const listeners = new Set<(next: Settings, prev: Settings) => void>();

function settingsFile(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

// ---------- Validation ----------

const MODIFIERS = new Set(['Alt', 'Shift', 'Ctrl', 'Control', 'CommandOrControl', 'CmdOrCtrl', 'Super', 'Meta', 'AltGr']);
const NAMED_KEYS = new Set([
  'Space', 'Tab', 'Backspace', 'Delete', 'Insert', 'Return', 'Enter', 'Up', 'Down', 'Left', 'Right',
  'Home', 'End', 'PageUp', 'PageDown', 'Escape', 'Plus', 'numadd', 'numsub', 'nummult', 'numdiv', 'numdec',
  '`', '-', '=', '[', ']', '\\', ';', "'", ',', '.', '/',
]);

function isFunctionKey(key: string): boolean {
  return /^F([1-9]|1\d|2[0-4])$/.test(key);
}

/** Accepts "Mod+...+Key" with at least one modifier (function keys may stand alone). */
export function isValidAccelerator(value: string): boolean {
  const parts = value.split('+');
  if (parts.length === 0 || parts.length > 4) return false;
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1);
  if (!mods.every((m) => MODIFIERS.has(m))) return false;
  if (new Set(mods).size !== mods.length) return false;
  const keyOk = /^[A-Z0-9]$/.test(key) || /^num[0-9]$/.test(key) || isFunctionKey(key) || NAMED_KEYS.has(key);
  if (!keyOk) return false;
  return mods.length > 0 || isFunctionKey(key);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

type Raw = Record<string, unknown>;

function obj(value: unknown): Raw {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {};
}

function sanitize(input: unknown): Settings {
  const raw = obj(input);
  const overlay = obj(raw.overlay);
  const startup = obj(raw.startup);
  const privacy = obj(raw.privacy);
  const skillshot = obj(raw.skillshot);
  const fortnite = obj(raw.fortnite);
  const fnCard = obj(fortnite.card);
  const FN = DEFAULTS.fortnite;
  const mcp = obj(raw.mcp);
  const hotkeysRaw = obj(raw.hotkeys);
  const popups = obj(raw.popups);
  const volume = finite(popups.volume) ? popups.volume : DEFAULTS.popups.volume;
  const pos = obj(overlay.position);

  const hotkeys = { ...DEFAULT_HOTKEYS };
  for (const action of HOTKEY_ACTIONS) {
    const v = hotkeysRaw[action];
    if (v === '') hotkeys[action] = '';
    else if (typeof v === 'string' && isValidAccelerator(v)) hotkeys[action] = v;
  }
  // The same combination can't drive two actions: later duplicates are unbound.
  const seen = new Set<string>();
  for (const action of HOTKEY_ACTIONS) {
    const key = hotkeys[action].toLowerCase();
    if (!key) continue;
    if (seen.has(key)) hotkeys[action] = '';
    else seen.add(key);
  }

  const opacity = finite(overlay.idleOpacity) ? overlay.idleOpacity : DEFAULTS.overlay.idleOpacity;

  return {
    channel: raw.channel === 'beta' ? 'beta' : 'stable',
    popups: {
      enabled: bool(popups.enabled, DEFAULTS.popups.enabled),
      sound: bool(popups.sound, DEFAULTS.popups.sound),
      volume: Math.round(Math.min(1, Math.max(0, volume)) * 100) / 100,
      corner: oneOf<PopupCorner>(popups.corner, ['bottom-right', 'top-right', 'bottom-left', 'top-left'], DEFAULTS.popups.corner),
    },
    libraryView: oneOf<LibraryView>(raw.libraryView, ['grid', 'list'], DEFAULTS.libraryView),
    privacy: { crashReports: bool(privacy.crashReports, DEFAULTS.privacy.crashReports) },
    overlay: {
      mode: oneOf<OverlayMode>(overlay.mode, ['always', 'popup', 'monitor'], DEFAULTS.overlay.mode),
      idleOpacity: Math.round(Math.min(1, Math.max(0.3, opacity)) * 100) / 100,
      position: finite(pos.x) && finite(pos.y) ? { x: Math.round(pos.x), y: Math.round(pos.y) } : null,
      monitorDisplayId: finite(overlay.monitorDisplayId) ? overlay.monitorDisplayId : null,
      allGames: bool(overlay.allGames, DEFAULTS.overlay.allGames),
    },
    hotkeys,
    hotkeysOnlyInGame: bool(raw.hotkeysOnlyInGame, DEFAULTS.hotkeysOnlyInGame),
    mcp: {
      enabled: bool(mcp.enabled, DEFAULTS.mcp.enabled),
      allowActions: bool(mcp.allowActions, DEFAULTS.mcp.allowActions),
    },
    startup: {
      launchAtLogin: bool(startup.launchAtLogin, DEFAULTS.startup.launchAtLogin),
      onGameLaunch: oneOf<GameLaunchAction>(startup.onGameLaunch, ['overlay', 'window', 'nothing'], DEFAULTS.startup.onGameLaunch),
      closeToTray: bool(startup.closeToTray, DEFAULTS.startup.closeToTray),
    },
    skillshot: {
      offerSound: bool(skillshot.offerSound, DEFAULTS.skillshot.offerSound),
      memoryReader: bool(skillshot.memoryReader, DEFAULTS.skillshot.memoryReader),
      screenReader: bool(skillshot.screenReader, DEFAULTS.skillshot.screenReader),
    },
    fortnite: {
      screenReader: bool(fortnite.screenReader, FN.screenReader),
      recorder: bool(fortnite.recorder, FN.recorder),
      cardOpacity: clamp(fortnite.cardOpacity, 0.3, 1, FN.cardOpacity),
      cardScale: clamp(fortnite.cardScale, 0.8, 1.5, FN.cardScale),
      card: {
        match: bool(fnCard.match, FN.card.match),
        session: bool(fnCard.session, FN.card.session),
        today: bool(fnCard.today, FN.card.today),
        allTime: bool(fnCard.allTime, FN.card.allTime),
      },
      liveMap: bool(fortnite.liveMap, FN.liveMap),
      monitor: {
        on: bool(obj(fortnite.monitor).on, FN.monitor.on),
        displayId: finite(obj(fortnite.monitor).displayId) ? (obj(fortnite.monitor).displayId as number) : null,
      },
      epicName: typeof fortnite.epicName === 'string' ? fortnite.epicName.trim().slice(0, 40) : FN.epicName,
      chestGoal: clamp(fortnite.chestGoal, 0, 500, FN.chestGoal),
      wishlist: Array.isArray(fortnite.wishlist)
        ? (fortnite.wishlist as unknown[])
            .map((w) => obj(w))
            .filter((w) => typeof w.id === 'string' && typeof w.name === 'string')
            .slice(0, 100)
            .map((w) => ({ id: String(w.id).slice(0, 120), name: String(w.name).slice(0, 120) }))
        : [],
    },
  };
}

// ---------- Store ----------

export function getSettings(): Settings {
  if (cache) return cache;
  try {
    cache = sanitize(JSON.parse(fs.readFileSync(settingsFile(), 'utf8')));
  } catch {
    cache = sanitize({});
  }
  return cache;
}

export function updateSettings(patch: SettingsPatch): Settings {
  const prev = getSettings();
  const p = obj(patch) as SettingsPatch;
  // Deep-merge one level: each group is patched, not replaced.
  const merged = {
    ...prev,
    ...(p.channel !== undefined ? { channel: p.channel } : {}),
    ...(p.hotkeysOnlyInGame !== undefined ? { hotkeysOnlyInGame: p.hotkeysOnlyInGame } : {}),
    ...(p.libraryView !== undefined ? { libraryView: p.libraryView } : {}),
    popups: { ...prev.popups, ...obj(p.popups) },
    overlay: { ...prev.overlay, ...obj(p.overlay) },
    hotkeys: { ...prev.hotkeys, ...obj(p.hotkeys) },
    startup: { ...prev.startup, ...obj(p.startup) },
    privacy: { ...prev.privacy, ...obj(p.privacy) },
    skillshot: { ...prev.skillshot, ...obj(p.skillshot) },
    fortnite: {
      ...prev.fortnite,
      ...obj(p.fortnite),
      card: { ...prev.fortnite.card, ...obj(obj(p.fortnite).card) },
      monitor: { ...prev.fortnite.monitor, ...obj(obj(p.fortnite).monitor) },
    },
    mcp: { ...prev.mcp, ...obj(p.mcp) },
  };
  // Rebinding a combination another action already uses moves it: the old action is unbound.
  for (const [action, combo] of Object.entries(obj(p.hotkeys))) {
    if (typeof combo !== 'string' || !combo) continue;
    for (const other of HOTKEY_ACTIONS) {
      if (other !== action && merged.hotkeys[other]?.toLowerCase() === combo.toLowerCase()) merged.hotkeys[other] = '';
    }
  }
  cache = sanitize(merged);
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(cache, null, 2), 'utf8');
  } catch (err) {
    console.error('Could not save settings:', err);
  }
  for (const fn of listeners) fn(cache, prev);
  return cache;
}

/** Called after every settings change with the new and previous values. */
export function onSettingsChange(fn: (next: Settings, prev: Settings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
