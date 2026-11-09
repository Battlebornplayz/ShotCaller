import { MAX_LEVEL_BY_RARITY, type SkillshotData, type SkillshotSkill, type SkillshotSynergy } from './skillshot';
import {
  backupsFor,
  BUILD_SIZE,
  buildSynergies,
  equipPlan,
  isDefensive,
  isPassive,
  levelOrder,
  setScore,
  SHIELDS,
  skillValue,
  type BuilderInput,
  type BuildPlan,
  type Sliders,
} from './skillshotBuilder';
import type { SkillshotStats } from './skillshotStats';

/**
 * The coach behind the hand-built skill builder, plus the synergy map's shape. Pure. You choose the skills;
 * this says what the build does well, what it lacks and what to look at next, in plain language. Only the
 * game's official synergies count as links: no readable file says which other skills work well together.
 */

/** Middle-of-the-road sliders: coaching judges the skills themselves, not a chosen style. */
const NEUTRAL: Sliders = { aggression: 50, range: 50, survival: 60, spice: 0 };

const MAX_LOCKED_ON_MAP = 4;
const MAX_NEXT = 3;
const MAX_HINTS = 3;
const DAMAGE_ROLES = new Set(['Burst', 'Gun damage', 'Damage over time']);
const TIER_ORDER: Record<string, number> = { S: 3, A: 2, B: 1, C: 0 };

export type CheckStatus = 'good' | 'warn' | 'todo';

export interface BuildCheck {
  id: string;
  status: CheckStatus;
  title: string;
  detail: string;
}

export interface NextPick {
  id: string;
  why: string;
}

export interface UnlockHint {
  id: string;
  /** Your skills, picked ones first, or a class id prefixed "class:", that it pairs with. */
  pairsWith: string[];
  tip: string;
}

export interface BuildCoaching {
  checks: BuildCheck[];
  synergies: SkillshotSynergy[];
  nextPicks: NextPick[];
  levelFirst: BuildPlan['levelFirst'];
  backups: string[];
  equip: BuildPlan['equip'];
  hints: UnlockHint[];
}

export interface CoachInput {
  data: SkillshotData;
  picks: string[];
  classId: string | null;
  /** Skills you own → rarity, or null when the game has never shown its rarity. */
  owned: Map<string, number | null>;
  stats: SkillshotStats | null;
}

const names = (skills: SkillshotSkill[]) => skills.map((s) => s.name).join(', ');
const className = (data: SkillshotData, part: string) => data.classes.find((c) => `class:${c.id}` === part)?.name ?? part.slice(6);

/** The official synergies touching a skill, among the ones that could apply with this class. */
export function synergiesOf(data: SkillshotData, id: string, classId: string | null): SkillshotSynergy[] {
  return data.synergies.filter((s) => s.parts.includes(id) && s.parts.every((p) => !p.startsWith('class:') || p === `class:${classId}`));
}

/** The other side of a synergy from `id`. */
export const partnerOf = (syn: SkillshotSynergy, id: string): string => (syn.parts[0] === id ? syn.parts[1] : syn.parts[0]);

function checksFor(input: CoachInput, skills: SkillshotSkill[], active: SkillshotSynergy[]): BuildCheck[] {
  const { picks, owned } = input;
  const out: BuildCheck[] = [];
  const started = picks.length >= 3;

  const guards = skills.filter(isDefensive);
  if (guards.length) out.push({ id: 'survive', status: 'good', title: 'Keeps you alive', detail: `${names(guards)} helps you survive fights.` });
  else out.push({ id: 'survive', status: started ? 'warn' : 'todo', title: 'Nothing keeps you alive yet', detail: 'A healing or defense skill gives you room for mistakes while you learn.' });

  const hitters = skills.filter((s) => DAMAGE_ROLES.has(s.role ?? '') || s.tree === 'Damage' || s.tree === 'DOT' || s.tree === 'Weaponry');
  if (hitters.length) out.push({ id: 'damage', status: 'good', title: 'Adds damage', detail: `${names(hitters)} helps you win fights.` });
  else out.push({ id: 'damage', status: started ? 'warn' : 'todo', title: 'Nothing adds damage yet', detail: 'Without a damage skill, your gun does all the work.' });

  const actives = skills.filter((s) => !isPassive(s));
  if (actives.length >= 3) out.push({ id: 'buttons', status: 'warn', title: `${actives.length} skills to press`, detail: `${names(actives)} all need timing. That's a lot to manage mid-fight.` });
  else if (skills.length) out.push({ id: 'buttons', status: 'good', title: actives.length ? `${actives.length} to press, the rest automatic` : 'All automatic', detail: 'Easy to run, so you can keep your eyes on the fight.' });

  const shields = skills.filter((s) => SHIELDS.has(s.id));
  if (shields.length > 1) out.push({ id: 'shields', status: 'warn', title: 'Shields overlap', detail: `${names(shields)} multiply rather than add, so the second one gives less than it looks.` });

  if (active.length) out.push({ id: 'synergy', status: 'good', title: active.length === 1 ? '1 official synergy' : `${active.length} official synergies`, detail: 'Skills that make each other stronger. The tips are below.' });
  else out.push({ id: 'synergy', status: started ? 'warn' : 'todo', title: 'No synergies yet', detail: 'Green lines on the map show the skills that pair up.' });

  const weak = skills.filter((s) => s.tier === 'C');
  const strong = skills.filter((s) => s.tier === 'S' || s.tier === 'A');
  if (weak.length) out.push({ id: 'ranked', status: 'warn', title: 'Weak ranked results', detail: `${names(weak)} win less than most skills on skillshotcity.gg. These numbers are provisional.` });
  else if (strong.length) out.push({ id: 'ranked', status: 'good', title: 'Good ranked results', detail: `${names(strong)} win more than most skills on skillshotcity.gg. These numbers are provisional.` });

  const commons = skills.filter((s) => owned.get(s.id) === 0);
  if (commons.length) out.push({ id: 'rarity', status: 'warn', title: `${names(commons)}: Common`, detail: `Common skills stop at level ${MAX_LEVEL_BY_RARITY[0]}, and the last levels add the most.` });

  return out;
}

