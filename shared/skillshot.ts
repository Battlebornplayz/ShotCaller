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
  /** Community tip, from tiers.json. */
  note?: string;
}

export const SKILL_TREES = ['Healing', 'Defense', 'Weaponry', 'Damage', 'DOT', 'Utility'] as const;
export type SkillTree = (typeof SKILL_TREES)[number];

export interface SkillshotClass {
  id: string;
  name: string;
  nameEn: string;
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
  advice: import('./skillshotAdvisor').Advice | null;
  goal: { ids: string[]; locked: boolean };
  goalProgress: number;
  activeSynergies: number[];
  /** Newest saved match, for the lobby view. */
  lastMatch: MatchRecord | null;
  /** Time of the newest log line seen (unix ms); the log can run minutes behind. */
  logTime: number | null;
}
