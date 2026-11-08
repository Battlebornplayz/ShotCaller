/**
 * Pure parser + match reducer for Skillshot City's `data/log.txt`.
 * Every line looks like `[<unix seconds>]<match seconds>(<frame>): <message>`.
 * The game writes the log in batches (up to ~2.5 min late), so every event carries its own time.
 */

export interface DraftOffer {
  /** English skill name as the log writes it, upper-case ("BOUNCING BULLETS"). */
  name: string;
  level: number;
}

export type LogEvent =
  | { t: 'joined' }
  | { t: 'self'; name: string }
  | { t: 'levelUp'; player: string; level: number }
  | { t: 'draftStart'; level: number; rerolls: number }
  | { t: 'buildStart' }
  /** "Draft Impressions: n Ideal: n Enabled: n": Enabled = skills unlocked on your account. */
  | { t: 'draftInfo'; enabled: number }
  /** One equipped build slot; num -1 / name null = empty slot. */
  | { t: 'poolSlot'; num: number; name: string | null; rarity: number }
  | { t: 'draft'; n: number; offers: DraftOffer[]; selected: DraftOffer | null }
  | { t: 'round'; round: number; final: boolean; showdown: boolean }
  | { t: 'roundResult'; player: string; win: boolean }
  | { t: 'kill'; killer: string; victim: string; weapon: string }
  | { t: 'syringes'; player: string; total: number }
  | { t: 'wanted'; player: string; level: number }
  | { t: 'winner'; player: string }
  | { t: 'standing'; standing: Standing }
  | { t: 'closed' };

export interface Standing {
  position: number;
  name: string;
  bot: boolean;
  score: number;
  trophies: number;
  kills: number;
  deaths: number;
  classId: number | null;
  level: number;
  /** Numeric skill ids with level; numeric ids map to names via pool slot lines. */
  skills: { num: number; level: number; mutated: boolean }[];
  roundWins: boolean[];
}

export interface TimedEvent {
  /** Unix ms of the event (from the line's own stamp). */
  at: number;
  /** Seconds since the game process started. */
  gameSec: number;
  ev: LogEvent;
}

const LINE = /^\[(\d+)\]([\d.]+)\(\d+\):\s?(.*)$/;

const num = (s: string | undefined): number => (s === undefined ? 0 : Number(s));

function parseOffer(s: string): DraftOffer | null {
  const m = /^\s*(.*?)\((-?\d+)\)\s*$/.exec(s);
  if (!m || !m[1] || m[2] === '-1') return null;
  return { name: m[1].trim(), level: Number(m[2]) };
}

function parseStanding(msg: string): Standing | null {
  const m = /^Position #(\d+): (.+?) score=(-?\d+) trophies=(-?\d+).*? kills=(\d+) deaths=(\d+) classID=(-?\d+)\??\s+playerLevel=(\d+)(.*)$/.exec(msg);
  if (!m) return null;
  const rest = m[9];
  const skills: Standing['skills'] = [];
  const sk = /skills=([^ ]*)/.exec(rest)?.[1] ?? '';
  for (const part of sk.split(';')) {
    const p = /^(\d+)\((\d+)-(BASE|MUTATED)\)$/.exec(part);
    if (p) skills.push({ num: Number(p[1]), level: Number(p[2]), mutated: p[3] === 'MUTATED' });
  }
  const roundWins = [1, 2, 3].map((r) => new RegExp(`r${r}Win=1`).test(rest));
  const rawName = m[2];
  return {
    position: Number(m[1]),
    name: rawName.replace(/\*$/, ''),
    // The game marks other humans with "*"; bots and the local player have none. Bots are told apart later.
    bot: false,
    score: num(m[3]),
    trophies: num(m[4]),
    kills: num(m[5]),
    deaths: num(m[6]),
    classId: m[7] === '-1' ? null : Number(m[7]),
    level: num(m[8]),
    skills,
    roundWins,
  };
}

