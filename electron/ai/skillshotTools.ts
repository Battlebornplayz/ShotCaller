import { z } from 'zod';
import {
  CLASS_NOTES,
  DRAFT_STEPS,
  FIRST_MATCHES,
  GLOSSARY,
  GUNS,
  GUNS_TO_AVOID,
  IF_YOU_DIE,
  LEARN_VERSION,
  ROUNDS,
  THE_LOOP,
} from '../../games/skillshot-city/learnData';
import type { ScreenRead, SkillshotLiveState, SkillshotSkill } from '../../shared/skillshot';
import { RARITY_NAMES } from '../../shared/skillshotCollection';
import { computeStats, skillHistory } from '../../shared/skillshotStats';
import { getScreenStatus } from '../skillshot/screenReader';
import {
  getMatches,
  getSkillCollection,
  getSkillshotData,
  getSkillshotState,
  onSkillshotChange,
  setCoachNote,
  setGoal,
  setOffer,
} from '../skillshot/tracker';
import { fail, json, MAX_WAIT_SECONDS, type ToolSet } from './tools';

/** Skillshot City tools (Phase 6, parked): live match, skills, history, and coaching on the overlay. */

const INSTRUCTIONS = `Skillshot City: ShotCaller reads its live match data, so you can coach the player (tools start with skillshot_).

The player is new to the game and wants to learn. Use plain words, explain why, and don't assume game knowledge. Bring evidence rather than asking them to judge balance.

Facts to respect:
- Skill offers don't pause the game: the player is fighting while reading your advice, so decide fast and keep it short.
- ShotCaller's own advisor always runs. Its score and reasons are in the offer data; use them as a starting point and say when you disagree and why.
- Offers and picks come from reading the screen, so they're live. Level, kills, deaths and round come from the game's log, which can run about 2.5 minutes behind.
- Tiers and ranked numbers come from skillshotcity.gg's public tables. Credit it when you quote them. They're provisional: its win rate is undefined and low ranks have no data.
- Balance changes almost weekly. Treat exact numbers as tied to the game version given.
- A build plan is a preference, not a guarantee, since most offers are random.`;

const COACH_PROMPT = `Coach me through my Skillshot City match using ShotCaller.

Repeat this until I tell you to stop:
1. Call skillshot_wait_for_next_offer, passing the offerAt from the last result as "since" (leave it out the first time). If no offer came, call it again straight away, without writing anything to me.
2. When an offer comes, decide fast. Start from ShotCaller's advisor, and weigh my build, goal and synergies.
3. Call skillshot_show_advice with skill_id, for_offer_at, and one or two short plain sentences saying which to take and why. I read this mid-fight on my overlay.

Keep chat text to a minimum during the match. If skillshot_show_advice isn't available, tell me to turn on "Let the AI change things" in ShotCaller's settings, and give your advice in chat instead.`;

const nameOf = (id: string) => getSkillshotData()?.skills.find((s) => s.id === id)?.name ?? id;

/** Every rarity known so far: this match's build first, else the highest seen in your collection. */
function knownRarities(state: SkillshotLiveState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const o of getSkillCollection().owned) if (o.skillId && o.rarities.length) out[o.skillId] = o.rarity;
  return Object.assign(out, state.pool);
}

const rarityName = (r: number | undefined) =>
  r === undefined ? 'not known yet' : (RARITY_NAMES[r] ?? 'not known yet');

function skillCard(s: SkillshotSkill, rarity?: number) {
  return {
    id: s.id,
    name: s.name,
    yourRarity: rarityName(rarity),
    tier: s.tier ?? null,
    tree: s.tree ?? null,
    role: s.role ?? null,
    tags: s.tags ?? [],
    whatItDoes: s.short || s.description,
    howToUse: s.how ?? null,
    note: s.note ?? null,
    /** [usage %, win %, average trophies] from skillshotcity.gg's public ranked tables. */
    rankedStats: s.stats ?? null,
  };
}

function synergyText(index: number) {
  const data = getSkillshotData();
  const syn = data?.synergies.find((x) => x.index === index);
  if (!syn) return null;
  const part = (p: string) =>
    p.startsWith('class:')
      ? (data?.classes.find((c) => `class:${c.id}` === p)?.name ?? p.slice(6))
      : nameOf(p);
  return { between: syn.parts.map(part), tip: syn.tip };
}

