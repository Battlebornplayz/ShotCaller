// ShotCaller's own Fortnite achievements (DESIGN.md Q29): earned from the match history ShotCaller keeps.
import type { FnMatchRecord } from './fortnite';
import { matchScore, personalBests } from './fortniteScore';
import type { RarityTier } from './types';

export interface FnAchievementDef {
  /** Stored as "sc:fn:<id>". */
  id: string;
  name: string;
  description: string;
  tier: RarityTier;
  earned: (ctx: FnAchievementContext) => boolean;
}

export interface FnAchievementContext {
  matches: FnMatchRecord[];
  totalChests: number;
}

const any = (ctx: FnAchievementContext, test: (m: FnMatchRecord) => boolean) => ctx.matches.some(test);
const RANKS = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'elite', 'champion', 'unreal'];
const reachedRank = (ctx: FnAchievementContext, rank: string) => any(ctx, (m) => !!m.rank && RANKS.indexOf(m.rank.rank) >= RANKS.indexOf(rank));

export const FN_ACHIEVEMENTS: FnAchievementDef[] = [
  { id: 'first-drop', name: 'First Drop', description: 'Finish a match with ShotCaller running.', tier: 'common', earned: (c) => c.matches.length >= 1 },
  { id: 'regular', name: 'Regular', description: 'Finish 25 matches.', tier: 'uncommon', earned: (c) => c.matches.length >= 25 },
  { id: 'veteran', name: 'Veteran', description: 'Finish 250 matches.', tier: 'epic', earned: (c) => c.matches.length >= 250 },
  { id: 'first-elim', name: 'First Blood', description: 'Get an elimination.', tier: 'common', earned: (c) => any(c, (m) => (m.eliminations ?? 0) >= 1) },
  { id: 'five-elims', name: 'On a Roll', description: 'Get 5 eliminations in one match.', tier: 'rare', earned: (c) => any(c, (m) => (m.eliminations ?? 0) >= 5) },
  { id: 'ten-elims', name: 'Double Digits', description: 'Get 10 eliminations in one match.', tier: 'epic', earned: (c) => any(c, (m) => (m.eliminations ?? 0) >= 10) },
  { id: 'top-ten', name: 'Top 10', description: 'Place in the top 10.', tier: 'uncommon', earned: (c) => any(c, (m) => m.placement !== null && m.placement <= 10) },
  { id: 'victory', name: 'Victory Royale', description: 'Win a match.', tier: 'rare', earned: (c) => any(c, (m) => m.placement === 1) },
  { id: 'top10-streak', name: 'Consistent', description: 'Place in the top 10 three matches in a row.', tier: 'epic', earned: (c) => personalBests(c.matches).top10Streak.best >= 3 },
  { id: 'win-streak', name: 'Back to Back', description: 'Win two matches in a row.', tier: 'legendary', earned: (c) => personalBests(c.matches).winStreak.best >= 2 },
  { id: 'looter', name: 'Looter', description: 'Open 5 chests in one match.', tier: 'common', earned: (c) => any(c, (m) => m.chests >= 5) },
  { id: 'treasure-hunter', name: 'Treasure Hunter', description: 'Open 12 chests in one match.', tier: 'rare', earned: (c) => any(c, (m) => m.chests >= 12) },
  { id: 'rare-find', name: 'Rare Find', description: 'Open a rare chest.', tier: 'uncommon', earned: (c) => any(c, (m) => (m.chestKinds?.rare ?? 0) >= 1) },
  { id: 'sprite-seeker', name: 'Sprite Seeker', description: 'Open a sprite chest.', tier: 'rare', earned: (c) => any(c, (m) => (m.chestKinds?.sprite ?? 0) >= 1) },
  { id: 'chests-100', name: 'Chest Collector', description: 'Open 100 chests in all.', tier: 'uncommon', earned: (c) => c.totalChests >= 100 },
  { id: 'chests-1000', name: 'Chest Hoarder', description: 'Open 1,000 chests in all.', tier: 'legendary', earned: (c) => c.totalChests >= 1000 },
  { id: 'survivor', name: 'Survivor', description: 'Stay alive for 20 minutes in one match.', tier: 'uncommon', earned: (c) => any(c, (m) => (m.timeAliveMs ?? 0) >= 20 * 60_000) },
  { id: 'score-80', name: 'Big Game', description: 'Score 80 or more in a match.', tier: 'epic', earned: (c) => any(c, (m) => matchScore(m).total >= 80) },
  { id: 'full-kit', name: 'Full Kit', description: 'End a match with all 5 slots filled.', tier: 'common', earned: (c) => any(c, (m) => (m.loadout?.length ?? 0) >= 5) },
  { id: 'gold-standard', name: 'Gold Standard', description: 'End a match carrying a legendary or mythic item.', tier: 'rare', earned: (c) => any(c, (m) => !!m.loadout?.some((i) => i.rarity === 'legendary' || i.rarity === 'mythic' || i.rarity === 'exotic')) },
  { id: 'ranked-in', name: 'On the Ladder', description: 'Have your Ranked rank read after a Ranked match.', tier: 'common', earned: (c) => any(c, (m) => !!m.rank) },
  { id: 'rank-gold', name: 'Gold Rush', description: 'Reach Gold in Ranked.', tier: 'uncommon', earned: (c) => reachedRank(c, 'gold') },
  { id: 'rank-diamond', name: 'Diamond', description: 'Reach Diamond in Ranked.', tier: 'epic', earned: (c) => reachedRank(c, 'diamond') },
  { id: 'rank-unreal', name: 'Unreal', description: 'Reach Unreal in Ranked.', tier: 'legendary', earned: (c) => reachedRank(c, 'unreal') },
];

export const FN_ACH_PREFIX = 'sc:fn:';

/** Ids (with the prefix) of every achievement the history earns. */
export function earnedFnAchievements(ctx: FnAchievementContext): string[] {
  return FN_ACHIEVEMENTS.filter((a) => {
    try {
      return a.earned(ctx);
    } catch {
      return false;
    }
  }).map((a) => FN_ACH_PREFIX + a.id);
}
