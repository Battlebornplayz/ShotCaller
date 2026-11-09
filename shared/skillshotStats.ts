import type { MatchRecord, SkillshotData } from './skillshot';
import { activeSynergies, advise, type SkillStat } from './skillshotAdvisor';

/**
 * Match review and stats for Skillshot City, computed from saved MatchRecords. Pure, so the app,
 * the overlay recap and (later) the Ask engine and MCP all share it.
 */

// ---------------------------------------------------------------------------------------------
// Pick review

export interface PickReview {
  round: number;
  offers: string[];
  picked: string | null;
  /** What the advisor recommends for that offer, given the build at that moment. */
  advised: string | null;
  followed: boolean;
  /** Advisor score of the pick minus the best offer's score (0 = best pick, negative = worse). */
  delta: number;
  reason: string | null;
}

export interface MatchReview {
  picks: PickReview[];
  followed: number;
  /** Picks that had a real choice (2+ offers). */
  choices: number;
  best: PickReview | null;
  worst: PickReview | null;
  synergies: number[];
}

/**
 * Replays a match's drafts through the advisor. Win-rate stats are left out on purpose so a review
 * doesn't change as your history grows.
 */
export function reviewMatch(data: SkillshotData, m: MatchRecord): MatchReview {
  const build: Record<string, number> = {};
  const picks: PickReview[] = [];
  for (const p of m.picks) {
    const adv = p.offers.length
      ? advise({ data, offers: p.offers, build: { ...build }, classId: m.classId, goal: [], pool: [], round: p.round, stats: {}, overallWinRate: null })
      : null;
    const best = adv?.offers[adv.best] ?? null;
    const mine = adv?.offers.find((o) => o.skillId === p.picked) ?? null;
    picks.push({
      round: p.round,
      offers: p.offers,
      picked: p.picked,
      advised: best?.skillId ?? null,
      followed: !!best && best.skillId === p.picked,
      delta: best && mine ? mine.score - best.score : 0,
      reason: best?.reasons[0] ?? null,
    });
    if (p.picked) build[p.picked] = (build[p.picked] ?? 0) + 1;
  }
  const choices = picks.filter((p) => p.offers.length >= 2 && p.picked);
  const sorted = [...choices].sort((a, b) => a.delta - b.delta);
  const worst = sorted[0] && sorted[0].delta < 0 ? sorted[0] : null;
  // Best pick: the highest-scoring followed pick with a real choice (biggest margin over the alternative).
  let best: PickReview | null = null;
  let margin = -1;
  for (const p of choices) {
    if (!p.followed) continue;
    const adv = advise({ data, offers: p.offers, build: {}, classId: m.classId, goal: [], pool: [], round: p.round, stats: {}, overallWinRate: null });
    if (!adv || adv.offers.length < 2) continue;
    const scores = adv.offers.map((o) => o.score).sort((a, b) => b - a);
    if (scores[0] - scores[1] > margin) {
      margin = scores[0] - scores[1];
      best = p;
    }
  }
  return {
    picks,
    followed: choices.filter((p) => p.followed).length,
    choices: choices.length,
    best,
    worst,
    synergies: activeSynergies(data, m.build, m.classId),
  };
}

// ---------------------------------------------------------------------------------------------
// Aggregate stats

export interface Bucket {
  key: string;
  played: number;
  wins: number;
  top3: number;
  /** Matches with a known placement (average place uses these). */
  placed: number;
  placeSum: number;
  kills: number;
  deaths: number;
}

export interface Summary {
  matches: number;
  placed: number;
  winRate: number | null;
  top3Rate: number | null;
  avgPlace: number | null;
  kd: number | null;
}

export interface Trend {
  /** Average place over the last `window` placed matches vs the ones before (negative = improving). */
  recent: number | null;
  previous: number | null;
  /** Per placed match, oldest first, for a sparkline. */
  places: number[];
}

