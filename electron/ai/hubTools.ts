import { z } from 'zod';
import type { LibraryGame } from '../../shared/types';
import { getGameAchievements, getHubState, getTimeline } from '../achievements';
import { getDetectionState } from '../detection';
import { getLibrary } from '../library';
import { fail, json, type ToolSet } from './tools';

/**
 * App-wide tools (Phase D2): the player's games across every store, playtime, what's running now, and Steam /
 * ShotCaller achievements. Read only. Game-specific tools come from each game's own set (dbd_, fortnite_, ...).
 */

const INSTRUCTIONS = `Games and achievements (tools start with games_): every game ShotCaller found on this PC across stores (Steam, Epic, Xbox, GOG and more), playtime, what's running now, and achievements with how rare each is.
- For "what should I play" or "what achievement is closest", look at the data (playtime, last played, unlocked vs total, rarity) and say why.`;

const day = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString().slice(0, 10) : null);
const hours = (min: number | null | undefined) => (min ? Math.round((min / 60) * 10) / 10 : null);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function findGame(query: string): LibraryGame | null {
  const games = getLibrary().games.filter((g) => !g.hidden);
  const q = norm(query);
  return (
    games.find((g) => norm(g.name) === q) ??
    games.find((g) => norm(g.name).startsWith(q)) ??
    games.find((g) => norm(g.name).includes(q)) ??
    null
  );
}

function gameLine(g: LibraryGame) {
  const sum = getHubState().summaries[g.key];
  return {
    name: g.name,
    stores: [...new Set([g.source, ...(g.copies ?? []).map((c) => c.source)])],
    installed: g.installed,
    hoursPlayed: hours(g.playMinutes),
    lastPlayed: day(g.lastPlayed),
    achievements: sum ? `${sum.unlocked}/${sum.total}` : null,
    shotCallerModule: g.moduleId ?? null,
  };
}

export const hubTools: ToolSet = {
  id: 'games',
  instructions: INSTRUCTIONS,
  available: () => true,
  register(mcp) {
    const read = { readOnlyHint: true };

    mcp.registerTool(
      'games_list',
      {
        description:
          "The player's games (not tools or hidden ones) with stores, installed, hours played, last played and achievement progress. Sorted by last played.",
        inputSchema: {
          installed_only: z.boolean().optional(),
          limit: z.number().int().min(1).max(500).optional().describe('Default 100.'),
        },
        annotations: read,
      },
      async ({ installed_only, limit }) => {
        const games = getLibrary()
          .games.filter((g) => !g.hidden && !g.isTool && (!installed_only || g.installed))
          .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0));
        return json({ total: games.length, games: games.slice(0, limit ?? 100).map(gameLine) });
      },
    );

    mcp.registerTool(
      'games_now_playing',
      { description: 'Which games are running right now, and since when.', annotations: read },
      async () =>
        json(
          getDetectionState().running.map((r) => ({
            name: r.name,
            since: new Date(r.since).toISOString(),
            shotCallerModule: r.moduleId ?? null,
          })),
        ),
    );

    mcp.registerTool(
      'games_achievements',
      {
        description:
          "One game's achievements: unlocked and locked, with descriptions and how many players have each (rarity %). Locked ones come rarest-last, so the easiest to get next are first. Hidden achievements keep their secret unless the player asks.",
        inputSchema: {
          game: z.string().min(1).describe('Game name (close is fine).'),
          show: z.enum(['locked', 'unlocked', 'all']).optional().describe('Default locked.'),
          limit: z.number().int().min(1).max(300).optional().describe('Default 40.'),
        },
        annotations: read,
      },
      async ({ game, show, limit }) => {
        const g = findGame(game);
        if (!g) return fail(`No game called "${game}" in the player's library. Use games_list.`);
        const a = await getGameAchievements(g.key);
        if (!a || !a.total) return fail(`ShotCaller has no achievement list for ${g.name}.`);
        const which = show ?? 'locked';
        const list = a.achievements
          .filter((x) => which === 'all' || (which === 'locked' ? !x.unlocked : x.unlocked))
          .sort((x, y) =>
            which === 'unlocked'
              ? (y.unlockedAt ?? 0) - (x.unlockedAt ?? 0)
              : (y.rarity ?? -1) - (x.rarity ?? -1),
          );
        return json({
          game: a.name,
          unlocked: a.unlocked,
          total: a.total,
          hoursPlayed: hours(a.playtimeMinutes),
          achievements: list.slice(0, limit ?? 40).map((x) => ({
            name: x.name,
            description: x.hidden && !x.unlocked ? '(hidden achievement)' : x.description,
            unlocked: x.unlocked,
            unlockedOn: day(x.unlockedAt),
            playersWithIt: x.rarity !== null ? `${x.rarity.toFixed(1)}%` : null,
            progress: x.progress ? `${x.progress.current}/${x.progress.max}` : null,
          })),
        });
      },
    );

    mcp.registerTool(
      'games_recent_unlocks',
      {
        description: 'The latest achievements the player unlocked, across all games.',
        inputSchema: { limit: z.number().int().min(1).max(100).optional().describe('Default 20.') },
        annotations: read,
      },
      async ({ limit }) =>
        json(
          getTimeline(limit ?? 20).map((u) => ({
            game: u.gameName,
            name: u.name,
            description: u.description,
            on: day(u.unlockedAt),
            playersWithIt: u.rarity !== null ? `${u.rarity.toFixed(1)}%` : null,
          })),
        ),
    );
  },
};
