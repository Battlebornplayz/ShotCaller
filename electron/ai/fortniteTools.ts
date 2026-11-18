import { z } from 'zod';
import { getFortniteMatches, getFortniteState } from '../fortnite/tracker';
import { getShop, getStats } from '../fortnite/online';
import { json, type ToolSet } from './tools';

/**
 * Fortnite tools (Phase D2): the player's own match history from ShotCaller (chests, eliminations, placement,
 * time alive), the live match, online stats (only if the player added a stats key) and today's item shop. Read only.
 */

const INSTRUCTIONS = `Fortnite (tools start with fortnite_): the player's matches as ShotCaller recorded them (from Fortnite's log and screen reading), the live match, season stats if the player added a stats key, and today's item shop.`;

const day = (ms: number | null | undefined) =>
  ms ? new Date(ms).toISOString().replace('T', ' ').slice(0, 16) : null;
const mins = (ms: number | null | undefined) => (ms ? Math.round(ms / 6000) / 10 : null);

export const fortniteTools: ToolSet = {
  id: 'fortnite',
  instructions: INSTRUCTIONS,
  available: () => getFortniteState().logFound || getFortniteMatches().length > 0,
  register(mcp) {
    const read = { readOnlyHint: true };

    mcp.registerTool(
      'fortnite_matches',
      {
        description:
          "The player's recent Fortnite matches, newest first: mode, team size, placement, eliminations, chests, minutes alive, and the totals and averages over them.",
        inputSchema: { limit: z.number().int().min(1).max(200).optional().describe('Default 20.') },
        annotations: read,
      },
      async ({ limit }) => {
        const all = [...getFortniteMatches()].sort((a, b) => b.startedAt - a.startedAt);
        const list = all.slice(0, limit ?? 20);
        const elims = list.filter((m) => m.eliminations !== null);
        const placed = list.filter((m) => m.placement !== null);
        return json({
          matchesRecorded: all.length,
          summary: {
            matches: list.length,
            wins: list.filter((m) => m.placement === 1).length,
            averageEliminations: elims.length
              ? Math.round((elims.reduce((s, m) => s + (m.eliminations ?? 0), 0) / elims.length) * 10) / 10
              : null,
            averagePlacement: placed.length
              ? Math.round(placed.reduce((s, m) => s + (m.placement ?? 0), 0) / placed.length)
              : null,
            chests: list.reduce((s, m) => s + m.chests, 0),
          },
          matches: list.map((m) => ({
            when: day(m.startedAt),
            playlist: m.playlist,
            kind: m.kind,
            zeroBuild: m.zeroBuild,
            team: m.teamSize,
            placement: m.placement,
            eliminations: m.eliminations,
            chests: m.chests,
            minutesAlive: mins(m.timeAliveMs),
            rank: m.rank ?? null,
          })),
        });
      },
    );

    mcp.registerTool(
      'fortnite_live',
      {
        description: 'The match being played right now, if any: mode, chests, eliminations so far.',
        annotations: read,
      },
      async () => {
        const s = getFortniteState();
        return json({ fortniteRunning: s.running, match: s.match });
      },
    );

    mcp.registerTool(
      'fortnite_stats',
      {
        description:
          "Season and lifetime stats from the online stats service. Only works if the player added a stats key in ShotCaller's Fortnite options.",
        annotations: read,
      },
      async () => {
        const s = getStats();
        if (!s.hasKey)
          return json({
            available: false,
            why: "The player hasn't added a stats key (Fortnite → Options in ShotCaller).",
          });
        return json({ available: !!s.stats, status: s.status, error: s.error, stats: s.stats });
      },
    );

    mcp.registerTool(
      'fortnite_shop',
      { description: "Today's item shop: names, types, rarity and V-Bucks prices.", annotations: read },
      async () => {
        const shop = getShop();
        return json({
          date: shop.date,
          items: shop.items.map((i) => ({ name: i.name, type: i.type, rarity: i.rarity, price: i.price })),
          onWishlist: shop.wished.map((i) => i.name),
        });
      },
    );
  },
};
