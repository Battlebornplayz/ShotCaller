// Fortnite match score (0-100), personal bests and streaks, from ShotCaller's own match history.
import type { FnMatchRecord } from './fortnite';

/** The score's parts, shown with the formula in the hub. */
export interface FnScore {
  total: number;
  placement: number | null;
  eliminations: number;
  timeAlive: number;
}

/** Shown under the score so it's never a mystery (DESIGN.md Q26). */
export const SCORE_FORMULA = [
  'Placement: up to 50 points. A win is 50; lower places lose points on a log scale (#10 ≈ 25, #50 ≈ 7, #100 = 0).',
  'Eliminations: 3 points each, up to 30 (10 or more eliminations).',
  'Time alive: 1 point a minute, up to 20 (20 minutes or more).',
  'Placement comes from Fortnite’s own “YOU PLACED #N” screen. When it wasn’t read (older team matches, or you left before it showed), the other two parts are scaled up to 100.',
];

export function matchScore(m: Pick<FnMatchRecord, 'placement' | 'eliminations' | 'timeAliveMs'>): FnScore {
  const elims = Math.min(30, (m.eliminations ?? 0) * 3);
  const alive = Math.min(20, (m.timeAliveMs ?? 0) / 60_000);
  let place: number | null = null;
  if (m.placement !== null && m.placement >= 1) place = m.placement === 1 ? 50 : Math.max(0, 50 * (1 - Math.log(m.placement) / Math.log(100)));
  const total = place === null ? ((elims + alive) / 50) * 100 : place + elims + alive;
  return { total: Math.round(total), placement: place === null ? null : Math.round(place), eliminations: Math.round(elims), timeAlive: Math.round(alive) };
}

export interface FnBest {
  value: number;
  matchId: string | null;
  at: number | null;
}

export interface FnBests {
  kills: FnBest;
  chests: FnBest;
  score: FnBest;
  timeAliveMs: FnBest;
  /** Matches in a row placed in the top 10 / won: now and best ever. Matches with no placement are skipped. */
  top10Streak: { current: number; best: number };
  winStreak: { current: number; best: number };
  wins: number;
  matches: number;
}

const none = (): FnBest => ({ value: 0, matchId: null, at: null });

export function personalBests(matches: FnMatchRecord[]): FnBests {
  const b: FnBests = { kills: none(), chests: none(), score: none(), timeAliveMs: none(), top10Streak: { current: 0, best: 0 }, winStreak: { current: 0, best: 0 }, wins: 0, matches: matches.length };
  const better = (slot: FnBest, v: number, m: FnMatchRecord) => {
    if (v > slot.value) Object.assign(slot, { value: v, matchId: m.id, at: m.endedAt });
  };
  for (const m of [...matches].sort((x, y) => x.endedAt - y.endedAt)) {
    better(b.kills, m.eliminations ?? 0, m);
    better(b.chests, m.chests, m);
    better(b.score, matchScore(m).total, m);
    better(b.timeAliveMs, m.timeAliveMs ?? 0, m);
    if (m.placement === null) continue;
    if (m.placement === 1) b.wins++;
    b.top10Streak.current = m.placement <= 10 ? b.top10Streak.current + 1 : 0;
    b.winStreak.current = m.placement === 1 ? b.winStreak.current + 1 : 0;
    b.top10Streak.best = Math.max(b.top10Streak.best, b.top10Streak.current);
    b.winStreak.best = Math.max(b.winStreak.best, b.winStreak.current);
  }
  return b;
}

/** "Best loadouts": the item names you carried at the end, by how well those matches went. */
export interface FnLoadoutStat {
  /** Item names in slot order, joined with " · " (unnamed items show as their rarity). */
  label: string;
  matches: number;
  avgPlacement: number | null;
  avgScore: number;
  wins: number;
}

export function bestLoadouts(matches: FnMatchRecord[]): FnLoadoutStat[] {
  const groups = new Map<string, FnMatchRecord[]>();
  for (const m of matches) {
    if (!m.loadout?.length) continue;
    const label = m.loadout
      .filter((i) => i.name || i.rarity)
      .map((i) => i.name ?? `${i.rarity} item`)
      .join(' · ');
    if (!label) continue;
    groups.set(label, [...(groups.get(label) ?? []), m]);
  }
  return [...groups.entries()]
    .map(([label, ms]) => {
      const placed = ms.filter((m) => m.placement !== null);
      return {
        label,
        matches: ms.length,
        avgPlacement: placed.length ? placed.reduce((s, m) => s + m.placement!, 0) / placed.length : null,
        avgScore: ms.reduce((s, m) => s + matchScore(m).total, 0) / ms.length,
        wins: ms.filter((m) => m.placement === 1).length,
      };
    })
    .sort((a, b) => b.avgScore - a.avgScore);
}

const RANK_ORDER = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'elite', 'champion', 'unreal'];

/** A rank as one number for the chart: each division is 1, progress fills it (Bronze I 0% = 0). */
export function rankValue(rank: string, division: number | null, progress: number | null): number {
  const tier = RANK_ORDER.indexOf(rank.toLowerCase());
  if (tier < 0) return 0;
  const base = tier <= 4 ? tier * 3 + ((division ?? 1) - 1) : 15 + (tier - 5);
  return base + (tier < 7 ? Math.min(100, progress ?? 0) / 100 : 0);
}

export function rankLabel(rank: string, division: number | null): string {
  const r = rank.charAt(0).toUpperCase() + rank.slice(1).toLowerCase();
  return division ? `${r} ${['I', 'II', 'III'][division - 1] ?? division}` : r;
}

/** Reads a rank from text on screen: "GOLD II", "Platinum 1", "UNREAL", plus a progress "47%" when shown. */
export function parseRank(text: string): { rank: string; division: number | null; progress: number | null } | null {
  const m = /\b(BRONZE|SILVER|GOLD|PLATINUM|DIAMOND|ELITE|CHAMPION|UNREAL)\b(?:\s+(III|II|I|[123])\b)?/i.exec(text);
  if (!m) return null;
  const rank = m[1].toLowerCase();
  const d = m[2]?.toUpperCase();
  const division = rank === 'elite' || rank === 'champion' || rank === 'unreal' ? null : d ? ({ I: 1, II: 2, III: 3 } as Record<string, number>)[d] ?? Number(d) : null;
  const p = /(\d{1,3})\s*%/.exec(text);
  const progress = p ? Math.min(100, Number(p[1])) : null;
  return { rank, division, progress };
}

/** Placement from the end banner: "YOU PLACED #4" or "VICTORY ROYALE" (1), as Windows' text reader returns it. */
export function parsePlacement(text: string): number | null {
  if (/VICTORY\s*ROYALE/i.test(text)) return 1;
  // "YOU PLACED #4" comes back as "VOVPUCED#4", "VOU PLACED #4"...: a P..C..D word, then # and the number.
  const m = /P\w{0,4}C\w{0,2}D\s*#\s*(\d{1,3})\b/i.exec(text);
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 100 ? n : null;
}
