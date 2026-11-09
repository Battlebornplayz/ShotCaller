import { MAX_LEVEL_BY_RARITY, type SkillshotData, type SkillshotSkill } from './skillshot';
import type { SkillshotStats } from './skillshotStats';

/**
 * Build planner for Skillshot City. Pure. Turns a playstyle (preset + sliders) into the top 3 builds
 * you can actually get, using official synergies, ranked stats, your rarities and your own results.
 *
 * The game's draft shapes everything here: 5 skills per match, mostly random from every skill you've
 * unlocked, with only the right-hand offer on skills 3 and 4 coming from your equipped build. So a plan
 * is a preference with backups, never a promise. No per-skill damage or cooldown table exists in any
 * readable game file, so skill numbers aren't an input yet.
 */

export const BUILD_SIZE = 5;
const TOP_SLOTS = 2;
const BOTTOM_SLOTS = 6;

export interface Sliders {
  /** 0 hang back … 100 pick fights. */
  aggression: number;
  /** 0 close … 100 long. */
  range: number;
  /** 0 glass cannon … 100 hard to kill. */
  survival: number;
  /** 0 proven … 100 wild. */
  spice: number;
}

export interface Playstyle {
  id: string;
  name: string;
  pitch: string;
  core: string[];
  flex: string[];
  classes: string[];
  sliders: Sliders;
}

export interface BuilderInput {
  data: SkillshotData;
  sliders: Sliders;
  style: Playstyle | null;
  classId: string | null;
  /** Skills you own → rarity, or null when the game has never shown its rarity. */
  owned: Map<string, number | null>;
  /** Mostly automatic skills, easier while learning. */
  simple: boolean;
  stats: SkillshotStats | null;
  /** Non-zero = "surprise me": shakes up the scores so the result differs. */
  seed?: number;
}

export interface BuildPlan {
  /** Skill ids, in the order to prefer them. */
  skills: string[];
  /** 0-100, how well this suits the chosen style compared with the best plan. */
  fit: number;
  pros: string[];
  cons: string[];
  /** Skills to level first, best first, each with why. */
  levelFirst: { id: string; why: string }[];
  /** Best skills to take when a build skill isn't offered. */
  backups: string[];
  /** What to equip in the game's skill build. */
  equip: { top: string[]; bottom: string[] };
  /** Official synergies this build completes (their indexes). */
  synergies: number[];
}

const TIER_VALUE: Record<string, number> = { S: 100, A: 75, B: 50, C: 20 };

/** ShotCaller's judgment of how close each skill wants you, where it isn't the middle (50). */
const RANGE_BIAS: Record<string, number> = {
  BLADEFURY: 10,
  SOULDROP: 20,
  PROXIMITYROUNDS: 20,
  POISONTRAIL: 25,
  ENERGYVORTEX: 30,
  CLUSTERBOMB: 35,
  SHIFTATTACK: 35,
  FRENZY: 40,
  HYPNOTICARMY: 40,
  REVENGEROCKET: 40,
  SPIKETRAP: 45,
  GUNSLINGER: 55,
  BOUNCINGBULLETS: 60,
  CHARGEDSHOT: 60,
  CLIPMAGNET: 60,
  FLYINGDAGGER: 60,
  VENOMSHOT: 65,
  XRAYVISION: 65,
  LASERSCOPE: 85,
  RADIATE: 85,
  FIRESTORM: 90,
};

/** Defensive shields multiply rather than add, so stacking them wastes slots (Mirror Image guide). */
const SHIELDS = new Set(['AUTOMATICARMOR', 'BLADEMAIL', 'MANASHIELD']);

const isPassive = (s: SkillshotSkill) => s.tags?.includes('passive') ?? false;
const isDefensive = (s: SkillshotSkill) => s.tree === 'Healing' || s.tree === 'Defense';

function aggressionOf(s: SkillshotSkill): number {
  if (s.tags?.includes('economy')) return 25;
  switch (s.role) {
    case 'Burst':
      return 80;
    case 'Gun damage':
      return 75;
    case 'Damage over time':
      return 65;
    case 'Tank':
    case 'Sustain':
      return 30;
    default:
      return 40;
  }
}

function survivalOf(s: SkillshotSkill): number {
  if (isDefensive(s)) return 85;
  if (s.tags?.includes('stealth') || s.tags?.includes('mobility')) return 60;
  return s.role === 'Utility' ? 35 : 20;
}

/** Small repeatable random number from a seed and a skill, so a surprise build is stable while shown. */
function shake(seed: number, id: string): number {
  let h = seed | 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 2654435761);
  return ((h >>> 0) % 1000) / 1000;
}

