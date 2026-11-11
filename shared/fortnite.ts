// Fortnite companion: types shared by the main process and the renderer.
import type { FnKind, FnModeInfo, FnPhase, FnTeamSize } from './fortniteLog';

export interface FortniteCardParts {
  /** This match: chests (and eliminations once read). */
  match: boolean;
  /** Since ShotCaller started. */
  session: boolean;
  today: boolean;
  allTime: boolean;
}

export interface FortniteSettings {
  /** Read the screen (a copy of small areas, offline) for chests. On by default. */
  screenReader: boolean;
  /** Save screenshots while you play, to build and check readers. Off by default; local only, capped. */
  recorder: boolean;
  /** Card opacity, 0.3-1. Default 0.6. */
  cardOpacity: number;
  /** Card size, 0.8-1.5. Default 1. */
  cardScale: number;
  card: FortniteCardParts;
  /** Find your spot on the map from the minimap (and teammates' from their arrows on it). On by default. */
  liveMap: boolean;
  /** How you show on the map: a dot, a Fortnite-style arrow, or your own picture (`markerImage`, a small PNG data URL). */
  marker: 'dot' | 'arrow' | 'image';
  /** Fortnite's resolution: 'auto' (the window's size) or 'WxH'; `stretched` = a narrower one stretched to fill the screen (otherwise black bars). */
  resolution: string;
  stretched: boolean;
  markerImage: string | null;
  /** The second-monitor window: opens and closes with Fortnite on the chosen screen. */
  monitor: { on: boolean; displayId: number | null };
  /** Your Epic name for online stats (the key itself is kept apart, never in settings). */
  epicName: string;
  /** Chests goal for today; 0 = no goal. */
  chestGoal: number;
  /** Cosmetic ids to watch for in the item shop. */
  wishlist: { id: string; name: string }[];
}

export const DEFAULT_FORTNITE_SETTINGS: FortniteSettings = {
  screenReader: true,
  recorder: false,
  cardOpacity: 0.6,
  cardScale: 1,
  card: { match: true, session: true, today: true, allTime: false },
  liveMap: true,
  marker: 'arrow',
  resolution: 'auto',
  stretched: true,
  markerImage: null,
  monitor: { on: true, displayId: null },
  epicName: '',
  chestGoal: 0,
  wishlist: [],
};

// ---------- Live map ----------

/** A point on the season map, in its pixels (0-2048). */
export interface FnPoint {
  x: number;
  y: number;
}

export interface FnChestPin extends FnPoint {
  kind: FnChestKind;
  at: number;
}

/** Where you got an elimination (your dot when the count went up). */
export interface FnKillPin extends FnPoint {
  at: number;
}

/** Saved per match in userData/fortnite/routes/<match id>.json. */
export interface FnRoute {
  matchId: string;
  /** The season map the points belong to. */
  mapId: string;
  /** [x, y, seconds since the match started], about one a second while the dot is sure. */
  points: [number, number, number][];
  chests: FnChestPin[];
  landing: FnPoint | null;
  death: FnPoint | null;
  kills?: FnKillPin[];
}

export interface FnMapState {
  /** Map download: ready, fetching, or failed (with why). */
  map: { status: 'none' | 'loading' | 'ready' | 'error'; id: string | null; error: string | null; fetchedAt: number | null };
  /** Your dot: sure = matched just now; unsure = last good spot, kept while the minimap can't be read. */
  dot: (FnPoint & { state: 'sure' | 'unsure'; at: number }) | null;
  teammates: (FnPoint & { color: string })[];
  route: [number, number][];
  chests: FnChestPin[];
  landing: FnPoint | null;
  death: FnPoint | null;
  kills: FnKillPin[];
  /** Your planned route (click the map to add stops); `planStep` is the next stop not reached yet. */
  plan: FnPoint[];
  planStep: number;
  /** Squad-link friends' dots and paths (Phase F5 early build). */
  squad: FnFriend[];
}

/** A friend linked by join code: their own ShotCaller reads their minimap and sends their dot. */
export interface FnFriend {
  id: string;
  name: string;
  dot: (FnPoint & { state: 'sure' | 'unsure'; at: number }) | null;
  route: [number, number][];
  /** Their chest, kill, landing and death icons and planned route (sent by friends on beta.8+). */
  marks?: FnFriendMarks;
  /** How they chose to show on the map (beta.10+), and their picture when it's 'image'. */
  look?: 'dot' | 'arrow' | 'image';
  pic?: string | null;
  /** When we last heard from them (our clock). */
  seenAt: number;
}

