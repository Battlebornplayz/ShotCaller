import { app } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { NO_CHEST_KINDS, type FnChestKind, type FnChestKinds, type FnLiveState, type FnMatchRecord, type FnTotals } from '../../shared/fortnite';
import { FnLogParser, modeOf, wasPlayed, type FnLogEvent, type FnLogMatch, type FnPhase } from '../../shared/fortniteLog';

/**
 * Fortnite match tracking. Fortnite's own log tells when a match starts and ends and which mode it is (nothing
 * else is taken from it), the screen reader reports chests, and finished matches are saved to
 * userData/fortnite/matches.json. The game itself is never touched.
 */

const POLL_MS = 1000;
/** On start, only this much of the end of the log is read to find out whether a match is on. */
const CATCH_UP_BYTES = 16 * 1024 * 1024;

const logDir = () => path.join(process.env.LOCALAPPDATA ?? '', 'FortniteGame', 'Saved', 'Logs');
const logFile = () => path.join(logDir(), 'FortniteGame.log');
const storeDir = () => path.join(app.getPath('userData'), 'fortnite');
const matchesFile = () => path.join(storeDir(), 'matches.json');

let matches: FnMatchRecord[] = [];
let parser = new FnLogParser();
let offset = 0;
let rest = '';
let timer: NodeJS.Timeout | null = null;
let running = false;
let current: (FnLogMatch & { chests: number; kinds: FnChestKinds; eliminations: number | null; aliveMs: number | null; leftAlive: number | null }) | null = null;
let sessionChests = 0;
let sessionRare = 0;
let sessionMatches = 0;
let lastMatch: FnMatchRecord | null = null;
const sessionStats = { matches: 0, wins: 0, eliminations: 0, deaths: 0, chests: 0 };
const listeners = new Set<(s: FnLiveState) => void>();
const savedListeners = new Set<(m: FnMatchRecord) => void>();

/** Called with each finished match right after it's saved (the live map files its route under the id). */
export function onMatchSaved(fn: (m: FnMatchRecord) => void): () => void {
  savedListeners.add(fn);
  return () => savedListeners.delete(fn);
}

/** The match in progress, for the live map: when it started and its team size. */
export function currentMatchInfo(): { startedAt: number; teamSize: string | null; busAt: number | null } | null {
  return current ? { startedAt: current.startedAt, teamSize: modeOf(current.playlist).teamSize, busAt: current.phases.bus ?? null } : null;
}

// ---------- Store ----------

function loadMatches(): void {
  try {
    const raw = JSON.parse(fs.readFileSync(matchesFile(), 'utf8')) as unknown;
    matches = Array.isArray(raw) ? (raw as FnMatchRecord[]).filter((m) => m && typeof m.id === 'string' && typeof m.startedAt === 'number') : [];
  } catch {
    matches = [];
  }
  lastMatch = matches[matches.length - 1] ?? null;
}

