import type { SkillshotData, SkillshotSkill, SkillTier } from './skillshot';

/**
 * Skill pick advisor. Pure: scores each offered skill against the current build, class, goal build,
 * the game's own synergy list and your match history, and explains why in short reasons.
 */

export interface SkillStat {
  /** Matches where you finished with this skill. */
  played: number;
  wins: number;
}

export interface AdvisorInput {
  data: SkillshotData;
  /** Offered skills (skill ids), usually 2, sometimes 3. */
  offers: string[];
  /** Skill id → current level in your build. */
  build: Record<string, number>;
  /** Class id (e.g. "HEAVY") if known. */
  classId: string | null;
  /** Skill ids in the goal build, if one is set. */
  goal: string[];
  /** Skill ids that can still be offered (your in-game pool); empty = unknown. */
  pool: string[];
  /** Skill id → your rarity for it (0 common … 3 legendary), from your build and collection. */
  rarity?: Record<string, number>;
  round: number;
  /** Your history per skill id. */
  stats: Record<string, SkillStat>;
  /** Your overall win rate (0-1), for comparing a skill's win rate. */
  overallWinRate: number | null;
}

export interface SkillAdvice {
  skillId: string;
  score: number;
  /** Short reasons, strongest first. */
  reasons: string[];
  /** Synergies this pick would complete or keep growing. */
  synergies: number[];
  /** Level after taking it. */
  nextLevel: number;
}

export interface Advice {
  offers: SkillAdvice[];
  /** Index into offers of the recommended pick. */
  best: number;
  /** Suggest rerolling: every offer is weak for this build. */
  reroll: boolean;
  /** One-line summary for the overlay. */
  summary: string;
}

const TIER_SCORE: Record<SkillTier, number> = { S: 40, A: 30, B: 20, C: 10 };
/** Higher rarity = higher max level and stronger syringe mutations (the game's own help text). */
const RARITY_SCORE = [0, 5, 10, 15];
const RARITY_LABEL = ['Common', 'Rare', 'Epic', 'Legendary'];
const REROLL_BELOW = 24;

function synergyPartner(parts: [string, string], id: string): string | null {
  if (parts[0] === id) return parts[1];
  if (parts[1] === id) return parts[0];
  return null;
}

export function adviseSkill(input: AdvisorInput, skill: SkillshotSkill): SkillAdvice {
  const { data, build, classId, goal, pool, stats, overallWinRate } = input;
  const reasons: { w: number; text: string }[] = [];
  const synergies: number[] = [];
  const level = build[skill.id] ?? 0;
  let score = skill.tier ? TIER_SCORE[skill.tier] : 20;
  if (skill.tier === 'S' || skill.tier === 'A') reasons.push({ w: 5, text: `${skill.tier} tier` });

  for (const syn of data.synergies) {
    const partner = synergyPartner(syn.parts, skill.id);
    if (!partner) continue;
    const partnerName = (id: string) =>
      id.startsWith('class:')
        ? (data.classes.find((c) => `class:${c.id}` === id)?.name ?? id.slice(6))
        : (data.skills.find((s) => s.id === id)?.name ?? id);
    if (partner.startsWith('class:')) {
      if (classId && partner === `class:${classId}`) {
        score += 22;
        synergies.push(syn.index);
        reasons.push({ w: 22, text: `Synergy with your class (${partnerName(partner)})` });
      }
    } else if (build[partner]) {
      score += level > 0 ? 10 : 25;
      synergies.push(syn.index);
      reasons.push({ w: 25, text: `Synergy with ${partnerName(partner)}` });
    } else if (goal.includes(partner) || (pool.length && pool.includes(partner))) {
      score += 6;
      reasons.push({ w: 6, text: `Sets up ${partnerName(partner)} synergy` });
    }
  }

  const rarity = input.rarity?.[skill.id] ?? 0;
  if (rarity > 0) {
    score += RARITY_SCORE[rarity] ?? 0;
    reasons.push({ w: RARITY_SCORE[rarity] ?? 0, text: `Your ${RARITY_LABEL[rarity]}: higher max level, stronger mutation` });
  }

  if (level > 0) {
    score += 12;
    reasons.push({ w: 12, text: `Levels your ${skill.name} to ${level + 1}` });
  }
  if (goal.includes(skill.id)) {
    score += 20;
    reasons.push({ w: 20, text: 'Part of your goal build' });
  }

  const st = stats[skill.id];
  if (st && st.played >= 3 && overallWinRate !== null) {
    const wr = st.wins / st.played;
    const delta = wr - overallWinRate;
    score += Math.round(delta * 40);
    if (Math.abs(delta) >= 0.1)
      reasons.push({
        w: Math.abs(delta) * 30,
        text: `You win ${Math.round(wr * 100)}% with it (${delta > 0 ? 'above' : 'below'} your ${Math.round(overallWinRate * 100)}%)`,
      });
  }

  reasons.sort((a, b) => b.w - a.w);
  return { skillId: skill.id, score, reasons: reasons.map((r) => r.text).slice(0, 3), synergies, nextLevel: level + 1 };
}