export interface SkillshotStats {
  summary: Summary;
  trend: Trend;
  bySkill: Bucket[];
  bySynergy: Bucket[];
  byClass: Bucket[];
  /** Build = your 3 highest-level skills, sorted ("A+B+C"). */
  byBuild: Bucket[];
  adviceFollowRate: number | null;
}

function bucket(map: Map<string, Bucket>, key: string, m: MatchRecord): void {
  const b = map.get(key) ?? { key, played: 0, wins: 0, top3: 0, placed: 0, placeSum: 0, kills: 0, deaths: 0 };
  b.played++;
  if (m.won) b.wins++;
  if (m.place !== null) {
    b.placed++;
    b.placeSum += m.place;
    if (m.place <= 3) b.top3++;
  }
  b.kills += m.kills;
  b.deaths += m.deaths;
  map.set(key, b);
}

export const avgPlace = (b: Bucket): number | null => (b.placed ? b.placeSum / b.placed : null);
export const winRate = (b: Bucket): number | null => (b.placed ? b.wins / b.placed : null);

export function buildKey(build: Record<string, number>): string | null {
  const top = Object.entries(build)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([id]) => id)
    .sort();
  return top.length >= 2 ? top.join('+') : null;
}

/** Matches that count for stats: played long enough to pick skills or to get a placement. */
export const countable = (m: MatchRecord): boolean => m.place !== null || m.picks.length >= 2;

export function computeStats(data: SkillshotData, matches: MatchRecord[], trendWindow = 10): SkillshotStats {
  const list = matches.filter(countable).sort((a, b) => a.startedAt - b.startedAt);
  const all = new Map<string, Bucket>();
  const skills = new Map<string, Bucket>();
  const syns = new Map<string, Bucket>();
  const classes = new Map<string, Bucket>();
  const builds = new Map<string, Bucket>();
  let followed = 0;
  let choices = 0;
  for (const m of list) {
    bucket(all, 'all', m);
    for (const id of Object.keys(m.build)) bucket(skills, id, m);
    for (const i of activeSynergies(data, m.build, m.classId)) bucket(syns, String(i), m);
    if (m.classId) bucket(classes, m.classId, m);
    const bk = buildKey(m.build);
    if (bk) bucket(builds, bk, m);
    const r = reviewMatch(data, m);
    followed += r.followed;
    choices += r.choices;
  }
  const a = all.get('all');
  const places = list.filter((m) => m.place !== null).map((m) => m.place as number);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const byPlayed = (x: Bucket, y: Bucket) => y.played - x.played || (avgPlace(x) ?? 99) - (avgPlace(y) ?? 99);
  return {
    summary: {
      matches: list.length,
      placed: a?.placed ?? 0,
      winRate: a ? winRate(a) : null,
      top3Rate: a?.placed ? a.top3 / a.placed : null,
      avgPlace: a ? avgPlace(a) : null,
      kd: a ? a.kills / Math.max(1, a.deaths) : null,
    },
    trend: {
      recent: mean(places.slice(-trendWindow)),
      previous: places.length > trendWindow ? mean(places.slice(-2 * trendWindow, -trendWindow)) : null,
      places,
    },
    bySkill: [...skills.values()].sort(byPlayed),
    bySynergy: [...syns.values()].sort(byPlayed),
    byClass: [...classes.values()].sort(byPlayed),
    byBuild: [...builds.values()].sort(byPlayed),
    adviceFollowRate: choices ? followed / choices : null,
  };
}

