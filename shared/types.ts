// Types shared by the Electron main process, the preload script and the renderer.

import type { MatchRecord, ScreenPreview, ScreenReadStatus, SkillshotData, SkillshotLiveState } from './skillshot';
import type { SkillCollection } from './skillshotCollection';
import type {
  FnDisplay,
  FnDrop,
  FnSquadState,
  FnLiveState,
  FnMapState,
  FnMatchRecord,
  FnRoute,
  FnScreenPreview,
  FnScreenStatus,
  FnShopItem,
  FnShopState,
  FnStatsState,
  FortniteSettings,
} from './fortnite';

export type Channel = 'stable' | 'beta';

/** always = shown whenever a game runs; popup = hidden until the popup hotkey; monitor = normal window on another display. */
export type OverlayMode = 'always' | 'popup' | 'monitor';

export type HotkeyAction = 'popup' | 'pick1' | 'pick2' | 'nextRound' | 'endMatch' | 'huntList' | 'fnChest';

export const HOTKEY_ACTIONS: HotkeyAction[] = ['popup', 'pick1', 'pick2', 'nextRound', 'endMatch', 'huntList', 'fnChest'];

/** Default bindings. Next round is Alt+N, not Alt+R: the NVIDIA overlay owns Alt+R on many PCs. */
export const DEFAULT_HOTKEYS: Record<HotkeyAction, string> = {
  popup: 'Alt+S',
  pick1: 'Alt+1',
  pick2: 'Alt+2',
  nextRound: 'Alt+N',
  endMatch: 'Alt+E',
  huntList: 'Alt+H',
  fnChest: 'Alt+C',
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

export interface SkillshotSettings {
  /** Soft sound cue when skill advice appears. */
  offerSound: boolean;
  /** Read-only memory reader for live values (own player only). Off by default: ban risk. */
  memoryReader: boolean;
  /** Read the offered skills off the screen (a copy of a small strip, offline). On by default. */
  screenReader: boolean;
}

export interface PrivacySettings {
  /** Send anonymous crash reports (error message + stack, app version, OS). Off by default. */
  crashReports: boolean;
}

export type PopupCorner = 'bottom-right' | 'top-right' | 'bottom-left' | 'top-left';

export interface PopupSettings {
  /** Show the unlock card. */
  enabled: boolean;
  sound: boolean;
  /** 0-1. */
  volume: number;
  corner: PopupCorner;
}

export type LibraryView = 'grid' | 'list';

/** The optional connection that lets Claude read ShotCaller's data. */
export interface McpSettings {
  /** Run the local server. Off by default. */
  enabled: boolean;
  /** Also let Claude change things in ShotCaller: show advice on the overlay, set the goal build, set offers. */
  allowActions: boolean;
}

export interface McpInfo {
  running: boolean;
  url: string;
  /** Why it isn't running, when it should be. */
  error: string | null;
  /** The command that connects Claude Code. Holds the secret token. Null while the connection is off. */
  command: string | null;
}

export interface Settings {
  channel: Channel;
  popups: PopupSettings;
  libraryView: LibraryView;
  privacy: PrivacySettings;
  overlay: OverlaySettings;
  /** Electron accelerators, e.g. "Alt+S". Empty string = unbound. */
  hotkeys: Record<HotkeyAction, string>;
  /** Only register the global hotkeys while a game is running or the overlay is showing. */
  hotkeysOnlyInGame: boolean;
  startup: StartupSettings;
  skillshot: SkillshotSettings;
  fortnite: FortniteSettings;
  mcp: McpSettings;
}

export interface SettingsPatch {
  channel?: Channel;
  popups?: Partial<PopupSettings>;
  libraryView?: LibraryView;
  overlay?: Partial<OverlaySettings>;
  hotkeys?: Partial<Record<HotkeyAction, string>>;
  hotkeysOnlyInGame?: boolean;
  startup?: Partial<StartupSettings>;
  privacy?: Partial<PrivacySettings>;
  skillshot?: Partial<SkillshotSettings>;
  fortnite?: Partial<Omit<FortniteSettings, 'card' | 'monitor'>> & { card?: Partial<FortniteSettings['card']>; monitor?: Partial<FortniteSettings['monitor']> };
  mcp?: Partial<McpSettings>;
}

// ---------- Accounts and cloud ----------

/** Steam and Discord sign-in were dropped when the backend moved to Firebase (Phase 4). */
export type SignInMethod = 'google';
export type AccountProvider = SignInMethod | 'email';
export type ProfileVisibility = 'public' | 'friends' | 'private';

/** The synced profile (Firestore `users/{uid}`). */
export interface Profile {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  visibility: ProfileVisibility;
  /** Linked Steam account; set by a server once Steam linking exists (Phase 5). */
  steamId: string | null;
  xp: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProfilePatch {
  username?: string;
  displayName?: string;
  bio?: string;
  visibility?: ProfileVisibility;
}

export interface AccountUser {
  id: string;
  email: string | null;
  emailVerified: boolean;
  /** Sign-in methods connected to this account. */
  providers: AccountProvider[];
}

/** A sign-in step waiting on the browser. */
export type AuthFlow = { kind: 'browser'; method: SignInMethod; linking: boolean };

export interface AuthState {
  /** False when this build has no Firebase project configured. */
  configured: boolean;
  status: 'loading' | 'signed-out' | 'signed-in';
  user: AccountUser | null;
  profile: Profile | null;
  flow: AuthFlow | null;
  message: { kind: 'error' | 'info'; text: string } | null;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

// ---------- Library and detection ----------

/** anker = installed by the Anker Games launcher; emulator = only found through local emulator achievement files. */
export type GameSource = 'module' | 'steam' | 'manual' | 'anker' | 'emulator';

export interface LibraryGame {
  /** "steam:<appid>", "manual:<id>", "module:<id>" (a supported game not found in Steam), "anker:<id>" or "emu:<appid>". */
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
  /** Steam app whose achievement list this game uses (its own app, a linked one, or Anker's). */
  achievementAppId?: number;
  /** Cover art from another launcher (Anker poster). */
  poster?: string;
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

// ---------- Achievements ----------

export type RarityTier = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export const RARITY_TIERS: RarityTier[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

/** Tier by global unlock percentage; unknown rarity counts as common. */
export function rarityTier(percent: number | null | undefined): RarityTier {
  if (percent === null || percent === undefined) return 'common';
  if (percent <= 2) return 'legendary';
  if (percent <= 10) return 'epic';
  if (percent <= 25) return 'rare';
  if (percent <= 50) return 'uncommon';
  return 'common';
}

/** steam = Steam's own stats cache; emulator = a local emulator file; manual = ticked in ShotCaller. */
export type UnlockVia = 'steam' | 'emulator' | 'manual';

export interface Achievement {
  /** Steam API name, or "custom:<id>" for the user's own. */
  id: string;
  name: string;
  description: string;
  hidden: boolean;
  icon: string | null;
  iconGray: string | null;
  /** Global unlock percentage, null when unknown. */
  rarity: number | null;
  unlocked: boolean;
  /** Epoch ms; null when locked or the time is unknown. */
  unlockedAt: number | null;
  via: UnlockVia | null;
  progress?: { current: number; max: number };
  custom?: boolean;
}

/** steam-local = Steam's cache on this PC; steam-public = Steam's public page; custom = only the user's own. */
export type AchievementListSource = 'steam-local' | 'steam-public' | 'custom' | 'none';

/** How unlocks are found: steam = Steam's stats cache; emulator = local emulator files (+ ticks); manual = ticks only. */
export type AchievementTracking = 'steam' | 'emulator' | 'manual';

export interface Session {
  /** Epoch ms. */
  start: number;
  end: number;
}

export interface GameAchievements {
  key: string;
  name: string;
  appId: number | null;
  listSource: AchievementListSource;
  tracking: AchievementTracking;
  achievements: Achievement[];
  total: number;
  unlocked: number;
  /** Minutes, from Steam's local playtime or ShotCaller's own sessions. */
  playtimeMinutes: number | null;
  lastPlayed: number | null;
  sessions: Session[];
  /** Set when the list couldn't be loaded (e.g. offline). */
  error?: string;
}

export interface GameSummary {
  key: string;
  total: number;
  unlocked: number;
  lastUnlockAt: number | null;
  playtimeMinutes: number | null;
}

export interface UnlockEvent {
  /** Stable id: "<gameKey>|<achievementId>" (syncs to users/{uid}/unlocks later). */
  id: string;
  gameKey: string;
  gameName: string;
  appId: number | null;
  achievementId: string;
  name: string;
  description: string;
  icon: string | null;
  rarity: number | null;
  /** Epoch ms, 0 when unknown. */
  unlockedAt: number;
  via: UnlockVia;
}

export interface HubState {
  ready: boolean;
  steamUser: { steamId: string; persona: string } | null;
  /** Game key -> completion summary, for games with an achievement list. */
  summaries: Record<string, GameSummary>;
  /** Bumped whenever any game's achievements change; the renderer refetches open views. */
  revision: number;
}

export interface SteamAppMatch {
  appId: number;
  name: string;
  image: string | null;
}

/** What the popup window shows. */
export interface PopupPayload {
  event: UnlockEvent;
  tier: RarityTier;
  sound: boolean;
  volume: number;
  corner: PopupCorner;
  test?: boolean;
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

  getHub(): Promise<HubState>;
  onHub(callback: (state: HubState) => void): Unsubscribe;
  getGameAchievements(key: string): Promise<GameAchievements | null>;
  getTimeline(limit: number): Promise<UnlockEvent[]>;
  /** Tick or untick an achievement by hand (non-Steam tracking only). */
  setManualUnlock(key: string, achievementId: string, unlocked: boolean): Promise<ActionResult>;
  searchSteamApps(term: string): Promise<SteamAppMatch[]>;
  /** Use a Steam game's achievement list for a non-Steam game; null removes the link. */
  linkSteamApp(key: string, appId: number | null): Promise<ActionResult>;
  addCustomAchievement(key: string, name: string, description: string): Promise<ActionResult>;
  removeCustomAchievement(key: string, achievementId: string): Promise<ActionResult>;
  testPopup(tier: RarityTier): Promise<void>;

  /** Skillshot City helper. State is pushed on every change (onSkillshot); get is for the first render. */
  getSkillshot(): Promise<SkillshotLiveState>;
  onSkillshot(callback: (state: SkillshotLiveState) => void): Unsubscribe;
  getSkillshotData(): Promise<SkillshotData | null>;
  getSkillshotMatches(): Promise<MatchRecord[]>;
  /** What the screen reader is doing and what it has read. Pushed on change and every few seconds while it runs. */
  getScreenStatus(): Promise<ScreenReadStatus>;
  onScreenStatus(callback: (status: ScreenReadStatus) => void): Unsubscribe;
  /** The latest picture the screen reader looked at, or null when it isn't running. */
  getScreenPreview(): Promise<ScreenPreview | null>;
  getMcpInfo(): Promise<McpInfo>;
  /** Your owned skills with rarity and the build you equip on each class, read from the game's files. Pushed on change. */
  getSkillCollection(): Promise<SkillCollection>;
  onSkillCollection(callback: (collection: SkillCollection) => void): Unsubscribe;
  /** Sets the offered skills (manual grid, screen reader). Empty clears the offer. */
  setSkillshotOffer(skillIds: string[]): Promise<void>;
  /** Picks offer #index (0 or 1) or a skill id. */
  pickSkillshot(which: number | string): Promise<void>;
  setSkillshotGoal(skillIds: string[], locked: boolean): Promise<void>;
  setSkillshotClass(classId: string | null): Promise<void>;

  /** Fortnite companion. Live state is pushed on every change. */
  getFortnite(): Promise<FnLiveState>;
  onFortnite(callback: (state: FnLiveState) => void): Unsubscribe;
  getFortniteMatches(): Promise<FnMatchRecord[]>;
  getFortniteScreen(): Promise<FnScreenStatus>;
  onFortniteScreen(callback: (status: FnScreenStatus) => void): Unsubscribe;
  getFortniteScreenPreview(): Promise<FnScreenPreview | null>;
  /** Opens the folder of saved screenshots in Explorer. */
  openFortniteShots(): Promise<void>;
  getFortniteMap(): Promise<FnMapState>;
  onFortniteMap(callback: (state: FnMapState) => void): Unsubscribe;
  /** The season map with place names as a data URL, or null until it's downloaded. */
  getFortniteMapImage(): Promise<string | null>;
  getFortniteRoute(matchId: string): Promise<FnRoute | null>;
  /** Landing/death spots of matches on the current season map. */
  getFortniteDrops(): Promise<FnDrop[]>;
  /** Squad link: share map dots with a friend by join code. */
  getFortniteSquad(): Promise<FnSquadState>;
  onFortniteSquad(callback: (state: FnSquadState) => void): Unsubscribe;
  startFortniteSquad(): Promise<FnSquadState>;
  joinFortniteSquad(code: string): Promise<FnSquadState>;
  leaveFortniteSquad(): Promise<FnSquadState>;
  getFortniteDisplays(): Promise<FnDisplay[]>;
  /** Opens the second-monitor map window now. */
  showFortniteMonitor(): Promise<void>;
  getFortniteStats(): Promise<FnStatsState>;
  onFortniteStats(callback: (state: FnStatsState) => void): Unsubscribe;
  refreshFortniteStats(force: boolean): Promise<FnStatsState>;
  /** Saves the fortnite-api.com key (empty removes it). The key never comes back to the renderer. */
  setFortniteApiKey(key: string): Promise<{ ok: true } | { ok: false; error: string }>;
  getFortniteShop(): Promise<FnShopState>;
  onFortniteShop(callback: (state: FnShopState) => void): Unsubscribe;
  searchFortniteCosmetics(query: string): Promise<FnShopItem[]>;
  /** Opens a Steam or web-search link in the browser (allow-listed hosts only). */
  openExternal(url: string): Promise<void>;
  /** Popup window only. */
  onPopup(callback: (payload: PopupPayload) => void): Unsubscribe;
  popupDone(): void;

  getAuthState(): Promise<AuthState>;
  onAuthState(callback: (state: AuthState) => void): Unsubscribe;
  /** Opens the provider's sign-in page in the browser; resolves once signed in, cancelled or failed. */
  signIn(method: SignInMethod): Promise<ActionResult>;
  signInWithEmail(email: string, password: string): Promise<ActionResult>;
  signUpWithEmail(email: string, password: string, displayName: string): Promise<ActionResult>;
  sendPasswordReset(email: string): Promise<ActionResult>;
  resendVerification(): Promise<ActionResult>;

  cancelAuthFlow(): Promise<void>;
  dismissAuthMessage(): Promise<void>;
  signOut(): Promise<void>;
  /** Connects another sign-in method to the signed-in account. */
  linkAccount(method: SignInMethod): Promise<ActionResult>;
  unlinkAccount(method: SignInMethod): Promise<ActionResult>;
  updateProfile(patch: ProfilePatch): Promise<ActionResult>;
  refreshProfile(): Promise<void>;
  /** Renderer errors, forwarded to the opt-in crash reporter. */
  reportError(message: string, stack?: string): void;

  enterApp(): Promise<void>;
  openMainWindow(): Promise<void>;
  windowControl(action: 'minimize' | 'maximize' | 'close'): Promise<void>;
}

declare global {
  interface Window {
    shotcaller: ShotCallerApi;
  }
}