function liveView(state: SkillshotLiveState) {
  const data = getSkillshotData();
  const rarity = knownRarities(state);
  const adv = state.advice;
  const skill = (id: string) => data?.skills.find((s) => s.id === id);
  return {
    gameVersion: data?.gameVersion ?? null,
    inMatch: state.inMatch,
    round: state.round,
    finalRound: state.final,
    class: state.classId,
    fromTheLog: {
      note: 'These can run about 2.5 minutes behind.',
      secondsBehind: state.logTime ? Math.round((Date.now() - state.logTime) / 1000) : null,
      level: state.level,
      kills: state.kills,
      deaths: state.deaths,
      syringes: state.syringes,
      wanted: state.wanted,
      roundResults: state.roundResults,
    },
    build: Object.entries(state.build).map(([id, level]) => ({
      id,
      name: nameOf(id),
      level,
      rarity: rarityName(rarity[id]),
    })),
    recentPicks: state.recentPicks.map((p) => ({
      ...p,
      name: nameOf(p.skillId),
      confirmedByLog: p.confirmed,
    })),
    goal: {
      skills: state.goal.ids.map((id) => ({ id, name: nameOf(id), have: !!state.build[id] })),
      locked: state.goal.locked,
      progress: state.goalProgress,
    },
    activeSynergies: state.activeSynergies.map(synergyText),
    offer: state.offer && {
      offerAt: state.offer.at,
      source: state.offer.source,
      skills: state.offer.ids.flatMap((id) => {
        const s = skill(id);
        return s ? [skillCard(s, rarity[id])] : [];
      }),
      shotCallerAdvisor: adv && {
        recommends: adv.offers[adv.best]?.skillId ?? null,
        suggestReroll: adv.reroll,
        summary: adv.summary,
        options: adv.offers.map((o) => ({
          id: o.skillId,
          score: o.score,
          reasons: o.reasons,
          levelAfter: o.nextLevel,
          synergies: o.synergies.map(synergyText),
        })),
      },
    },
    yourAdviceOnOverlay: state.coach,
  };
}

function waitForOffer(since: number, ms: number, signal: AbortSignal): Promise<SkillshotLiveState | null> {
  const fresh = (s: SkillshotLiveState) => !!s.offer && s.offer.at > since;
  const now = getSkillshotState();
  if (fresh(now)) return Promise.resolve(now);
  return new Promise((resolve) => {
    const finish = (result: SkillshotLiveState | null) => {
      clearTimeout(timer);
      stop();
      signal.removeEventListener('abort', onAbort);
      resolve(result);
    };
    const onAbort = () => finish(null);
    const timer = setTimeout(() => finish(null), ms);
    const stop = onSkillshotChange((s) => {
      if (fresh(s)) finish(s);
    });
    signal.addEventListener('abort', onAbort);
  });
}

function screenSummary() {
  const s = getScreenStatus();
  const count = (...v: ScreenRead['verdict'][]) => s.reads.filter((r) => v.includes(r.verdict)).length;
  return {
    mode: s.mode,
    meaning: {
      off: 'Turned off in ShotCaller settings.',
      'no-game': 'The game is not running.',
      'not-front': 'The game is running but is not the front window, so nothing is read.',
      'no-picture': 'The game picture cannot be copied. It needs to be borderless or windowed.',
      watching: 'Working, waiting for the next skill offer.',
      offer: 'An offer is on screen now.',
    }[s.mode],
    picturesChecked: s.frames,
    checkedAgainstLog: {
      right: count('right'),
      wrong: count('pick-wrong', 'offer-wrong'),
      missed: count('missed'),
      waiting: count('waiting'),
    },
  };
}