/** Per-skill win stats for the advisor (finished matches only). */
export function skillWinStats(matches: MatchRecord[]): Record<string, SkillStat> {
  const out: Record<string, SkillStat> = {};
  for (const m of matches) {
    if (m.place === null && !m.complete) continue;
    for (const id of Object.keys(m.build)) {
      const s = (out[id] ??= { played: 0, wins: 0 });
      s.played++;
      if (m.won) s.wins++;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Per-skill stats for the lookup page

export interface SkillHistory {
  /** Matches you finished with this skill in your build. */
  bucket: Bucket | null;
  /** Times it was offered, and times you took it. */
  offered: number;
  picked: number;
  /** Skills that shared your builds with it, best average place first (2+ matches together). */
  partners: { id: string; played: number; avgPlace: number }[];
}

export function skillHistory(matches: MatchRecord[], id: string): SkillHistory {
  let offered = 0;
  let picked = 0;
  const together = new Map<string, { played: number; placeSum: number }>();
  const holder = new Map<string, Bucket>();
  for (const m of matches.filter(countable)) {
    for (const p of m.picks) {
      if (!p.offers.includes(id)) continue;
      offered++;
      if (p.picked === id) picked++;
    }
    if (!m.build[id]) continue;
    bucket(holder, id, m);
    if (m.place === null) continue;
    for (const other of Object.keys(m.build)) {
      if (other === id) continue;
      const t = together.get(other) ?? { played: 0, placeSum: 0 };
      t.played++;
      t.placeSum += m.place;
      together.set(other, t);
    }
  }
  const partners = [...together.entries()]
    .filter(([, t]) => t.played >= 2)
    .map(([other, t]) => ({ id: other, played: t.played, avgPlace: t.placeSum / t.played }))
    .sort((a, b) => a.avgPlace - b.avgPlace)
    .slice(0, 3);
  return { bucket: holder.get(id) ?? null, offered, picked, partners };
}

// ---------------------------------------------------------------------------------------------
// Session goals

export interface SessionGoal {
  id: string;
  text: string;
  done: boolean;
  progress: string;
}

/** A few goals for today, suggested from your stats; each is ticked off by today's matches. */
export function suggestSessionGoals(matches: MatchRecord[], today: Date = new Date()): SessionGoal[] {
  const day = today.toDateString();
  const todays = matches.filter((m) => new Date(m.startedAt).toDateString() === day && countable(m));
  const before = matches.filter((m) => new Date(m.startedAt).toDateString() !== day && m.place !== null);
  const placedToday = todays.filter((m) => m.place !== null);
  const avgBefore = before.length ? before.reduce((s, m) => s + (m.place ?? 0), 0) / before.length : null;
  const kdBefore = before.length ? before.reduce((s, m) => s + m.kills, 0) / Math.max(1, before.reduce((s, m) => s + m.deaths, 0)) : null;
  const goals: SessionGoal[] = [];
  const wins = todays.filter((m) => m.won).length;
  goals.push({ id: 'win', text: 'Win a match', done: wins > 0, progress: `${wins}/1` });
  const top3 = placedToday.filter((m) => (m.place ?? 99) <= 3).length;
  goals.push({ id: 'top3', text: 'Finish top 3 twice', done: top3 >= 2, progress: `${Math.min(top3, 2)}/2` });
  if (avgBefore !== null) {
    const target = Math.max(1, Math.floor(avgBefore * 10) / 10 - 0.5);
    const avgToday = placedToday.length ? placedToday.reduce((s, m) => s + (m.place ?? 0), 0) / placedToday.length : null;
    goals.push({
      id: 'avg',
      text: `Average place ${target.toFixed(1)} or better (yours: ${avgBefore.toFixed(1)})`,
      done: avgToday !== null && placedToday.length >= 2 && avgToday <= target,
      progress: avgToday !== null ? avgToday.toFixed(1) : '—',
    });
  }
  const kills = todays.reduce((s, m) => s + m.kills, 0);
  const deaths = todays.reduce((s, m) => s + m.deaths, 0);
  const kdTarget = kdBefore !== null ? Math.max(1, Math.round(kdBefore * 10) / 10 + 0.3) : 2;
  goals.push({
    id: 'kd',
    text: `K/D of ${kdTarget.toFixed(1)} today`,
    done: todays.length > 0 && kills / Math.max(1, deaths) >= kdTarget,
    progress: todays.length ? (kills / Math.max(1, deaths)).toFixed(1) : '—',
  });
  return goals;
}
