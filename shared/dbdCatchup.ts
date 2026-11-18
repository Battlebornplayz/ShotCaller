import { cmpVersion, versionAt, type DbdChapter, type DbdData, type DbdKiller, type DbdLoadoutThing, type DbdMap, type DbdPatch, type DbdPerk, type DbdSurvivor } from './dbd';

/**
 * "What changed since you last played": everything in the patches released after a given day, from the wiki data.
 * Pure, so the hub and (Phase D2) the Ask AI tools give the same answer.
 */

export interface DbdPerkChange {
  perk: DbdPerk;
  /** Newest version in the gap it changed in. */
  version: string;
  /** Tier values before the gap (if the wiki has them) and now. */
  before: number[] | null;
  after: number[];
}

export interface DbdCatchup {
  from: number;
  /** Patch you last played on, and the patch out now. */
  fromVersion: string | null;
  nowVersion: string | null;
  days: number;
  patches: DbdPatch[];
  chapters: DbdChapter[];
  killers: DbdKiller[];
  survivors: DbdSurvivor[];
  maps: DbdMap[];
  newPerks: DbdPerk[];
  changedPerks: DbdPerkChange[];
  /** Killers whose power changed (not new ones). */
  changedPowers: DbdKiller[];
  /** Killer add-on changes, counted per killer. */
  changedAddons: { killer: string; count: number }[];
  changedItems: DbdLoadoutThing[];
  changedOfferings: DbdLoadoutThing[];
}

export function computeCatchup(data: DbdData, from: number, now = Date.now()): DbdCatchup {
  const fromVersion = versionAt(data.patches, from);
  const nowVersion = versionAt(data.patches, now) ?? data.latestPatch;
  const inGap = (v: string | null | undefined): boolean =>
    !!v && (!fromVersion || cmpVersion(v, fromVersion) > 0) && (!nowVersion || cmpVersion(v, nowVersion) <= 0);
  const isNew = (date: number) => date > from && date <= now;

  const killers = data.killers.filter((k) => isNew(k.date));
  const newPerks = data.perks.filter((p) => isNew(p.date));
  const newPerkNames = new Set(newPerks.map((p) => p.name));

  const changedPerks: DbdPerkChange[] = [];
  for (const perk of data.perks) {
    if (newPerkNames.has(perk.name)) continue;
    const changedIn = [...perk.history.map((h) => h.version), perk.patch ?? ''].filter(inGap).sort(cmpVersion);
    if (!changedIn.length) continue;
    const before = fromVersion ? [...perk.history].reverse().find((h) => cmpVersion(h.version, fromVersion) <= 0) : undefined;
    changedPerks.push({ perk, version: changedIn[changedIn.length - 1], before: before?.values.length ? before.values : null, after: perk.values });
  }
  changedPerks.sort((a, b) => cmpVersion(b.version, a.version) || a.perk.name.localeCompare(b.perk.name));

  const newKillerNames = new Set(killers.map((k) => k.name));
  const addonCount = new Map<string, number>();
  for (const a of data.addons) if (a.side === 'killer' && a.group && !newKillerNames.has(a.group) && inGap(a.patch)) addonCount.set(a.group, (addonCount.get(a.group) ?? 0) + 1);

  return {
    from,
    fromVersion,
    nowVersion,
    days: Math.max(0, Math.round((now - from) / 86_400_000)),
    patches: data.patches.filter((p) => p.date > from && p.date <= now),
    chapters: data.chapters.filter((c) => isNew(c.date)),
    killers,
    survivors: data.survivors.filter((s) => isNew(s.date)),
    maps: data.maps.filter((m) => (m.date !== null ? isNew(m.date) : inGap(m.version))),
    newPerks,
    changedPerks,
    changedPowers: data.killers.filter((k) => !newKillerNames.has(k.name) && inGap(k.powerPatch)),
    changedAddons: [...addonCount].map(([killer, count]) => ({ killer, count })).sort((a, b) => b.count - a.count),
    changedItems: data.items.filter((i) => inGap(i.patch)),
    changedOfferings: data.offerings.filter((o) => inGap(o.patch)),
  };
}

/** Tier values as "60/50/40 s". */
export function tierText(values: number[], unit: string): string {
  if (!values.length) return '';
  const u = unit ? (unit === '%' ? ' %' : ` ${unit}`) : '';
  // Perks with two numbers per tier list them as two groups of three.
  const groups: number[][] = [];
  for (let i = 0; i < values.length; i += 3) groups.push(values.slice(i, i + 3));
  return groups.map((g) => (g.every((v) => v === g[0]) ? String(g[0]) : g.join('/'))).join(' · ') + u;
}