async function saveMatches(): Promise<void> {
  try {
    await fsp.mkdir(storeDir(), { recursive: true });
    const tmp = `${matchesFile()}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(matches), 'utf8');
    await fsp.rename(tmp, matchesFile());
  } catch (err) {
    console.error('[fortnite] could not save matches:', err);
  }
}

export function getFortniteMatches(): FnMatchRecord[] {
  return matches;
}

// ---------- Live state ----------

function sameDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

function totals(count: (m: { chests: number; chestKinds?: FnChestKinds }) => number, session: number): FnTotals {
  const now = Date.now();
  const inMatch = current ? count({ chests: current.chests, chestKinds: current.kinds }) : 0;
  let allTime = inMatch;
  let today = inMatch;
  for (const m of matches) {
    const n = count(m);
    allTime += n;
    if (sameDay(m.endedAt, now)) today += n;
  }
  return { match: inMatch, session, today, allTime };
}

function currentPhase(m: FnLogMatch): FnPhase | null {
  const order: FnPhase[] = ['endgame', 'zones', 'bus', 'warmup'];
  return order.find((p) => m.phases[p] !== undefined) ?? null;
}

export function getFortniteState(): FnLiveState {
  return {
    logFound: fs.existsSync(logDir()),
    running,
    match: current
      ? { startedAt: current.startedAt, playlist: current.playlist, mode: modeOf(current.playlist), phase: currentPhase(current), chests: current.chests, chestKinds: { ...current.kinds }, eliminations: current.eliminations }
      : null,
    chests: totals((m) => m.chests, sessionChests),
    session: { ...sessionStats, chests: sessionChests },
    rareChests: totals((m) => m.chestKinds?.rare ?? 0, sessionRare),
    sessionMatches,
    lastMatch,
  };
}

export function onFortniteChange(fn: (s: FnLiveState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function push(): void {
  const s = getFortniteState();
  for (const fn of listeners) fn(s);
}

/** Whether a match is on right now (the screen reader only counts chests then). */
export function inFortniteMatch(): boolean {
  return !!current;
}

/** A chest: from the screen reader (by kind) or the +1 hotkey ('manual'). Only counts during a match. */
export function addChest(kind: FnChestKind): boolean {
  if (!current) return false;
  current.chests++;
  current.kinds[kind]++;
  sessionChests++;
  if (kind === 'rare') sessionRare++;
  push();
  return true;
}

/** The screen reader settled a new eliminations count (only ever rises within a match). */
export function setEliminations(n: number): void {
  if (!current || current.eliminations === n) return;
  current.eliminations = n;
  push();
}

/** Players left as last read while you were alive (the screen reader skips reads while you're down). */
export function setPlayersLeftAlive(n: number): void {
  if (current) current.leftAlive = n;
}

/** Time alive so far from the screen (counted from the bus, paused while down). */
export function setTimeAlive(ms: number): void {
  if (current) current.aliveMs = ms;
}

/** Whether the bus has left: time alive counts from then. */
export function busHasLeft(): boolean {
  return current?.phases.bus !== undefined;
}

// ---------- Log ----------

function handle(events: FnLogEvent[], live: boolean): void {
  for (const e of events) {
    if (e.type === 'start') current = { ...e.match, chests: 0, kinds: { ...NO_CHEST_KINDS }, eliminations: null, aliveMs: null, leftAlive: null };
    else if (e.type === 'update' && current)
      current = { ...current, ...e.match, chests: current.chests, kinds: current.kinds, eliminations: current.eliminations, aliveMs: current.aliveMs, leftAlive: current.leftAlive };
    else if (e.type === 'end') {
      const done = current;
      current = null;
      if (!live || !done || !wasPlayed(e.match)) continue;
      const mode = modeOf(e.match.playlist);
      const record: FnMatchRecord = {
        id: randomUUID(),
        startedAt: e.match.startedAt,
        endedAt: e.match.endedAt ?? Date.now(),
        playlist: e.match.playlist,
        kind: mode.kind,
        zeroBuild: mode.zeroBuild,
        teamSize: mode.teamSize,
        chests: done.chests,
        chestKinds: done.kinds,
        eliminations: done.eliminations,
        // Solo: the players left just before you went down is your place (7 left when you die = #7; a win
        // ends on 1). Team modes rank teams, which the HUD doesn't show: left empty for now.
        placement: mode.teamSize === 'solo' ? done.leftAlive : null,
        // Read from the screen (skips time down); without screen reads, from the bus to leaving.
        timeAliveMs: done.aliveMs ?? (e.match.phases.bus !== undefined && e.match.endedAt ? e.match.endedAt - e.match.phases.bus : null),
        endReason: e.match.endReason,
      };
      matches.push(record);
      lastMatch = record;
      sessionMatches++;
      sessionStats.matches++;
      if (record.placement === 1) sessionStats.wins++;
      else sessionStats.deaths++;
      sessionStats.eliminations += record.eliminations ?? 0;
      for (const fn of savedListeners) fn(record);
      void saveMatches();
    }
  }
}

/** Reads whatever the game added to its log since last time. */
function poll(live = true): void {
  let fd: number | null = null;
  try {
    const size = fs.statSync(logFile()).size;
    if (size < offset) {
      // A new log: the game restarted. Anything still open ended with the old one.
      handle(parser.close(), live);
      parser = new FnLogParser();
      offset = 0;
      rest = '';
    }
    if (size === offset) return;
    if (!live && size - offset > CATCH_UP_BYTES) offset = size - CATCH_UP_BYTES;
    fd = fs.openSync(logFile(), 'r');
    const buf = Buffer.alloc(size - offset);
    fs.readSync(fd, buf, 0, buf.length, offset);
    offset = size;
    const lines = (rest + buf.toString('utf8')).split(/\r?\n/);
    rest = lines.pop() ?? '';
    const events: FnLogEvent[] = [];
    for (const line of lines) events.push(...parser.feed(line));
    if (events.length) {
      handle(events, live);
      push();
    }
  } catch {
    // No log yet, or it's being rotated: try again next time.
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
}

/** Detection says whether Fortnite is running: the log is only followed while it is. */
export function setFortniteRunning(on: boolean): void {
  if (on === running) return;
  running = on;
  if (on) {
    // Starting with the game already on: catch up quietly so a match in progress is picked up.
    parser = new FnLogParser();
    offset = 0;
    rest = '';
    current = null;
    poll(false);
    timer = setInterval(() => poll(true), POLL_MS);
  } else {
    if (timer) clearInterval(timer);
    timer = null;
    // The game writes its last lines on the way out.
    setTimeout(() => {
      poll(true);
      handle(parser.close(Date.now()), true);
      push();
    }, 3000);
  }
  push();
}

export function initFortnite(): void {
  loadMatches();
}

export function disposeFortnite(): void {
  if (timer) clearInterval(timer);
  timer = null;
  if (current) handle(parser.close(Date.now()), true);
}
