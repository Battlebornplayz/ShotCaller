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
}

export const DEFAULT_FORTNITE_SETTINGS: FortniteSettings = {
  screenReader: true,
  recorder: false,
  cardOpacity: 0.6,
  cardScale: 1,
  card: { match: true, session: true, today: true, allTime: false },
};

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
