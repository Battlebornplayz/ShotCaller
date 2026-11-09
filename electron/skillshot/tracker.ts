import { app } from 'electron';
import { promises as fsp, existsSync, readdirSync, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import type { MatchRecord, OfferSource, SkillshotData, SkillshotLiveState, SkillshotSkill } from '../../shared/skillshot';
import { activeSynergies, advise, goalProgress, suggestGoal, type SkillStat } from '../../shared/skillshotAdvisor';
import {
  applyEvent,
  newMatch,
  parseLine,
  selfStanding,
  startsNewMatch,
  type MatchState,
  type TimedEvent,
} from '../../shared/skillshotLog';
import {
  classIdFromNum,
  emptyStore,
  parseProfileSkills,
  recordBuild,
  setDetectedClass,
  setOwnedCount,
  setScreenRarity,
  toCollection,
  type CollectionStore,
  type SkillCollection,
} from '../../shared/skillshotCollection';
import tiers from '../../games/skillshot-city/tiers.json';
import { extractSkillshotData, findInstallDir } from './gamedata';

/**
 * Skillshot City match tracker. Reads the game's log (read-only) as it grows, keeps the live match,
 * saves finished matches to userData/skillshot/matches.json, and runs the advisor on the current offer.
 * The game writes its log in batches, so manual / screen / memory offers drive the live view and the
 * log confirms them.
 */

const LOGS_OLDEST_FIRST = ['logPrevious3.txt', 'logPrevious2.txt', 'logPrevious1.txt', 'log.txt'];
/** Backup check; the file watcher normally pushes changes the moment the game writes. */
const FALLBACK_MS = 5000;

let data: SkillshotData | null = null;
let installDir: string | null = null;
let profileName: string | null = null;
let matches: MatchRecord[] = [];
let live: MatchState | null = null;
let logOffset = 0;
let partial = '';
let lastLogTime: number | null = null;
let pollTimer: NodeJS.Timeout | null = null;
let watcher: FSWatcher | null = null;
let reading = false;
let readAgain = false;
let reason: string | undefined;

let offer: SkillshotLiveState['offer'] = null;
let coach: SkillshotLiveState['coach'] = null;
let coachTimer: NodeJS.Timeout | null = null;
let rarityUp: SkillshotLiveState['rarityUp'] = null;
/** How long a note from Claude stays up if no new offer replaces it. */
const COACH_MS = 90_000;
/** Picks made in ShotCaller (Alt+1/Alt+2/grid) that the log hasn't written yet. */
let pendingPicks: { skillId: string; at: number; round: number }[] = [];
let goal: { ids: string[]; locked: boolean } = { ids: [], locked: false };
/** Class the user picked by hand; null = use the class detected from the log. */
let classId: string | null = null;
let collection: CollectionStore = emptyStore();
let collectionTimer: NodeJS.Timeout | null = null;
let profileWatcher: FSWatcher | null = null;

const listeners = new Set<(s: SkillshotLiveState) => void>();
const collectionListeners = new Set<(c: SkillCollection) => void>();
const draftListeners = new Set<(d: { offers: string[]; picked: string | null; at: number }) => void>();

/** Called for each skill draft as the log writes it. */
export function onLoggedDraft(fn: (d: { offers: string[]; picked: string | null; at: number }) => void): () => void {
  draftListeners.add(fn);
  return () => draftListeners.delete(fn);
}

/** The class advice uses: your pick, else the one read from your last finished match. */
const effectiveClass = (): string | null => classId ?? collection.detectedClass;

/** Game logs to keep (they're small, under 200 KB each). */
const LOG_BACKUPS = 100;
const storeDir = () => path.join(app.getPath('userData'), 'skillshot');
const matchesFile = () => path.join(storeDir(), 'matches.json');
const prefsFile = () => path.join(storeDir(), 'prefs.json');
const collectionFile = () => path.join(storeDir(), 'collection.json');

// ---------------------------------------------------------------------------------------------
// Data

function applyTiers(d: SkillshotData): SkillshotData {
  const t = (tiers as unknown as { skills: Record<string, Partial<SkillshotSkill>> }).skills;
  for (const s of d.skills) Object.assign(s, t[s.id] ?? {});
  return d;
}

export function getSkillshotData(): SkillshotData | null {
  return data;
}

/** Upper-case English name (as in the log) → skill id. */
function idFromLogName(name: string): string | null {
  if (!data) return null;
  const n = name.toUpperCase();
  return data.skills.find((s) => s.nameEn.toUpperCase() === n)?.id ?? null;
}

function buildIds(build: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, lvl] of Object.entries(build)) {
    const id = idFromLogName(name);
    if (id) out[id] = Math.max(out[id] ?? 0, lvl);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Matches

function toRecord(m: MatchState): MatchRecord {
  const me = selfStanding(m);
  const won = me ? me.position === 1 : !!m.self && m.winner?.toLowerCase() === m.self.toLowerCase();
  return {
    id: m.id,
    startedAt: m.startedAt,
    endedAt: m.updatedAt,
    place: me?.position ?? (won ? 1 : null),
    won,
    score: me?.score ?? null,
    kills: me?.kills ?? m.kills,
    deaths: me?.deaths ?? m.deaths,
    level: Math.max(m.level, me?.level ?? 0),
    build: buildIds(m.build),
    picks: m.picks.map((p) => ({
      round: p.round,
      offers: p.offers.map((o) => idFromLogName(o.name)).filter((x): x is string => !!x),
      picked: p.selected ? idFromLogName(p.selected.name) : null,
    })),
    roundResults: m.roundResults,
    killedBy: m.killedBy,
    classId: classIdFromNum(me?.classId) ?? effectiveClass(),
    complete: m.standings.length > 0,
  };
}

function archive(m: MatchState | null): void {
  if (!m) return;
  noteBuild(m);
  if (m.picks.length === 0 && m.standings.length === 0) return;
  const rec = toRecord(m);
  const i = matches.findIndex((x) => x.id === rec.id);
  if (i >= 0) matches[i] = rec;
  else matches.push(rec);
  matches.sort((a, b) => a.startedAt - b.startedAt);
  void saveMatches();
}

// ---------------------------------------------------------------------------------------------
// Skill collection

/** Saves a match's equipped build under its class: the class from your standing, else your last known one. */
function noteBuild(m: MatchState): void {
  const me = selfStanding(m);
  const cls = classIdFromNum(me?.classId);
  if (cls) setDetectedClass(collection, cls, m.updatedAt);
  if (!m.slots.length && !cls) return;
  recordBuild(collection, m.slots, m.startedAt, cls ?? collection.detectedClass, !!cls);
  collectionChanged();
}

function getCollectionView(): SkillCollection {
  return toCollection(collection, idFromLogName, (num) => data?.skills.find((s) => s.num === num)?.id ?? null);
}

export function getSkillCollection(): SkillCollection {
  return getCollectionView();
}

export function onCollectionChange(fn: (c: SkillCollection) => void): () => void {
  collectionListeners.add(fn);
  return () => collectionListeners.delete(fn);
}

/** Pushes the new collection and saves it (debounced: imports touch it many times). */
function collectionChanged(): void {
  if (collectionTimer) return;
  collectionTimer = setTimeout(() => {
    collectionTimer = null;
    const view = getCollectionView();
    for (const fn of collectionListeners) fn(view);
    void fsp
      .mkdir(storeDir(), { recursive: true })
      .then(() => fsp.writeFile(collectionFile(), JSON.stringify(collection)))
      .catch(() => undefined);
  }, 300);
}

/** Reads the owned-skill numbers from the profile (only its ::IMPS section is kept). */
async function readProfileSkills(dir: string): Promise<void> {
  if (!profileName) return;
  try {
    const text = await fsp.readFile(path.join(dir, 'data', 'profiles', `${profileName}.guy`), 'utf8');
    const next = parseProfileSkills(text);
    if (JSON.stringify(next) !== JSON.stringify(collection.profile)) {
      collection.profile = next;
      collectionChanged();
    }
  } catch {
    /* no profile yet */
  }
}

async function saveMatches(): Promise<void> {
  await fsp.mkdir(storeDir(), { recursive: true });
  await fsp.writeFile(matchesFile(), JSON.stringify(matches, null, 1));
}

export function getMatches(): MatchRecord[] {
  return matches;
}

function skillStats(): { stats: Record<string, SkillStat>; overall: number | null } {
  const stats: Record<string, SkillStat> = {};
  const done = matches.filter((m) => m.place !== null || m.complete);
  for (const m of done) {
    for (const id of Object.keys(m.build)) {
      const s = (stats[id] ??= { played: 0, wins: 0 });
      s.played++;
      if (m.won) s.wins++;
    }
  }
  return { stats, overall: done.length >= 3 ? done.filter((m) => m.won).length / done.length : null };
}

// ---------------------------------------------------------------------------------------------
// Log reading

function feed(e: TimedEvent): void {
  lastLogTime = e.at;
  if (e.ev.t === 'draftInfo' && setOwnedCount(collection, e.ev.enabled, e.at)) collectionChanged();
  if (e.ev.t === 'self') profileName ??= e.ev.name;
  if (startsNewMatch(live, e)) {
    archive(live);
    live = newMatch(e.at, profileName);
    // The log is minutes behind the screen: keep what the screen has already seen of this match.
    pendingPicks = pendingPicks.filter((p) => p.at >= e.at);
    if (!(offer?.source === 'screen' && offer.at >= e.at)) offer = null;
    if (!goal.locked) goal = { ids: [], locked: false };
  }
  if (!live) return;
  const before = live.picks.length;
  applyEvent(live, e);
  // The build is logged right before the first draft: save it now (class confirmed at match end).
  if (e.ev.t === 'draft' && before === 0 && live.slots.length) noteBuild(live);
  if (e.ev.t === 'draft' && live.picks.length > before) {
    // The log confirmed a pick, so it replaces our guess: the matching pending pick, else the oldest.
    const logged = e.ev.selected ? idFromLogName(e.ev.selected.name) : null;
    const offers = e.ev.offers.map((o) => idFromLogName(o.name)).filter((x): x is string => !!x);
    for (const fn of draftListeners) fn({ offers, picked: logged, at: e.at });
    const i = pendingPicks.findIndex((p) => p.skillId === logged);
    pendingPicks.splice(Math.max(i, 0), 1);
    // A hand-set offer it answered is over. A screen offer is the screen's to end: this line can be minutes old.
    if (offer && offer.source !== 'screen' && logged && offer.ids.includes(logged)) offer = null;
  }
  if (e.ev.t === 'standing' || e.ev.t === 'closed') {
    pendingPicks = pendingPicks.filter((p) => p.at >= e.at);
    archive(live);
    if (e.ev.t === 'closed') live = null;
  }
}

function feedText(text: string): void {
  const lines = (partial + text).split('\n');
  partial = lines.pop() ?? '';
  for (const line of lines) {
    const e = parseLine(line);
    if (e) feed(e);
  }
}

async function readProfileName(dir: string): Promise<string | null> {
  try {
    const files = readdirSync(path.join(dir, 'data', 'profiles')).filter((f) => f.endsWith('.guy'));
    return files.length ? path.basename(files[0], '.guy') : null;
  } catch {
    return null;
  }
}

/** Reads every log on disk (oldest first) so matches that are about to rotate away get saved. */
async function importLogs(dir: string): Promise<void> {
  const dataDir = path.join(dir, 'data');
  for (const name of LOGS_OLDEST_FIRST) {
    const file = path.join(dataDir, name);
    if (!existsSync(file)) continue;
    partial = '';
    feedText((await fsp.readFile(file, 'utf8')) + '\n');
    if (name !== 'log.txt') {
      archive(live);
      live = null;
    } else {
      logOffset = (await fsp.stat(file)).size;
    }
  }
  partial = '';
}

/** Reads whatever the game appended. Serialized: a change during a read triggers one more read. */
async function poll(): Promise<void> {
  if (!installDir) return;
  if (reading) {
    readAgain = true;
    return;
  }
  reading = true;
  const file = path.join(installDir, 'data', 'log.txt');
  try {
    const st = await fsp.stat(file);
    if (st.size < logOffset) {
      // The game started again and rotated its logs.
      archive(live);
      live = null;
      logOffset = 0;
      partial = '';
    }
    if (st.size > logOffset) {
      const fh = await fsp.open(file, 'r');
      try {
        const buf = Buffer.alloc(st.size - logOffset);
        await fh.read(buf, 0, buf.length, logOffset);
        logOffset = st.size;
        feedText(buf.toString('utf8'));
      } finally {
        await fh.close();
      }
      emit();
    }
  } catch {
    /* log missing while the game starts */
  } finally {
    reading = false;
    if (readAgain) {
      readAgain = false;
      void poll();
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Live state

export function getSkillshotState(): SkillshotLiveState {
  const m = live;
  const build = m ? buildIds(m.build) : {};
  for (const p of pendingPicks) build[p.skillId] = (build[p.skillId] ?? 0) + 1;
  const pool: Record<string, number> = {};
  if (m) for (const [name, r] of Object.entries(m.pool)) {
    const id = idFromLogName(name);
    if (id) pool[id] = r;
  }

  const recentPicks: SkillshotLiveState['recentPicks'] = [];
  if (m)
    for (const p of m.picks) {
      const id = p.selected ? idFromLogName(p.selected.name) : null;
      if (id) recentPicks.push({ skillId: id, level: p.selected!.level, round: p.round, confirmed: true });
    }
  for (const p of pendingPicks) recentPicks.push({ skillId: p.skillId, level: build[p.skillId] ?? 1, round: m?.round ?? 1, confirmed: false });

  let goalIds = goal.ids;
  const cls = effectiveClass();
  if (data && !goal.locked && Object.keys(build).length >= 2) goalIds = suggestGoal(data, build, cls, Object.keys(pool));

  const { stats, overall } = skillStats();
  // Your rarity per skill: this match's build first, else the highest seen in your collection.
  const rarity: Record<string, number> = {};
  for (const o of getCollectionView().owned) if (o.skillId && o.rarities.length) rarity[o.skillId] = o.rarity;
  Object.assign(rarity, pool);
  const adv =
    data && offer
      ? advise({ data, offers: offer.ids, build, classId: cls, goal: goalIds, pool: Object.keys(pool), rarity, round: m?.round ?? 1, stats, overallWinRate: overall })
      : null;

  return {
    available: !!data,
    reason,
    inMatch: (!!m && !m.ended) || pendingPicks.length > 0,
    self: m?.self ?? profileName,
    round: m?.round ?? 1,
    final: m?.final ?? false,
    roundResults: m?.roundResults ?? [null, null, null],
    level: m?.level ?? 0,
    kills: m?.kills ?? 0,
    deaths: m?.deaths ?? 0,
    syringes: m?.syringes ?? 0,
    wanted: m?.wanted ?? 0,
    classId: cls,
    classSource: classId ? 'manual' : cls ? 'auto' : null,
    build,
    pool,
    recentPicks: recentPicks.slice(-6),
    offer,
    coach,
    rarityUp,
    advice: adv,
    goal: { ids: goalIds, locked: goal.locked },
    goalProgress: goalProgress(goalIds, build),
    activeSynergies: data ? activeSynergies(data, build, cls) : [],
    lastMatch: matches.at(-1) ?? null,
    logTime: lastLogTime,
  };
}

function emit(): void {
  const s = getSkillshotState();
  for (const fn of listeners) fn(s);
}

export function onSkillshotChange(fn: (s: SkillshotLiveState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------------------------------------------------------------------------------------------
// Actions (overlay hotkeys, manual grid, screen reader, memory reader)

export function setOffer(ids: string[], source: OfferSource): void {
  // The screen can see a new match before the log does: don't add its picks to the finished one.
  if (source === 'screen' && live?.ended) {
    archive(live);
    live = null;
  }
  const valid = ids.filter((id) => data?.skills.some((s) => s.id === id)).slice(0, 3);
  offer = valid.length ? { ids: valid, source, at: Date.now() } : null;
  coach = null; // A note was about the last offer.
  emit();
}

/** The screen reader saw this rarity on a skill's draft card. Saves it and refreshes the advice, which uses it. */
export function noteScreenRarity(id: string, rarity: number): void {
  const num = data?.skills.find((s) => s.id === id)?.num;
  if (num === undefined) return;
  const at = Date.now();
  const { changed, rose } = setScreenRarity(collection, num, rarity, at);
  if (!changed) return;
  if (rose) rarityUp = { skillId: id, rarity, at };
  collectionChanged();
  emit();
}

/** Shows a note from Claude on the overlay until the next offer, or for COACH_MS. */
export function setCoachNote(text: string, skillId: string | null): void {
  coach = { text, skillId, at: Date.now() };
  if (coachTimer) clearTimeout(coachTimer);
  coachTimer = setTimeout(() => {
    coach = null;
    emit();
  }, COACH_MS);
  emit();
}

/** The screen stopped showing an offer. True if a screen offer was still open (nothing answered it yet). */
export function endScreenOffer(): boolean {
  if (offer?.source !== 'screen') return false;
  offer = null;
  emit();
  return true;
}

/** The game closed or screen reading was turned off: drop what only the screen knew. */
export function resetScreenState(): void {
  pendingPicks = [];
  if (offer?.source === 'screen') offer = null;
  emit();
}

/** Picks offer #index (Alt+1 = 0, Alt+2 = 1), or a skill id directly. */
export function pickOffer(which: number | string): void {
  const id = typeof which === 'string' ? which : offer?.ids[which];
  if (!id) return;
  pendingPicks.push({ skillId: id, at: Date.now(), round: live?.round ?? 1 });
  offer = null;
  emit();
}

export function setGoal(ids: string[], locked: boolean): void {
  goal = { ids, locked };
  void savePrefs();
  emit();
}

export function setClass(id: string | null): void {
  classId = id;
  void savePrefs();
  emit();
}

/** Alt+N: move to the next round when the log is behind. */
export function nextRound(): void {
  live ??= newMatch(Date.now(), profileName);
  live.round = Math.min(3, live.round + 1);
  live.final = live.round === 3;
  emit();
}

/** Alt+E: end the match now (the log fills in the standings later). */
export function endMatch(): void {
  archive(live);
  live = null;
  pendingPicks = [];
  offer = null;
  emit();
}

async function savePrefs(): Promise<void> {
  await fsp.mkdir(storeDir(), { recursive: true });
  await fsp.writeFile(prefsFile(), JSON.stringify({ classId, goal }));
}

async function loadStore(): Promise<void> {
  try {
    matches = JSON.parse(await fsp.readFile(matchesFile(), 'utf8')) as MatchRecord[];
  } catch {
    matches = [];
  }
  try {
    collection = { ...emptyStore(), ...(JSON.parse(await fsp.readFile(collectionFile(), 'utf8')) as CollectionStore) };
  } catch {
    collection = emptyStore();
  }
  try {
    const p = JSON.parse(await fsp.readFile(prefsFile(), 'utf8')) as { classId?: string | null; goal?: typeof goal };
    classId = p.classId ?? null;
    if (p.goal?.locked) goal = p.goal;
  } catch {
    /* first run */
  }
}

/**
 * Keeps a copy of the game's log after each session. The game only keeps its last 4 logs, and these are
 * the only record of draft order, level timing and round length.
 */
export async function backupGameLog(): Promise<void> {
  if (!installDir) return;
  const dir = path.join(storeDir(), 'logs');
  try {
    await fsp.mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await fsp.copyFile(path.join(installDir, 'data', 'log.txt'), path.join(dir, `log-${stamp}.txt`));
    const files = (await fsp.readdir(dir)).filter((f) => f.startsWith('log-')).sort();
    for (const old of files.slice(0, Math.max(0, files.length - LOG_BACKUPS))) await fsp.unlink(path.join(dir, old));
  } catch (err) {
    console.warn('[skillshot] log backup failed:', err);
  }
}

export async function initSkillshot(): Promise<void> {
  await loadStore();
  installDir = findInstallDir();
  if (!installDir) {
    reason = 'Skillshot City is not installed (or not imported from Steam yet).';
    emit();
    return;
  }
  try {
    data = applyTiers(await extractSkillshotData(installDir));
    profileName = await readProfileName(installDir);
    await importLogs(installDir);
    await readProfileSkills(installDir);
    reason = undefined;
  } catch (err) {
    reason = `Couldn't read the game's files: ${(err as Error).message}`;
  }
  try {
    watcher = watch(path.join(installDir, 'data'), (_ev, name) => {
      if (!name || name === 'log.txt') void poll();
    });
  } catch {
    watcher = null;
  }
  try {
    const dir = installDir;
    profileWatcher = watch(path.join(dir, 'data', 'profiles'), (_ev, name) => {
      if (!name || name.endsWith('.guy')) void readProfileSkills(dir);
    });
  } catch {
    profileWatcher = null;
  }
  pollTimer = setInterval(() => void poll(), FALLBACK_MS);
  emit();
  collectionChanged();
}

export function disposeSkillshot(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  watcher?.close();
  watcher = null;
  profileWatcher?.close();
  profileWatcher = null;
  archive(live);
}