export function parseLine(line: string): TimedEvent | null {
  const m = LINE.exec(line.trimEnd());
  if (!m) return null;
  const at = Number(m[1]) * 1000;
  const gameSec = Number(m[2]);
  const msg = m[3];
  const ev = parseMessage(msg);
  return ev ? { at, gameSec, ev } : null;
}

export function parseMessage(msg: string): LogEvent | null {
  let m: RegExpExecArray | null;
  if (msg.startsWith('Game Joined!')) return { t: 'joined' };
  if ((m = /^Joining (.+) with ranked status:/.exec(msg))) return { t: 'self', name: m[1] };
  if ((m = /^Player leveled up: (.+) \(\d+\) is now level (\d+)/.exec(msg))) return { t: 'levelUp', player: m[1], level: Number(m[2]) };
  if ((m = /^Generating New Draft With Game Seed:.*?reroll counter: (\d+).*?player level: (\d+)/.exec(msg)))
    return { t: 'draftStart', rerolls: Number(m[1]), level: Number(m[2]) };
  if (msg.startsWith('Skill Build Below')) return { t: 'buildStart' };
  if ((m = /^Draft Impressions: \d+ Ideal: \d+ Enabled: (\d+)/.exec(msg))) return { t: 'draftInfo', enabled: Number(m[1]) };
  if ((m = /^Build Slot \(Rarity=(\d+)\): ID=(-?\d+)(?: Name=(.+))?$/.exec(msg)))
    return { t: 'poolSlot', rarity: Number(m[1]), num: Number(m[2]), name: m[3]?.trim() || null };
  if ((m = /^SKILL DRAFT (\d+) \(current draft point = \d+\): (.*?), SELECTED: (.*)$/.exec(msg))) {
    const offers = m[2].split(/,\s*/).map(parseOffer).filter((o): o is DraftOffer => !!o);
    return { t: 'draft', n: Number(m[1]), offers, selected: parseOffer(m[3]) };
  }
  if ((m = /on br round: (\d+) is brfinal: (\d) isShowdown: (\d)/.exec(msg)))
    return { t: 'round', round: Number(m[1]), final: m[2] === '1', showdown: m[3] === '1' };
  if ((m = /^======= > \(FROM ROUND (WIN|END)[^)]*\) RubberAcct=(.+?) \(/.exec(msg)))
    return { t: 'roundResult', player: m[2], win: m[1] === 'WIN' };
  if ((m = /^(.+?)\*? killed (.+?)\*? with (.+?) \(wepid=/.exec(msg))) return { t: 'kill', killer: m[1], victim: m[2], weapon: m[3] };
  if ((m = /^Giving Syringe for Kills \((.*)\): new total = (\d+)/.exec(msg))) return { t: 'syringes', player: m[1], total: Number(m[2]) };
  if ((m = /^Increasing Wanted level to (\d+) for player: (.+?) with/.exec(msg))) return { t: 'wanted', level: Number(m[1]), player: m[2] };
  if ((m = /^CHATMSG \(SERVER\): (.+) gets the winner winner chicken dinner/.exec(msg))) return { t: 'winner', player: m[1] };
  if (msg.startsWith('Position #')) {
    const s = parseStanding(msg);
    return s ? { t: 'standing', standing: s } : null;
  }
  if (msg.startsWith('Window Closed.')) return { t: 'closed' };
  return null;
}

// ---------------------------------------------------------------------------------------------
// Match reducer

export interface PickRecord {
  n: number;
  at: number;
  round: number;
  offers: DraftOffer[];
  selected: DraftOffer | null;
}

export interface MatchState {
  id: string;
  startedAt: number;
  updatedAt: number;
  self: string | null;
  round: number;
  final: boolean;
  showdown: boolean;
  level: number;
  rerolls: number;
  wanted: number;
  syringes: number;
  kills: number;
  deaths: number;
  /** Upper-case skill name → level (from picks). */
  build: Record<string, number>;
  /** Skill pool from "Build Slot" lines: upper-case name → rarity (0 common … 3 legendary). */
  pool: Record<string, number>;
  /** numeric skill id → upper-case name, learned from pool lines. */
  skillNums: Record<number, string>;
  /** Your equipped skill build this match, in slot order (empty slots included). */
  slots: { num: number; name: string | null; rarity: number }[];
  picks: PickRecord[];
  roundResults: (boolean | null)[];
  killedBy: Record<string, number>;
  standings: Standing[];
  winner: string | null;
  ended: boolean;
}

export function newMatch(at: number, self: string | null): MatchState {
  return {
    id: String(at),
    startedAt: at,
    updatedAt: at,
    self,
    round: 1,
    final: false,
    showdown: false,
    level: 0,
    rerolls: 0,
    wanted: 0,
    syringes: 0,
    kills: 0,
    deaths: 0,
    build: {},
    pool: {},
    skillNums: {},
    slots: [],
    picks: [],
    roundResults: [null, null, null],
    killedBy: {},
    standings: [],
    winner: null,
    ended: false,
  };
}

const same = (a: string | null, b: string): boolean => !!a && a.toLowerCase() === b.toLowerCase();

/**
 * Applies one event. Returns the (mutated) state plus whether this event starts a new match
 * (the caller then archives the old one). `selfName` comes from the profile file or a "Joining" line.
 */
export function applyEvent(state: MatchState, e: TimedEvent): void {
  const { ev } = e;
  state.updatedAt = e.at;
  switch (ev.t) {
    case 'self':
      state.self = ev.name;
      break;
    case 'levelUp':
      if (same(state.self, ev.player)) state.level = Math.max(state.level, ev.level);
      break;
    case 'draftStart':
      state.level = Math.max(state.level, ev.level);
      state.rerolls = ev.rerolls;
      state.pool = {};
      break;
    case 'buildStart':
      state.slots = [];
      break;
    case 'poolSlot': {
      const name = ev.name?.toUpperCase() ?? null;
      state.slots.push({ num: ev.num, name, rarity: ev.rarity });
      if (!name) break;
      state.pool[name] = ev.rarity;
      state.skillNums[ev.num] = name;
      break;
    }
    case 'draft':
      state.picks.push({ n: ev.n, at: e.at, round: state.round, offers: ev.offers, selected: ev.selected });
      if (ev.selected) state.build[ev.selected.name] = ev.selected.level;
      break;
    case 'round':
      if (ev.round >= state.round) {
        state.round = Math.min(3, ev.round);
        state.final = ev.final;
        state.showdown = ev.showdown;
      }
      break;
    case 'roundResult':
      if (same(state.self, ev.player)) state.roundResults[state.round - 1] = ev.win;
      break;
    case 'kill':
      if (same(state.self, ev.killer)) state.kills++;
      else if (same(state.self, ev.victim)) {
        state.deaths++;
        state.killedBy[ev.weapon] = (state.killedBy[ev.weapon] ?? 0) + 1;
      }
      break;
    case 'syringes':
      if (same(state.self, ev.player) || ev.player === '') state.syringes = ev.total;
      break;
    case 'wanted':
      if (same(state.self, ev.player)) state.wanted = ev.level;
      break;
    case 'winner':
      state.winner = ev.player;
      break;
    case 'standing':
      if (!state.standings.some((s) => s.position === ev.standing.position)) state.standings.push(ev.standing);
      state.ended = true;
      break;
    default:
      break;
  }
}

/** True when an event means a new match has begun (so the current one should be archived). */
export function startsNewMatch(state: MatchState | null, e: TimedEvent): boolean {
  const { ev } = e;
  if (!state) return ev.t === 'joined' || ev.t === 'draft' || ev.t === 'draftStart';
  const used = state.picks.length > 0 || state.standings.length > 0;
  if (ev.t === 'joined') return used;
  // Draft numbering restarts at 1 every match.
  if (ev.t === 'draft' && ev.n <= 1 && state.picks.length > 0) return true;
  if (ev.t === 'draftStart' && state.ended) return true;
  // The round counter only goes backwards when a new match starts.
  if (ev.t === 'round' && ev.round < state.round && used) return true;
  return false;
}

/** Your standing in a finished match, if present. */
export function selfStanding(state: MatchState): Standing | null {
  return state.standings.find((s) => same(state.self, s.name)) ?? null;
}