export function advise(input: AdvisorInput): Advice | null {
  const offers = input.offers
    .map((id) => input.data.skills.find((s) => s.id === id))
    .filter((s): s is SkillshotSkill => !!s)
    .map((s) => adviseSkill(input, s));
  if (!offers.length) return null;
  let best = 0;
  offers.forEach((o, i) => {
    if (o.score > offers[best].score) best = i;
  });
  const reroll = offers.every((o) => o.score < REROLL_BELOW);
  const name = (id: string) => input.data.skills.find((s) => s.id === id)?.name ?? id;
  const top = offers[best];
  const summary = reroll
    ? 'Both are weak for this build. Reroll if you can.'
    : `Take ${name(top.skillId)}${top.reasons[0] ? `: ${top.reasons[0].charAt(0).toLowerCase()}${top.reasons[0].slice(1)}` : ''}`;
  return { offers, best, reroll, summary };
}

/** Synergies currently active in a build (both parts owned, class counts). */
export function activeSynergies(data: SkillshotData, build: Record<string, number>, classId: string | null): number[] {
  const has = (p: string) => (p.startsWith('class:') ? !!classId && p === `class:${classId}` : !!build[p]);
  return data.synergies.filter((s) => has(s.parts[0]) && has(s.parts[1])).map((s) => s.index);
}

/** Goal-build progress 0-1: share of goal skills owned. */
export function goalProgress(goal: string[], build: Record<string, number>): number {
  if (!goal.length) return 0;
  return goal.filter((g) => build[g]).length / goal.length;
}

/**
 * Suggests a goal build from your first picks: the skills that share the most official synergies
 * with what you already have (and your class), limited to the pool when known.
 */
export function suggestGoal(data: SkillshotData, build: Record<string, number>, classId: string | null, pool: string[], size = 5): string[] {
  const owned = Object.keys(build);
  const score = new Map<string, number>();
  for (const syn of data.synergies) {
    for (const [a, b] of [syn.parts, [syn.parts[1], syn.parts[0]] as [string, string]]) {
      if (b.startsWith('class:')) continue;
      const anchored = a.startsWith('class:') ? classId && a === `class:${classId}` : owned.includes(a);
      if (!anchored || owned.includes(b)) continue;
      if (pool.length && !pool.includes(b)) continue;
      score.set(b, (score.get(b) ?? 0) + 1);
    }
  }
  const extra = [...score.entries()].sort((x, y) => y[1] - x[1]).map(([id]) => id);
  // Not enough synergy partners: fill with the strongest skills you can still be offered.
  const rank = (id: string) => TIER_SCORE[data.skills.find((s) => s.id === id)?.tier ?? 'C'];
  const fill = (pool.length ? pool : data.skills.map((s) => s.id))
    .filter((id) => !owned.includes(id) && !extra.includes(id))
    .sort((a, b) => rank(b) - rank(a));
  return [...owned, ...extra, ...fill].slice(0, Math.max(size, owned.length + 1));
}
