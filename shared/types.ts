// Types shared by the Electron main process, the preload script and the renderer.

export type Channel = 'stable' | 'beta';

/** always = shown whenever a game runs; popup = hidden until the popup hotkey; monitor = normal window on another display. */
export type OverlayMode = 'always' | 'popup' | 'monitor';

export type HotkeyAction = 'popup' | 'pick1' | 'pick2' | 'nextRound' | 'endMatch' | 'huntList';

export const HOTKEY_ACTIONS: HotkeyAction[] = ['popup', 'pick1', 'pick2', 'nextRound', 'endMatch', 'huntList'];

/** Default bindings. Next round is Alt+N, not Alt+R: the NVIDIA overlay owns Alt+R on many PCs. */
export const DEFAULT_HOTKEYS: Record<HotkeyAction, string> = {
  popup: 'Alt+S',
  pick1: 'Alt+1',
  pick2: 'Alt+2',
  nextRound: 'Alt+N',
  endMatch: 'Alt+E',
  huntList: 'Alt+H',
};

export type GameLaunchAction = 'overlay' | 'window' | 'nothing';

export interface Point {
  x: number;
  y: number;
}

export interface OverlaySettings {
  mode: OverlayMode;
  /** Overlay opacity while not being interacted with, 0.3-1. */
  idleOpacity: number;
  /** Top-left of the corner overlay in screen coordinates; null = top right of the primary display. */
  position: Point | null;
  /** Display for "second monitor" mode; null = the first non-primary display. */
  monitorDisplayId: number | null;
  /** Also open the overlay for games without a dedicated module. */
  allGames: boolean;
}

export interface StartupSettings {
  /** Start with the OS, hidden in the tray (installed builds only). */
  launchAtLogin: boolean;
  /** What happens when a supported game launches. */
  onGameLaunch: GameLaunchAction;
  /** Closing the main window keeps ShotCaller running in the tray. */
  closeToTray: boolean;
}

export interface Settings {
  channel: Channel;
  overlay: OverlaySettings;
  /** Electron accelerators, e.g. "Alt+S". Empty string = unbound. */
  hotkeys: Record<HotkeyAction, string>;
  /** Only register the global hotkeys while a game is running or the overlay is showing. */
  hotkeysOnlyInGame: boolean;
  startup: StartupSettings;
}

export interface SettingsPatch {
  channel?: Channel;
  overlay?: Partial<OverlaySettings>;
  hotkeys?: Partial<Record<HotkeyAction, string>>;
  hotkeysOnlyInGame?: boolean;
  startup?: Partial<StartupSettings>;
}

// ---------- Library and detection ----------

export type GameSource = 'module' | 'steam' | 'manual';

export interface LibraryGame {
  /** "steam:<appid>", "manual:<id>" or "module:<id>" (a supported game not found in Steam). */
  key: string;
  name: string;
  source: GameSource;
  steamAppId?: number;
  /** Install folder (Steam) or the folder of the chosen exe (manual). */
  installDir?: string;
  /** Full exe path for games added by hand. */
  exePath?: string;
  /** Executable names that identify the game (case-insensitive). */
  exeNames: string[];
  /** Dedicated module id, when ShotCaller has one for this game. */
  moduleId?: string;
  pinned?: boolean;
  installed: boolean;
}

export interface SteamImportInfo {
  found: boolean;
  steamPath?: string;
  libraryFolders: string[];
  importedAt?: string;
  error?: string;
}

export interface Library {
  games: LibraryGame[];
  steam: SteamImportInfo;
}

export interface RunningGame {
  key: string;
  name: string;
  moduleId?: string;
  steamAppId?: number;
  /** Epoch ms when ShotCaller first saw it running. */
  since: number;
  /** How it was detected. */
  via: 'steam' | 'process' | 'folder';
}

export interface DetectionState {
  running: RunningGame[];
  watcher: 'starting' | 'ok' | 'error';
  error?: string;
}

// ---------- Overlay and hotkeys ----------

export interface OverlayState {
  visible: boolean;
  /** True while Alt is held (corner modes) or always in second-monitor mode. */
  interactive: boolean;
  mode: OverlayMode;
  idleOpacity: number;
  /** The game the overlay is showing; null in preview with nothing running. */
  game: RunningGame | null;
  preview: boolean;
  /** Whether the global Alt-key hook loaded. If not, the popup hotkey toggles interaction instead. */
  altHook: boolean;
}

export interface OverlayActionEvent {
  action: HotkeyAction;
  at: number;
}

export type HotkeyStatus = Record<HotkeyAction, 'active' | 'inactive' | 'failed' | 'unbound'>;

export interface DisplayInfo {
  id: number;
  label: string;
  primary: boolean;
  width: number;
  height: number;
}

// ---------- Updates and app ----------

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'dev' }
  | { status: 'up-to-date'; version: string }
  | { status: 'available'; version: string }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; message: string };

export interface PatchNote {
  version: string;
  name: string;
  date: string;
  body: string;
  prerelease: boolean;
}

export interface AppInfo {
  version: string;
  packaged: boolean;
  platform: string;
}

type Unsubscribe = () => void;

export interface ShotCallerApi {
  getAppInfo(): Promise<AppInfo>;

  getSettings(): Promise<Settings>;
  updateSettings(patch: SettingsPatch): Promise<Settings>;
  onSettings(callback: (settings: Settings) => void): Unsubscribe;

  getUpdateState(): Promise<UpdateState>;
  checkForUpdates(): Promise<void>;
  downloadUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  getPatchNotes(): Promise<{ ok: true; notes: PatchNote[] } | { ok: false; error: string }>;
  onUpdateState(callback: (state: UpdateState) => void): Unsubscribe;

  getLibrary(): Promise<Library>;
  importSteam(): Promise<Library>;
  /** Opens a file picker for an executable; resolves to the added game or null if cancelled. */
  addGameManually(): Promise<LibraryGame | null>;
  setGamePinned(key: string, pinned: boolean): Promise<Library>;
  removeGame(key: string): Promise<Library>;
  onLibrary(callback: (library: Library) => void): Unsubscribe;

  getDetection(): Promise<DetectionState>;
  onDetection(callback: (state: DetectionState) => void): Unsubscribe;

  getOverlayState(): Promise<OverlayState>;
  onOverlayState(callback: (state: OverlayState) => void): Unsubscribe;
  onOverlayAction(callback: (event: OverlayActionEvent) => void): Unsubscribe;
  /** Show or hide the overlay without a game running, to try it out. */
  setOverlayPreview(on: boolean): Promise<void>;
  /** Run a hotkey action as if it had been pressed. */
  triggerAction(action: HotkeyAction): Promise<void>;
  /** Overlay window only: tells the main process how big the panel is, so the window fits it. */
  reportOverlaySize(width: number, height: number): void;

  getHotkeyStatus(): Promise<HotkeyStatus>;
  onHotkeyStatus(callback: (status: HotkeyStatus) => void): Unsubscribe;
  /** While true, global hotkeys are released so a new combination can be recorded. */
  setHotkeyCapture(capturing: boolean): Promise<void>;

  getDisplays(): Promise<DisplayInfo[]>;

  enterApp(): Promise<void>;
  openMainWindow(): Promise<void>;
  windowControl(action: 'minimize' | 'maximize' | 'close'): Promise<void>;
}

declare global {
  interface Window {
    shotcaller: ShotCallerApi;
  }
}
