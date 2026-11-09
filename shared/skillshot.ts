/**
 * Skillshot City data, extracted read-only from the game's own files
 * (`<install>/data/translations/<lang>.csv` and `<install>/data/log*.txt`).
 * Tiers, roles and tags are ShotCaller's own layer on top (games/skillshot-city/tiers.json).
 */

export type SkillTier = 'S' | 'A' | 'B' | 'C';

export interface SkillshotSkill {
  /** Game key, e.g. "RADIATE" (from XL1000_SKILL_RADIATE). Also used in log lines, upper-cased names. */
  id: string;
  name: string;
  /** English name, used to match log lines and synergy prerequisites. */
  nameEn: string;
  description: string;
  short: string;
  mutation: string;
  tier?: SkillTier;
  /** Skill tree (Healing, Defense, Weaponry, Damage, DOT, Utility), from tiers.json. */
  tree?: SkillTree;
  role?: string;
  /** "active" / "passive" plus themes (fire, poison, economy, …). */
  tags?: string[];
  /** Tip or caution from research, from tiers.json. */
  note?: string;
  /** The game's numeric skill id (log lines, memory), from icons.json. */
  num?: number;
  /** The game's own icon as a data URL, cropped from the installed game. Missing if the crop failed. */
  icon?: string;
  /** Plain-language "how to use it" for new players, from tiers.json. */
  how?: string;
  /** Ranked stats as [usage %, win %, average trophies], all ranks and top 100, from tiers.json. */
  stats?: { all: [number, number, number]; top: [number, number, number] };
}

/** Highest level a skill can reach at each rarity (Common … Legendary), per the game's text. */
export const MAX_LEVEL_BY_RARITY = [4, 5, 6, 7] as const;

export const SKILL_TREES = ['Healing', 'Defense', 'Weaponry', 'Damage', 'DOT', 'Utility'] as const;
export type SkillTree = (typeof SKILL_TREES)[number];

export interface SkillshotClass {
  id: string;
  name: string;
  nameEn: string;
  /** The game's own description, in the game's language. */
  description?: string;
}

export interface SkillshotSynergy {
  /** Index of the game's synergy challenge (SYNERGYCHALLENGE_<index>_DESC). */
  index: number;
  /** Two prerequisite ids: skill ids, or a class id prefixed "class:". */
  parts: [string, string];
  kind: 'class-skill' | 'skill-skill';
  tip: string;
}

export interface SkillshotData {
  installDir: string;
  language: string;
  /** Game version from data/config.ini (::VERSION). */
  gameVersion: string | null;
  skills: SkillshotSkill[];
  classes: SkillshotClass[];
  synergies: SkillshotSynergy[];
  /** The game's own loading-screen tips, in the game's language. */
  tips?: string[];
  extractedAt: number;
}

/** A finished (or abandoned) match, saved in userData/skillshot/matches.json. */
export interface MatchRecord {
  /** Start time (unix ms) — stable across re-imports, used to de-duplicate. */
  id: string;
  startedAt: number;
  endedAt: number;
  /** 1-based placement when the log had final standings. */
  place: number | null;
  won: boolean;
  score: number | null;
  kills: number;
  deaths: number;
  level: number;
  /** Skill id → final level. */
  build: Record<string, number>;
  picks: { round: number; offers: string[]; picked: string | null; advised?: string | null }[];
  roundResults: (boolean | null)[];
  killedBy: Record<string, number>;
  classId: string | null;
  /** True when the log had final standings (the match was played to the end). */
  complete: boolean;
}

export type OfferSource = 'manual' | 'screen' | 'memory';

/**
 * What the screen reader is doing. off: turned off in settings. no-game: game not running. not-front: game
 * isn't the front window, so nothing is read. no-picture: the copy failed or came back black. watching: looking
 * for offers. offer: an offer is on screen now.
 */
export type ScreenReadMode = 'off' | 'no-game' | 'not-front' | 'no-picture' | 'watching' | 'offer';

/**
 * How a read compares with the game's log. waiting: the log hasn't written this draft yet. right: same two
 * skills, and the same pick if one was seen. pick-wrong / offer-wrong: the log says otherwise. missed: the log
 * has a draft the screen never saw. rerolled: replaced on screen by a reroll, so the log never records it.
 */
export type ScreenReadVerdict = 'waiting' | 'right' | 'pick-wrong' | 'offer-wrong' | 'missed' | 'rerolled';

export interface ScreenRead {
  id: number;
  at: number;
  offers: string[];
  /** Confidence for each offer, 0-1; empty for a draft only the log saw. */
  scores: number[];
  /** Rarity read off each card (0 Common … 3 Legendary), null while not sure. Missing for a draft only the log saw. */
  rarities?: (number | null)[];
  picked: string | null;
  /** How the pick was known. 'log' = the screen couldn't tell, the log filled it in. */
  how: 'build row' | 'click' | 'not in build row' | 'log' | null;
  verdict: ScreenReadVerdict;
  /** What the log said, when it disagreed. */
  logged?: { offers: string[]; picked: string | null };
}

export interface ScreenReadStatus {
  mode: ScreenReadMode;
  /** Pictures looked at since the game started. It climbs while the reader is alive. */
  frames: number;
  /** The game picture's size in pixels, once seen. */
  width: number;
  height: number;
  /** This session, oldest first. */
  reads: ScreenRead[];
}

/** The strip the reader looked at most recently, with where it looks marked as fractions of the picture. */
export interface ScreenPreview {
  image: string;
  aspect: number;
  offers: { x: number; y: number; width: number; height: number }[];
  buildRow: { x: number; y: number; width: number; height: number };
}

export interface SkillshotLiveState {
  available: boolean;
  /** Why it isn't available (game not installed, etc.). */
  reason?: string;
  inMatch: boolean;
  self: string | null;
  round: number;
  final: boolean;
  /** Per round: true = won, false = lost, null = not played / unknown. */
  roundResults: (boolean | null)[];
  level: number;
  kills: number;
  deaths: number;
  syringes: number;
  wanted: number;
  classId: string | null;
  /** Where the class came from: picked in ShotCaller, or read from your last finished match. */
  classSource: 'manual' | 'auto' | null;
  /** Skill id → level: log-confirmed picks plus manual picks the log hasn't written yet. */
  build: Record<string, number>;
  /** Skill id → rarity (0 common … 3 legendary) from your in-game pool. */
  pool: Record<string, number>;
  /** Last picks, newest last. */
  recentPicks: { skillId: string; level: number; round: number; confirmed: boolean }[];
  offer: { ids: string[]; source: OfferSource; at: number } | null;
  /** Advice sent by Claude over the optional MCP connection, shown on the overlay until the next offer. */
  coach: { text: string; skillId: string | null; at: number } | null;
  /** The newest skill seen at a higher rarity than ShotCaller knew, for a small notice. */
  rarityUp: { skillId: string; rarity: number; at: number } | null;
  advice: import('./skillshotAdvisor').Advice | null;
  goal: { ids: string[]; locked: boolean };
  goalProgress: number;
  activeSynergies: number[];
  /** Newest saved match, for the lobby view. */
  lastMatch: MatchRecord | null;
  /** Time of the newest log line seen (unix ms); the log can run minutes behind. */
  logTime: number | null;
}