function skillValue(input: BuilderInput, s: SkillshotSkill): number {
  const { sliders, style, owned, seed } = input;
  const fit =
    100 -
    Math.abs(aggressionOf(s) - sliders.aggression) * 0.35 -
    Math.abs((RANGE_BIAS[s.id] ?? 50) - sliders.range) * 0.35 -
    Math.abs(survivalOf(s) - sliders.survival) * 0.3;
  const spice = sliders.spice / 100;
  const meta = TIER_VALUE[s.tier ?? 'B'] ?? 50;
  const wild = 100 - Math.min(100, (s.stats?.all[0] ?? 10) * 5);
  let v = fit * 0.5 + meta * 0.5 * (1 - spice) + wild * 0.5 * spice;
  v += (owned.get(s.id) ?? 0) * 6;
  if (style?.core.includes(s.id)) v += 18;
  else if (style?.flex.includes(s.id)) v += 8;
  if (seed) v += shake(seed, s.id) * 30;
  return v;
}

function setScore(input: BuilderInput, ids: string[], values: Map<string, number>): number {
  const { data, classId, simple, sliders, stats } = input;
  let score = ids.reduce((sum, id) => sum + (values.get(id) ?? 0), 0);
  const skills = ids.map((id) => data.skills.find((s) => s.id === id)!);
  for (const syn of data.synergies) {
    const [a, b] = syn.parts;
    const has = (p: string) => (p.startsWith('class:') ? classId !== null && p === `class:${classId}` : ids.includes(p));
    if (!has(a) || !has(b)) continue;
    score += syn.kind === 'class-skill' ? 12 : 15;
    // Your own results with this pair, once there's enough to mean anything (lower place is better).
    const b2 = stats?.bySynergy.find((x) => x.key === String(syn.index));
    if (b2 && b2.placed >= 3 && stats?.summary.avgPlace) score += Math.max(-10, Math.min(10, (stats.summary.avgPlace - b2.placeSum / b2.placed) * 3));
  }
  const shields = ids.filter((id) => SHIELDS.has(id)).length;
  if (shields > 1) score -= (shields - 1) * 15;
  const actives = skills.filter((s) => !isPassive(s)).length;
  if (actives > 3) score -= (actives - 3) * 10;
  if (simple && actives > 1) score -= (actives - 1) * 12;
  if (sliders.survival >= 30 && !skills.some(isDefensive)) score -= 20;
  // Your own K/D with these skills together, the only per-build number the log can give.
  if (stats) {
    for (const b of stats.byBuild) {
      if (b.played < 3 || !b.key.split('+').every((id) => ids.includes(id))) continue;
      score += Math.max(-10, Math.min(10, (b.kills / Math.max(1, b.deaths) - (stats.summary.kd ?? 1)) * 5));
    }
  }
  return score;
}

/** Beam search: complete builds of BUILD_SIZE, highest score first. */
function searchBuilds(input: BuilderInput, pool: SkillshotSkill[], values: Map<string, number>): { ids: string[]; score: number }[] {
  let beam: string[][] = [[]];
  const size = Math.min(BUILD_SIZE, pool.length);
  for (let step = 0; step < size; step++) {
    const next = new Map<string, string[]>();
    for (const cur of beam) {
      for (const s of pool) {
        if (cur.includes(s.id)) continue;
        const ids = [...cur, s.id];
        next.set([...ids].sort().join('+'), ids);
      }
    }
    beam = [...next.values()].sort((a, b) => setScore(input, b, values) - setScore(input, a, values)).slice(0, 60);
  }
  return beam.map((ids) => ({ ids, score: setScore(input, ids, values) })).sort((a, b) => b.score - a.score);
}

function buildSynergies(data: SkillshotData, ids: string[], classId: string | null): number[] {
  const has = (p: string) => (p.startsWith('class:') ? classId !== null && p === `class:${classId}` : ids.includes(p));
  return data.synergies.filter((s) => has(s.parts[0]) && has(s.parts[1])).map((s) => s.index);
}