/** The first true thing is the reason, since it's what matters most for a new player. */
function whyPick(input: CoachInput, s: SkillshotSkill, skills: SkillshotSkill[]): string {
  const { data, picks, classId, owned } = input;
  const pair = synergiesOf(data, s.id, classId).find((syn) => {
    const other = partnerOf(syn, s.id);
    return picks.includes(other) || other.startsWith('class:');
  });
  if (pair) {
    const other = partnerOf(pair, s.id);
    const name = other.startsWith('class:') ? className(data, other) : (data.skills.find((x) => x.id === other)?.name ?? other);
    return `Official synergy with ${name}.`;
  }
  if (!skills.some(isDefensive) && isDefensive(s)) return 'Your build has nothing keeping you alive yet.';
  if (skills.length >= 1 && !skills.some((x) => DAMAGE_ROLES.has(x.role ?? '')) && DAMAGE_ROLES.has(s.role ?? '')) return 'Your build needs more damage.';
  if ((owned.get(s.id) ?? -1) >= 2) return `Yours is high rarity, so it can reach level ${MAX_LEVEL_BY_RARITY[owned.get(s.id)!]}.`;
  if (s.tier === 'S' || s.tier === 'A') return 'Wins more than most skills in ranked.';
  if (isPassive(s)) return 'Works on its own, with nothing to press.';
  return 'A solid fit for what you have so far.';
}

/** With nothing chosen yet, show one of each job rather than three of the same, so the choice teaches something. */
function firstPicks(input: CoachInput, ranked: SkillshotSkill[]): NextPick[] {
  const { data, classId, owned } = input;
  const strength = (s: SkillshotSkill) => {
    const rarity = owned.get(s.id) ?? -1;
    if (rarity >= 2) return ` Yours can reach level ${MAX_LEVEL_BY_RARITY[rarity]}.`;
    return s.tier === 'S' || s.tier === 'A' ? ' Wins more than most in ranked.' : '';
  };
  const isDamage = (s: SkillshotSkill) => DAMAGE_ROLES.has(s.role ?? '') || s.tree === 'Damage' || s.tree === 'DOT' || s.tree === 'Weaponry';
  const out: NextPick[] = [];
  const add = (s: SkillshotSkill | undefined, why: string) => {
    if (s && !out.some((p) => p.id === s.id)) out.push({ id: s.id, why: why + strength(s) });
  };
  add(ranked.find(isDefensive), 'Keeps you alive while you learn.');
  add(ranked.find(isDamage), 'Helps you win fights.');
  const classPair = ranked.find((s) => !out.some((p) => p.id === s.id) && synergiesOf(data, s.id, classId).some((syn) => partnerOf(syn, s.id).startsWith('class:')));
  const className_ = data.classes.find((c) => c.id === classId)?.name;
  add(classPair, `Official synergy with ${className_}.`);
  add(ranked.find((s) => !out.some((p) => p.id === s.id) && !isDefensive(s) && !isDamage(s)), 'Adds something different to your build.');
  for (const s of ranked) if (out.length < MAX_NEXT) add(s, 'A solid place to start.');
  return out.slice(0, MAX_NEXT);
}

