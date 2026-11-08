/**
 * Your Skillshot City skill collection, pieced together read-only from what the game leaves on disk:
 * - every match's equipped skill build ("Build Slot (Rarity=n): ID=… Name=…" lines in log.txt),
 *   tied to the class you played (classID in your final standing);
 * - the owned-skill list in your profile (`::IMPS` in data/profiles/<name>.guy), which only has
 *   the game's skill numbers. Names fill in as the log reveals each number.
 * The full collection lives on the game's server, so skills you never equip only show up once the
 * memory reader (or a build that uses them) reveals them.
 */

export const RARITY_NAMES = ['Common', 'Rare', 'Epic', 'Legendary'] as const;
export const RARITY_COLORS = ['#b8bcd9', '#4f8cff', '#b26bff', '#f5c451'] as const;

/** The game's class numbers (classID in standings) follow its translation order; 0 = Random. */
export const CLASS_BY_NUM = ['RANDOM', 'ASSAULT', 'STRIKER', 'HEAVY', 'CASTER', 'SCAVENGER', 'CRIMINAL', 'SCIENTIST', 'ASSASSIN'] as const;

export function classIdFromNum(n: number | null | undefined): string | null {
  return n !== null && n !== undefined && n > 0 ? (CLASS_BY_NUM[n] ?? null) : null;
}

export interface BuildSlot {
  /** Game skill number; -1 = empty slot. */
  num: number;
  /** Upper-case English name from the log, null for an empty slot. */
  name: string | null;
  rarity: number;
}

export interface OwnedSkill {
  num: number;
  /** ShotCaller skill id, once the number is known by name. */
  skillId: string | null;
  /** Highest rarity seen. */
  rarity: number;
  /** Every rarity this skill was seen at in your builds. */
  rarities: number[];
  /** Entries in your profile's ::IMPS list (looks like draft impressions, not ownership). */
  copies: number;
  /** Classes whose build used it. */
  classes: string[];
  lastSeen: number | null;
}

export interface ClassBuild {
  classId: string;
  slots: (BuildSlot & { skillId: string | null })[];
  seenAt: number;
  /** True when the class came from your final standing; false = guessed from your last known class. */
  confirmed: boolean;
}

export interface SkillCollection {
  owned: OwnedSkill[];
  classBuilds: ClassBuild[];
  /** Class read from your newest finished match. */
  detectedClass: string | null;
  /** Skills unlocked on your account, as the game logs it at each draft ("Enabled: n"). */
  ownedCount: number | null;
  updatedAt: number;
}

/** What the tracker persists (userData/skillshot/collection.json). */
export interface CollectionStore {
  /** Skill number → upper-case name. */
  nums: Record<number, string>;
  /** Skill number → rarities seen, last seen, classes. */
  seen: Record<number, { rarities: number[]; lastSeen: number; classes: string[] }>;
  classBuilds: Record<string, { slots: BuildSlot[]; seenAt: number; confirmed: boolean }>;
  /** Skill number → copies in the profile's owned list. */
  profile: Record<number, number>;
  detectedClass: string | null;
  detectedAt: number;
  ownedCount?: number;
  ownedCountAt?: number;
}

export function emptyStore(): CollectionStore {
  return { nums: {}, seen: {}, classBuilds: {}, profile: {}, detectedClass: null, detectedAt: 0 };
}

/** Records one match's equipped build. Later matches win; a confirmed class beats a guess. */
export function recordBuild(store: CollectionStore, slots: BuildSlot[], at: number, classId: string | null, confirmed: boolean): void {
  for (const s of slots) {
    if (s.num < 0 || !s.name) continue;
    store.nums[s.num] = s.name;
    const e = (store.seen[s.num] ??= { rarities: [], lastSeen: 0, classes: [] });
    if (!e.rarities.includes(s.rarity)) e.rarities.push(s.rarity);
    e.lastSeen = Math.max(e.lastSeen, at);
    if (classId && !e.classes.includes(classId)) e.classes.push(classId);
  }
  if (!classId || !slots.length) return;
  const prev = store.classBuilds[classId];
  if (!prev || at > prev.seenAt || (at === prev.seenAt && confirmed && !prev.confirmed)) {
    store.classBuilds[classId] = { slots: slots.map((s) => ({ ...s })), seenAt: at, confirmed };
  }
}

export function setDetectedClass(store: CollectionStore, classId: string | null, at: number): void {
  if (classId && at >= store.detectedAt) {
    store.detectedClass = classId;
    store.detectedAt = at;
  }
}

export function setOwnedCount(store: CollectionStore, n: number, at: number): boolean {
  if (at < (store.ownedCountAt ?? 0) || n === store.ownedCount) return false;
  store.ownedCount = n;
  store.ownedCountAt = at;
  return true;
}

/** Pulls the owned-skill numbers out of the profile text. Reads only the `::IMPS` section. */
export function parseProfileSkills(text: string): Record<number, number> {
  const m = /::IMPS\s*\r?\n([^\r\n]*)/.exec(text);
  const out: Record<number, number> = {};
  if (!m) return out;
  for (const entry of m[1].split(':')) {
    const f = entry.split(',');
    if (f.length < 2 || f[1] === '') continue;
    const n = Number(f[1]);
    if (Number.isInteger(n) && n >= 0) out[n] = (out[n] ?? 0) + 1;
  }
  return out;
}

/** Builds the view the UI shows. `idOf` turns an upper-case English name into a skill id. */
export function toCollection(store: CollectionStore, idOf: (name: string) => string | null): SkillCollection {
  const nums = new Set<number>([...Object.keys(store.seen), ...Object.keys(store.profile)].map(Number));
  const owned: OwnedSkill[] = [...nums].map((num) => {
    const seen = store.seen[num];
    const name = store.nums[num];
    const rarities = [...(seen?.rarities ?? [])].sort();
    return {
      num,
      skillId: name ? idOf(name) : null,
      rarity: rarities.length ? Math.max(...rarities) : 0,
      rarities,
      copies: store.profile[num] ?? 0,
      classes: seen?.classes ?? [],
      lastSeen: seen?.lastSeen ?? null,
    };
  });
  owned.sort((a, b) => b.rarity - a.rarity || (a.skillId ?? '~').localeCompare(b.skillId ?? '~') || a.num - b.num);
  const classBuilds: ClassBuild[] = Object.entries(store.classBuilds)
    .map(([classId, b]) => ({
      classId,
      seenAt: b.seenAt,
      confirmed: b.confirmed,
      slots: b.slots.map((s) => ({ ...s, skillId: s.name ? idOf(s.name) : null })),
    }))
    .sort((a, b) => b.seenAt - a.seenAt);
  return { owned, classBuilds, detectedClass: store.detectedClass, ownedCount: store.ownedCount ?? null, updatedAt: Math.max(store.detectedAt, ...classBuilds.map((b) => b.seenAt), 0) };
}