export interface FnFriendMarks {
  chests: FnChestPin[];
  kills: FnKillPin[];
  landing: FnPoint | null;
  death: FnPoint | null;
  plan: FnPoint[];
}

export interface FnSquadState {
  status: 'off' | 'connecting' | 'on' | 'error';
  code: string | null;
  error: string | null;
  friends: { id: string; name: string; seenAt: number; inventory: string | null }[];
  /** Your own hotbar picture (JPEG data URL), cropped from the screen about every 2 s in a match. */
  mine: string | null;
}

/** One match's landing and death spots, for drop stats. */
export interface FnDrop {
  matchId: string;
  mapId: string;
  startedAt: number;
  placement: number | null;
  landing: FnPoint | null;
  death: FnPoint | null;
  chests: number;
}

export interface FnDisplay {
  id: number;
  label: string;
  primary: boolean;
  width: number;
  height: number;
}

// ---------- Online stats (fortnite-api.com) ----------

export interface FnStatBlock {
  matches: number;
  wins: number;
  kills: number;
  kd: number;
  winRate: number;
  top10: number;
  minutesPlayed: number;
}

export interface FnStats {
  name: string;
  battlePass: { level: number; progress: number } | null;
  /** By mode: overall, solo, duo, trio, squad (whatever the service returns). */
  season: Record<string, FnStatBlock>;
  lifetime: Record<string, FnStatBlock>;
  fetchedAt: number;
}

export interface FnStatsState {
  hasKey: boolean;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  stats: FnStats | null;
}

// ---------- Item shop ----------

export interface FnShopItem {
  id: string;
  name: string;
  type: string;
  rarity: string;
  price: number;
  image: string | null;
}

export interface FnShopState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  date: string | null;
  items: FnShopItem[];
  /** Wishlisted items in today's shop. */
  wished: FnShopItem[];
}

/** chest / rare / sprite come from the screen; manual is the +1 hotkey (chests you break show no popup). */
export type FnChestKind = 'chest' | 'rare' | 'sprite' | 'manual';
export type FnChestKinds = Record<FnChestKind, number>;
export const NO_CHEST_KINDS: FnChestKinds = { chest: 0, rare: 0, sprite: 0, manual: 0 };

/** One finished match, saved in userData/fortnite/matches.json. */
export interface FnMatchRecord {
  id: string;
  startedAt: number;
  endedAt: number;
  playlist: string | null;
  kind: FnKind;
  zeroBuild: boolean;
  teamSize: FnTeamSize;
  /** Every chest, all kinds together. */
  chests: number;
  /** By kind; missing on matches saved before chest kinds were read (all of those are in `chests`). */
  chestKinds?: FnChestKinds;
  /** Not read yet in F1: null. */
  eliminations: number | null;
  placement: number | null;
  /** From the bus leaving to the end (F1); the death screen refines it later. */
  timeAliveMs: number | null;
  endReason: 'lobby' | 'next' | 'closed' | null;
}

export interface FnTotals {
  match: number;
  session: number;
  today: number;
  allTime: number;
}

export interface FnLiveState {
  /** Whether Fortnite's log folder exists on this PC. */
  logFound: boolean;
  running: boolean;
  match: {
    startedAt: number;
    playlist: string | null;
    mode: FnModeInfo;
    phase: FnPhase | null;
    chests: number;
    chestKinds: FnChestKinds;
    /** Read live from the number next to the skull; null until first read. */
    eliminations: number | null;
  } | null;
  chests: FnTotals;
  /** This session: matches, wins (placed #1), eliminations and the time alive they took. */
  session: { matches: number; wins: number; eliminations: number; deaths: number; chests: number };
  /** Rare chests only (they're also in `chests`). */
  rareChests: FnTotals;
  sessionMatches: number;
  lastMatch: FnMatchRecord | null;
}

export type FnScreenMode = 'off' | 'no-game' | 'lobby' | 'not-front' | 'no-picture' | 'watching';

export interface FnChestRead {
  at: number;
  score: number;
  kind: FnChestKind;
}

export interface FnScreenStatus {
  mode: FnScreenMode;
  frames: number;
  width: number;
  height: number;
  /** Best label score on the latest look (0-1), for the Screen check page. */
  lastScore: number | null;
  /** The settled eliminations read this match, null until read. */
  eliminations: number | null;
  /** Chests read this session, newest last. */
  chests: FnChestRead[];
  recorder: { on: boolean; saved: number; cap: number };
}

export interface FnScreenPreview {
  image: string;
  aspect: number;
  /** Where the best label match was, as fractions of the picture. */
  match: { x: number; y: number; width: number; height: number } | null;
  score: number | null;
}