function hintsFor(input: CoachInput): UnlockHint[] {
  const { data, picks, classId, owned } = input;
  const ranked: (UnlockHint & { score: number; tier: number })[] = [];
  for (const s of data.skills) {
    if (owned.has(s.id)) continue;
    const syns = synergiesOf(data, s.id, classId).filter((syn) => {
      const other = partnerOf(syn, s.id);
      return other.startsWith('class:') || owned.has(other);
    });
    if (!syns.length) continue;
    const weight = (syn: SkillshotSynergy) => {
      const other = partnerOf(syn, s.id);
      return picks.includes(other) ? 3 : other.startsWith('class:') ? 2 : 1;
    };
    syns.sort((a, b) => weight(b) - weight(a));
    ranked.push({
      id: s.id,
      pairsWith: syns.map((syn) => partnerOf(syn, s.id)),
      tip: syns[0].tip,
      score: syns.reduce((sum, syn) => sum + weight(syn), 0),
      tier: TIER_ORDER[s.tier ?? 'B'] ?? 1,
    });
  }
  return ranked
    .sort((a, b) => b.score - a.score || b.tier - a.tier || a.id.localeCompare(b.id))
    .slice(0, MAX_HINTS)
    .map(({ id, pairsWith, tip }) => ({ id, pairsWith, tip }));
}

export function coachBuild(input: CoachInput): BuildCoaching {
  const { data, picks, classId, owned, stats } = input;
  const scoring: BuilderInput = { data, sliders: NEUTRAL, style: null, classId, owned, simple: true, stats };
  const pool = data.skills.filter((s) => owned.has(s.id));
  const values = new Map(pool.map((s) => [s.id, skillValue(scoring, s)]));
  const skills = picks.map((id) => data.skills.find((s) => s.id === id)).filter((s): s is SkillshotSkill => !!s);
  const active = buildSynergies(data, picks, classId).map((i) => data.synergies.find((s) => s.index === i)!);

  const ranked = pool
    .filter((s) => !picks.includes(s.id))
    .map((s) => ({ s, score: setScore(scoring, [...picks, s.id], values) }))
    .sort((a, b) => b.score - a.score)
    .map(({ s }) => s);
  let nextPicks: NextPick[];
  if (picks.length >= BUILD_SIZE) nextPicks = [];
  else if (picks.length) nextPicks = ranked.slice(0, MAX_NEXT).map((s) => ({ id: s.id, why: whyPick(input, s, skills) }));
  else nextPicks = firstPicks(input, ranked);

  const backups = picks.length ? backupsFor(scoring, pool, picks, values) : [];
  return {
    checks: checksFor(input, skills, active),
    synergies: active,
    nextPicks,
    levelFirst: picks.length ? levelOrder(scoring, picks, values) : [],
    backups,
    equip: equipPlan(scoring, picks, backups),
    hints: hintsFor(input),
  };
}

// ---------------------------------------------------------------------------------------------
// The synergy map

export type MapNodeKind = 'skill' | 'locked' | 'class';

export interface MapNode {
  id: string;
  kind: MapNodeKind;
}

export interface MapEdge {
  a: string;
  b: string;
  index: number;
}

export interface SynergyMap {
  nodes: MapNode[];
  edges: MapEdge[];
  /** Owned skills with no official pair on the map. They go in a tray instead of floating alone. */
  loose: string[];
}

/** Your linked skills, your class in the middle, and the few locked skills that would link the most. */
export function buildMap(data: SkillshotData, owned: Map<string, number | null>, classId: string | null): SynergyMap {
  const hub = classId ? `class:${classId}` : null;
  const usable = data.synergies.filter((s) => s.parts.every((p) => !p.startsWith('class:') || p === hub));
  const linked = new Set<string>();
  for (const s of usable) {
    const [a, b] = s.parts;
    const on = (p: string) => owned.has(p) || p === hub;
    if (on(a) && on(b)) {
      linked.add(a);
      linked.add(b);
    }
  }
  const lockedLinks = new Map<string, number>();
  for (const s of usable) {
    const [a, b] = s.parts;
    if ((owned.has(a) || a === hub) && !owned.has(b) && b !== hub) lockedLinks.set(b, (lockedLinks.get(b) ?? 0) + 1);
    if ((owned.has(b) || b === hub) && !owned.has(a) && a !== hub) lockedLinks.set(a, (lockedLinks.get(a) ?? 0) + 1);
  }
  const tierOf = (id: string) => TIER_ORDER[data.skills.find((s) => s.id === id)?.tier ?? 'B'] ?? 1;
  const locked = [...lockedLinks.entries()]
    .sort((a, b) => b[1] - a[1] || tierOf(b[0]) - tierOf(a[0]) || a[0].localeCompare(b[0]))
    .slice(0, MAX_LOCKED_ON_MAP)
    .map(([id]) => id);

  const shown = new Set([...linked, ...locked]);
  if (hub) shown.add(hub);
  // A skill whose only link is to a locked skill that's on the map belongs on the map too.
  for (const s of usable) {
    const [a, b] = s.parts;
    if (locked.includes(a) && owned.has(b)) shown.add(b);
    if (locked.includes(b) && owned.has(a)) shown.add(a);
  }
  const edges = usable.filter((s) => shown.has(s.parts[0]) && shown.has(s.parts[1])).map((s) => ({ a: s.parts[0], b: s.parts[1], index: s.index }));
  const nodes: MapNode[] = [...shown].sort().map((id) => ({ id, kind: id === hub ? 'class' : owned.has(id) ? 'skill' : 'locked' }));
  const byName = (a: string, b: string) => a.localeCompare(b);
  return { nodes, edges, loose: [...owned.keys()].filter((id) => !shown.has(id)).sort(byName) };
}

