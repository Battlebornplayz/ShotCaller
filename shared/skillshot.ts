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
  role?: string;
  tags?: string[];
}

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