function describe(input: BuilderInput, ids: string[], synergies: number[]): { pros: string[]; cons: string[] } {
  const { data, owned, sliders } = input;
  const skills = ids.map((id) => data.skills.find((s) => s.id === id)!);
  const pros: string[] = [];
  const cons: string[] = [];
  if (synergies.length >= 2) pros.push(`${synergies.length} official synergies`);
  else if (synergies.length === 1) pros.push('1 official synergy');
  else cons.push('No official synergies between these');
  const strong = skills.filter((s) => s.tier === 'S' || s.tier === 'A').length;
  if (strong >= 3) pros.push(`${strong} of ${skills.length} skills do well in ranked stats`);
  const weak = skills.filter((s) => s.tier === 'C').map((s) => s.name);
  if (weak.length) cons.push(`Weak results: ${weak.join(', ')}`);
  const healers = skills.filter((s) => s.tree === 'Healing').length;
  const tanks = skills.filter((s) => s.tree === 'Defense').length;
  if (healers + tanks >= 2) pros.push('Hard to kill');
  else if (healers + tanks === 0) cons.push('Nothing protects you: you’ll rely on auto-heal and your gun');
  if (!healers && tanks) cons.push('No healing skill');
  const actives = skills.filter((s) => !isPassive(s)).length;
  if (actives <= 1) pros.push('Simple: almost everything is automatic');
  else if (actives >= 3) cons.push(`${actives} skills to press and time yourself`);
  const rare = skills.filter((s) => (owned.get(s.id) ?? 0) >= 2).map((s) => s.name);
  if (rare.length) pros.push(`You own ${rare.join(', ')} at Epic or better`);
  const common = skills.filter((s) => owned.get(s.id) === 0).length;
  if (common >= 2) cons.push(`${common} are only Common, so they stop at level ${MAX_LEVEL_BY_RARITY[0]}`);
  const avgUse = skills.reduce((sum, s) => sum + (s.stats?.all[0] ?? 0), 0) / skills.length;
  if (sliders.spice >= 50 && avgUse < 9) pros.push('Unusual: few players will expect it');
  return { pros, cons };
}

function levelOrder(input: BuilderInput, ids: string[], values: Map<string, number>): { id: string; why: string }[] {
  const { data, owned } = input;
  const cap = (id: string) => {
    const r = owned.get(id);
    return r === null || r === undefined ? null : MAX_LEVEL_BY_RARITY[r];
  };
  const ranked = [...ids].sort((a, b) => (cap(b) ?? 5) - (cap(a) ?? 5) || (values.get(b) ?? 0) - (values.get(a) ?? 0));
  return ranked.slice(0, 2).map((id, i) => {
    const s = data.skills.find((x) => x.id === id)!;
    const c = cap(id);
    const reason = c && c >= 6 ? `Your rarity lets it reach level ${c}, and the last levels add the most` : isPassive(s) ? 'Works all the time without you doing anything' : 'Your strongest pick in this build';
    return { id, why: i === 0 ? `Spend your first syringe here. ${reason}.` : `Next. ${reason}.` };
  });
}

function backupsFor(input: BuilderInput, pool: SkillshotSkill[], ids: string[], values: Map<string, number>): string[] {
  const { data, classId } = input;
  const score = (s: SkillshotSkill) => {
    const pairs = buildSynergies(data, [...ids, s.id], classId).length - buildSynergies(data, ids, classId).length;
    return (values.get(s.id) ?? 0) + pairs * 15 - (SHIELDS.has(s.id) && ids.some((id) => SHIELDS.has(id)) ? 30 : 0);
  };
  return pool
    .filter((s) => !ids.includes(s.id))
    .sort((a, b) => score(b) - score(a))
    .slice(0, 5)
    .map((s) => s.id);
}

/**
 * The game's top section takes 2 Legendaries and feeds the skill-3 offer. The bottom section takes
 * the other skills, and the skill-4 offer comes from your build. Only skills you own can go in.
 */
function equipPlan(input: BuilderInput, ids: string[], backups: string[]): BuildPlan['equip'] {
  const top = [...ids, ...backups].filter((id) => input.owned.get(id) === 3).slice(0, TOP_SLOTS);
  const bottom = [...ids, ...backups].filter((id) => !top.includes(id)).slice(0, BOTTOM_SLOTS);
  return { top, bottom };
}

export function planBuilds(input: BuilderInput): BuildPlan[] {
  const pool = input.data.skills.filter((s) => input.owned.has(s.id));
  if (!pool.length) return [];
  const values = new Map(pool.map((s) => [s.id, skillValue(input, s)]));
  const found = searchBuilds(input, pool, values);
  const picks: { ids: string[]; score: number }[] = [];
  for (const b of found) {
    // Each plan has to be a real alternative: at least 2 different skills from every earlier plan.
    if (picks.every((p) => b.ids.filter((id) => !p.ids.includes(id)).length >= 2)) picks.push(b);
    if (picks.length === 3) break;
  }
  const best = picks[0]?.score ?? 1;
  return picks.map((b) => {
    const skills = [...b.ids].sort((x, y) => (values.get(y) ?? 0) - (values.get(x) ?? 0));
    const synergies = buildSynergies(input.data, skills, input.classId);
    const backups = backupsFor(input, pool, skills, values);
    return {
      skills,
      fit: Math.round((b.score / best) * 100),
      ...describe(input, skills, synergies),
      levelFirst: levelOrder(input, skills, values),
      backups,
      equip: equipPlan(input, skills, backups),
      synergies,
    };
  });
}