export const skillshotTools: ToolSet = {
  id: 'skillshot',
  instructions: INSTRUCTIONS,
  available: () => !!getSkillshotData(),
  register(mcp, ctx) {
    const read = { readOnlyHint: true };

    mcp.registerTool(
      'skillshot_get_live_match',
      {
        description:
          "The current match: round, build, goal, synergies, the skill offer on screen if any, and ShotCaller's own advice on it.",
        annotations: read,
      },
      async () => json(liveView(getSkillshotState())),
    );

    mcp.registerTool(
      'skillshot_wait_for_next_offer',
      {
        description: `Waits until a new skill offer is on screen, then returns the match with that offer. Use this to coach live. Comes back after timeout_seconds (at most ${MAX_WAIT_SECONDS}) with offerFound false if nothing came, so call it again. Pass the offerAt you last saw as "since", so the same offer isn't returned twice.`,
        inputSchema: {
          since: z.number().optional().describe('The offerAt of the last offer you handled.'),
          timeout_seconds: z
            .number()
            .min(1)
            .max(MAX_WAIT_SECONDS)
            .optional()
            .describe('How long to wait. Default 50.'),
        },
        annotations: read,
      },
      async ({ since, timeout_seconds }, extra) => {
        const state = await waitForOffer(since ?? 0, (timeout_seconds ?? 50) * 1000, extra.signal);
        if (!state?.offer) return json({ offerFound: false, screenReader: screenSummary() });
        return json({ offerFound: true, offerAt: state.offer.at, match: liveView(state) });
      },
    );

    mcp.registerTool(
      'skillshot_lookup_skill',
      {
        description:
          "Finds skills by name. Gives what each does, how to use it, tier, its official synergies, and the player's own history with it.",
        inputSchema: { query: z.string().min(1).describe('All or part of a skill name.') },
        annotations: read,
      },
      async ({ query }) => {
        const data = getSkillshotData();
        if (!data) return fail('Skill data is not available. Is Skillshot City installed?');
        const q = query.toLowerCase();
        const hits = data.skills
          .filter(
            (s) =>
              s.name.toLowerCase().includes(q) ||
              s.nameEn.toLowerCase().includes(q) ||
              s.id.toLowerCase().includes(q),
          )
          .slice(0, 5);
        if (!hits.length)
          return fail(`No skill matches "${query}". Use skillshot_list_skills to see them all.`);
        const rarity = knownRarities(getSkillshotState());
        const matches = getMatches();
        return json(
          hits.map((s) => ({
            ...skillCard(s, rarity[s.id]),
            description: s.description,
            mutation: s.mutation,
            synergies: data.synergies.filter((x) => x.parts.includes(s.id)).map((x) => synergyText(x.index)),
            yourHistory: skillHistory(matches, s.id),
          })),
        );
      },
    );

    mcp.registerTool(
      'skillshot_list_skills',
      {
        description:
          'Every skill in the game with its tier and tree, and whether the player owns it. Use skillshot_lookup_skill for details.',
        annotations: read,
      },
      async () => {
        const data = getSkillshotData();
        if (!data) return fail('Skill data is not available. Is Skillshot City installed?');
        const owned = new Set(getSkillCollection().owned.map((o) => o.skillId));
        return json(
          data.skills.map((s) => ({
            id: s.id,
            name: s.name,
            tier: s.tier ?? null,
            tree: s.tree ?? null,
            owned: owned.has(s.id),
          })),
        );
      },
    );

    mcp.registerTool(
      'skillshot_get_skill_collection',
      {
        description:
          'The skills the player owns with the rarity known for each, and the build equipped on each class.',
        annotations: read,
      },
      async () => {
        const c = getSkillCollection();
        return json({
          ownedCount: c.ownedCount,
          detectedClass: c.detectedClass,
          owned: c.owned.map((o) => ({
            id: o.skillId,
            name: o.skillId ? nameOf(o.skillId) : `#${o.num}`,
            rarity: o.rarities.length ? rarityName(o.rarity) : 'not known yet',
            classes: o.classes,
          })),
          classBuilds: c.classBuilds,
        });
      },
    );

    mcp.registerTool(
      'skillshot_get_match_history',
      {
        description:
          "The player's saved matches, newest first: placement, kills, deaths, final build, and every offer and pick.",
        inputSchema: {
          limit: z.number().int().min(1).max(50).optional().describe('How many matches. Default 10.'),
        },
        annotations: read,
      },
      async ({ limit }) =>
        json([...getMatches()].sort((a, b) => b.startedAt - a.startedAt).slice(0, limit ?? 10)),
    );

    mcp.registerTool(
      'skillshot_get_player_stats',
      {
        description:
          "The player's results overall and by skill, synergy, build and class, with the trend over time.",
        annotations: read,
      },
      async () => {
        const data = getSkillshotData();
        if (!data) return fail('Skill data is not available. Is Skillshot City installed?');
        return json(computeStats(data, getMatches()));
      },
    );

    mcp.registerTool(
      'skillshot_get_game_guide',
      {
        description:
          "ShotCaller's beginner guide: how a match works, what to do each round, the skill offer order, class and gun notes, and a glossary of terms.",
        annotations: read,
      },
      async () =>
        json({
          checkedAgainst: LEARN_VERSION,
          theLoop: THE_LOOP,
          firstMatches: FIRST_MATCHES,
          rounds: ROUNDS,
          ifYouDie: IF_YOU_DIE,
          draftSteps: DRAFT_STEPS,
          classNotes: CLASS_NOTES,
          guns: GUNS,
          gunsToAvoid: GUNS_TO_AVOID,
          glossary: GLOSSARY,
        }),
    );

    mcp.registerTool(
      'skillshot_get_screen_reader_status',
      {
        description:
          "Whether ShotCaller can read offers off the screen right now, and how its reads compare with the game's log. Check this if offers aren't arriving.",
        annotations: read,
      },
      async () => json(screenSummary()),
    );

    if (ctx.allowActions) {
      mcp.registerTool(
        'skillshot_show_advice',
        {
          description:
            "Shows your advice on the player's in-game overlay. It stays until the next offer or for 90 seconds. Keep it to one or two short sentences: they read it mid-fight.",
          inputSchema: {
            message: z.string().min(1).max(280),
            skill_id: z
              .string()
              .optional()
              .describe('The skill you recommend, from the offer. Shows its icon.'),
            for_offer_at: z
              .number()
              .optional()
              .describe(
                'The offerAt you are answering. If that offer has been replaced, the advice is not shown.',
              ),
          },
        },
        async ({ message, skill_id, for_offer_at }) => {
          if (skill_id && !getSkillshotData()?.skills.some((s) => s.id === skill_id))
            return fail(`"${skill_id}" is not a skill id.`);
          const current = getSkillshotState().offer;
          if (for_offer_at !== undefined && current && current.at !== for_offer_at) {
            return json({
              shown: false,
              reason: 'A newer offer is on screen now. Call skillshot_wait_for_next_offer for it.',
            });
          }
          setCoachNote(message, skill_id ?? null);
          return json({ shown: true, offerStillOpen: !!current });
        },
      );

      mcp.registerTool(
        'skillshot_set_goal_build',
        {
          description:
            "Sets the build ShotCaller's advisor steers toward. Locked means it won't adjust the goal as the player picks. Skills must be owned: check skillshot_get_skill_collection first. A plan is a preference, since most offers are random.",
          inputSchema: {
            skill_ids: z.array(z.string()).min(1).max(5),
            locked: z.boolean().optional().describe('Default true.'),
          },
        },
        async ({ skill_ids, locked }) => {
          const unknown = skill_ids.filter((id) => !getSkillshotData()?.skills.some((s) => s.id === id));
          if (unknown.length) return fail(`Not skill ids: ${unknown.join(', ')}`);
          setGoal(skill_ids, locked ?? true);
          return json({ goal: skill_ids.map(nameOf), locked: locked ?? true });
        },
      );

      mcp.registerTool(
        'skillshot_set_skill_offers',
        {
          description:
            'Tells ShotCaller which 2 skills are offered, for when the player tells you and screen reading missed them. The advisor runs on them straight away.',
          inputSchema: { skill_ids: z.array(z.string()).length(2) },
        },
        async ({ skill_ids }) => {
          const unknown = skill_ids.filter((id) => !getSkillshotData()?.skills.some((s) => s.id === id));
          if (unknown.length) return fail(`Not skill ids: ${unknown.join(', ')}`);
          setOffer(skill_ids, 'manual');
          return json(liveView(getSkillshotState()));
        },
      );
    }

    mcp.registerPrompt(
      'skillshot_coach',
      {
        title: 'Coach my match',
        description:
          'Claude watches for skill offers and puts its advice on your overlay until you say stop.',
      },
      () => ({ messages: [{ role: 'user', content: { type: 'text', text: COACH_PROMPT } }] }),
    );
  },
};