export interface MapLayout {
  width: number;
  height: number;
  at: Record<string, { x: number; y: number }>;
}

const ROOM_X = 112;
const ROOM_Y = 92;
const EDGE_X = 60;
const EDGE_TOP = 42;
const EDGE_BOTTOM = 58;

/**
 * Places the map's nodes in pixels: linked nodes pull together, everything pushes apart, and a last pass
 * stops icons and their names overlapping. Same input, same picture, so nothing jumps as you pick.
 */
export function layoutMap(map: SynergyMap, width: number): MapLayout {
  const n = map.nodes.length;
  const height = Math.max(360, Math.round((n * ROOM_X * ROOM_Y * 1.9) / width));
  const cx = width / 2;
  const cy = height / 2;
  const pos = map.nodes.map((node, i) => {
    if (node.kind === 'class') return { id: node.id, x: cx, y: cy, vx: 0, vy: 0, fixed: true };
    const angle = i * 2.399963; // Golden angle: an even spread that doesn't depend on chance.
    const r = 60 + (i / Math.max(1, n)) * Math.min(cx, cy) * 0.8;
    return { id: node.id, x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r, vx: 0, vy: 0, fixed: false };
  });
  const byId = new Map(pos.map((p) => [p.id, p]));
  const aspect = width / height;
  for (let step = 0; step < 420; step++) {
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const a = pos[i];
        const b = pos[j];
        const dx = a.x - b.x || 0.01;
        const dy = a.y - b.y || 0.01;
        const d2 = dx * dx + dy * dy;
        const f = 26000 / d2;
        const d = Math.sqrt(d2);
        a.vx += (dx / d) * f;
        a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f;
        b.vy -= (dy / d) * f;
      }
    }
    for (const e of map.edges) {
      const a = byId.get(e.a);
      const b = byId.get(e.b);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - 135) * 0.06;
      a.vx += (dx / d) * f;
      a.vy += (dy / d) * f;
      b.vx -= (dx / d) * f;
      b.vy -= (dy / d) * f;
    }
    for (const p of pos) {
      if (p.fixed) continue;
      p.vx += ((cx - p.x) * 0.012) / aspect;
      p.vy += (cy - p.y) * 0.012 * aspect;
      p.x += Math.max(-24, Math.min(24, p.vx));
      p.y += Math.max(-24, Math.min(24, p.vy));
      p.vx *= 0.72;
      p.vy *= 0.72;
      p.x = Math.max(EDGE_X, Math.min(width - EDGE_X, p.x));
      p.y = Math.max(EDGE_TOP, Math.min(height - EDGE_BOTTOM, p.y));
    }
  }
  for (let pass = 0; pass < 60; pass++) {
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const a = pos[i];
        const b = pos[j];
        const ox = ROOM_X - Math.abs(a.x - b.x);
        const oy = ROOM_Y - Math.abs(a.y - b.y);
        if (ox <= 0 || oy <= 0) continue;
        // Push along the shorter way out. A fixed node stays put, so the other one moves the full distance.
        const horizontal = ox / ROOM_X < oy / ROOM_Y;
        const dir = horizontal ? (a.x < b.x ? -1 : 1) : a.y < b.y ? -1 : 1;
        const move = (horizontal ? ox : oy) / (a.fixed || b.fixed ? 1 : 2);
        const shift = (p: (typeof pos)[number], sign: number) => {
          if (p.fixed) return;
          if (horizontal) p.x = Math.max(EDGE_X, Math.min(width - EDGE_X, p.x + sign * move));
          else p.y = Math.max(EDGE_TOP, Math.min(height - EDGE_BOTTOM, p.y + sign * move));
        };
        shift(a, dir);
        shift(b, -dir);
      }
    }
  }
  return { width, height, at: Object.fromEntries(pos.map((p) => [p.id, { x: Math.round(p.x), y: Math.round(p.y) }])) };
}
