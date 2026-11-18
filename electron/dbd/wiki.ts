import type { DbdChapter, DbdData, DbdKiller, DbdLoadoutThing, DbdMap, DbdPatch, DbdPerk, DbdSide, DbdSurvivor } from '../../shared/dbd';
import { cmpVersion } from '../../shared/dbd';
import { isTable, num, numList, readLuaTables, str, strList, type LuaTable, type LuaValue } from './lua';
import { cleanWikiText } from './text';

/**
 * Game data from the DbD wiki (deadbydaylight.wiki.gg) through its public MediaWiki API: no key.
 * Asks openly as ShotCaller and gently: one request for the data modules, then one per text dump with a pause
 * (the wiki's Cloudflare slows fast repeat requests). Nothing is fetched from the game.
 */

export const WIKI = 'https://deadbydaylight.wiki.gg';
export const MODULES = ['Module:Datatable', 'Module:Datatable/Loadout', 'Module:Datatable/Loadout/History', 'Module:Datatable/Icons'];
export const DUMPS = ['dumpAllPerks', 'dumpAllAddons', 'dumpAllItems', 'dumpAllOfferings', 'dumpAllPowers'] as const;
export type DumpName = (typeof DUMPS)[number];
export const USER_AGENT = 'ShotCaller (open-source game companion; https://github.com/Battlebornplayz/ShotCaller)';
/** "dd.mm.yyyy" → local midnight ms. */
function wikiDate(v: LuaValue): number | null {
  const m = str(v)?.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime() : null;
}

/** File name → its address on the wiki (MediaWiki capitalises the first letter, spaces become _). */
export function wikiImageUrl(file: string): string {
  const f = file.replace(/ /g, '_');
  return `${WIKI}/images/${encodeURIComponent(f[0].toUpperCase() + f.slice(1))}`;
}

const RARITY = ['', 'Common', 'Uncommon', 'Rare', 'Very Rare', 'Ultra Rare', 'Event', 'Visceral', 'Artifact'];
const UNIT = ['', 's', 's', 'm', '%', 'tokens', 'tokens', '', 'times', 'charges'];

const rows = (t: LuaTable | undefined): LuaTable[] => (t ? t.list.filter(isTable) : []);
const entries = (t: LuaTable | undefined): [string, LuaTable][] => (t ? Object.entries(t.map).filter((e): e is [string, LuaTable] => isTable(e[1])) : []);

export function buildData(src: Record<string, string>, texts: Partial<Record<DumpName, Record<string, string>>>, steamBuild: string | null): DbdData {
  const dt = readLuaTables(src['Module:Datatable']);
  const lo = readLuaTables(src['Module:Datatable/Loadout']);
  const hist = readLuaTables(src['Module:Datatable/Loadout/History']);
  const iconsT = readLuaTables(src['Module:Datatable/Icons']).icons;

  // Icons: name → file (some entries point at another entry's name).
  const iconOf = (name: string | null): string | null => {
    let v: LuaValue = name && iconsT ? iconsT.map[name] : undefined;
    for (let i = 0; i < 4 && typeof v === 'string'; i++) v = iconsT?.map[v];
    const file = isTable(v) ? str(v.map.iconFile) : null;
    return file ? wikiImageUrl(file) : null;
  };

  // Patches (live ones only; PTBs are test builds).
  const patches: DbdPatch[] = [];
  for (const r of rows(dt.patches)) {
    if (r.map.ptb) continue;
    const version = str(r.map.patch);
    const date = wikiDate(r.map.rDate);
    if (version && date && !patches.some((p) => p.version === version)) patches.push({ version, date });
  }
  patches.sort((a, b) => b.date - a.date || cmpVersion(b.version, a.version));
  const now = Date.now();
  const latestPatch = patches.find((p) => p.date <= now)?.version ?? null;
  const dateOfVersion = (v: string | null): number | null => {
    if (!v) return null;
    const exact = patches.find((p) => p.version === v);
    if (exact) return exact.date;
    // Versions the list skips: the first patch at or after it.
    const after = patches.filter((p) => cmpVersion(p.version, v) >= 0);
    return after.length ? after[after.length - 1].date : null;
  };

  const chapters: DbdChapter[] = rows(dt.dlcs)
    .map((r) => ({ id: num(r.map.id) ?? 0, name: str(r.map.name) ?? '', date: wikiDate(r.map.rDate) ?? 0, version: str(r.map.release) }))
    .filter((c) => c.id && c.name);
  const chapterById = new Map(chapters.map((c) => [c.id, c]));
  const GAME_START = patches.length ? patches[patches.length - 1].date : new Date(2016, 5, 14).getTime();

  const powers = entries(lo.powers);
  const powerTexts = texts.dumpAllPowers ?? {};
  const killers: DbdKiller[] = rows(dt.killers).map((r) => {
    const id = num(r.map.id) ?? 0;
    const ch = chapterById.get(num(r.map.dlc) ?? -1) ?? null;
    const powerEntry = powers.find(([, p]) => num(p.map.killer) === id);
    const power = str(r.map.power) ?? powerEntry?.[0] ?? null;
    const speedV = isTable(r.map.speed) ? num(r.map.speed.list[0]) : num(r.map.speed);
    const radiusV = isTable(r.map.radius) ? (isTable(r.map.radius.list[0]) ? num(r.map.radius.list[0].list[0]) : num(r.map.radius.list[0])) : num(r.map.radius);
    const pt = power && powerTexts[power] ? cleanWikiText(powerTexts[power]).html : null;
    const name = str(r.map.name) ?? `Killer ${id}`;
    return {
      id,
      name,
      realName: str(r.map.realName),
      power,
      powerText: pt,
      speed: speedV ? `${speedV} m/s (${Math.round((speedV / 4) * 100)} %)` : null,
      radius: radiusV ? `${radiusV} m` : null,
      chapter: ch?.name ?? null,
      date: ch?.date ?? GAME_START,
      version: ch?.version ?? '1.0.0',
      powerPatch: powerEntry ? str(powerEntry[1].map.patch) : null,
      icon: iconOf(name),
    };
  });

  const survivors: DbdSurvivor[] = rows(dt.survivors).map((r) => {
    const ch = chapterById.get(num(r.map.dlc) ?? -1) ?? null;
    const name = str(r.map.name) ?? '';
    // 'William "Bill" Overbeck' is listed as "Bill Overbeck"; "Ashley J. Williams" as "Ash Williams".
    const words = name.replace(/"[^"]*"/g, ' ').split(/\s+/).filter(Boolean);
    const last = words[words.length - 1] ?? '';
    const nick = name.match(/"([^"]+)"/)?.[1] ?? str(r.map.altName);
    const icon = iconOf(name) ?? (nick ? iconOf(`${nick} ${last}`) : null) ?? (words[0] ? wikiImageUrl(`Survivor${words[0]}.png`) : null);
    return { id: num(r.map.id) ?? 0, name, chapter: ch?.name ?? null, date: ch?.date ?? GAME_START, version: ch?.version ?? '1.0.0', icon };
  });

  const realmName = new Map(rows(dt.realms).map((r) => [num(r.map.id), str(r.map.name)]));
  const maps: DbdMap[] = rows(dt.maps).map((r) => {
    const variations = isTable(r.map.variations) ? rows(r.map.variations) : [];
    const version = str(r.map.release) ?? (variations.length ? str(variations[0].map.release) : null);
    return { id: num(r.map.id) ?? 0, name: str(r.map.name) ?? '', realm: realmName.get(num(r.map.realm)) ?? null, version, date: dateOfVersion(version) };
  });

  // Perks.
  const perkHist = hist.perkDescriptionsHistory;
  const perkTexts = texts.dumpAllPerks ?? {};
  const perks: DbdPerk[] = entries(lo.perks).map(([name, p]) => {
    const side: DbdSide = str(p.map.charType) === 'K' ? 'killer' : 'survivor';
    const charId = num(p.map.character);
    const owner = charId ? (side === 'killer' ? killers.find((k) => k.id === charId) : survivors.find((s) => s.id === charId)) : undefined;
    const history = (perkHist && isTable(perkHist.map[name]) ? rows(perkHist.map[name] as LuaTable) : [])
      .map((h) => ({ version: str(h.map.version) ?? '', values: numList(h.map.values) }))
      // Live versions only: "10.2.0 (PTB)" entries are test-server states.
      .filter((h) => /^\d+(\.\d+)*[a-z]?$/.test(h.version))
      .sort((a, b) => cmpVersion(a.version, b.version));
    const firstVersion = history[0]?.version ?? null;
    const t = perkTexts[name] ? cleanWikiText(perkTexts[name]) : { html: '', quote: null, summary: '' };
    const unitIdx = numList(p.map.units)[0] ?? 0;
    return {
      name,
      side,
      character: owner?.name ?? null,
      tags: strList(p.map.tags),
      patch: str(p.map.patch),
      date: owner?.date ?? dateOfVersion(firstVersion) ?? GAME_START,
      values: numList(p.map.values),
      unit: UNIT[unitIdx] ?? '',
      history,
      summary: t.summary,
      text: t.html,
      quote: t.quote,
      icon: iconOf(name),
    };
  });

  // Items, add-ons, offerings.
  const categories = lo.categories?.map ?? {};
  const thing = (kind: DbdLoadoutThing['kind'], name: string, r: LuaTable, textMap: Record<string, string>, group: string | null, side: DbdLoadoutThing['side']): DbdLoadoutThing => {
    const t = textMap[name] ? cleanWikiText(textMap[name]) : { html: '', summary: '' };
    return {
      name,
      kind,
      rarity: RARITY[num(r.map.rarity) ?? 0] ?? '',
      group,
      side,
      patch: str(r.map.patch),
      tags: strList(r.map.tags),
      summary: t.summary,
      text: t.html,
      icon: iconOf(name),
    };
  };
  const killerName = (id: number | null) => killers.find((k) => k.id === id)?.name ?? null;
  const items = entries(lo.items)
    .filter(([, r]) => num(r.map.category) !== 0)
    .map(([n, r]) => thing('item', n, r, texts.dumpAllItems ?? {}, str(categories[String(num(r.map.category))] ?? null), 'survivor'));
  const addons = entries(lo.addons).map(([n, r]) => {
    const k = num(r.map.killer);
    const cat = num(r.map.itemsCategory);
    return thing('addon', n, r, texts.dumpAllAddons ?? {}, k ? killerName(k) : cat ? str(categories[String(cat)] ?? null) : null, k ? 'killer' : 'survivor');
  });
  const offerings = entries(lo.offerings).map(([n, r]) => {
    const ct = str(r.map.charType);
    return thing('offering', n, r, texts.dumpAllOfferings ?? {}, null, ct === 'K' ? 'killer' : ct === 'S' ? 'survivor' : 'both');
  });

  return {
    fetchedAt: Date.now(),
    steamBuild,
    latestPatch,
    patches,
    chapters,
    killers,
    survivors,
    maps,
    perks: perks.sort((a, b) => a.name.localeCompare(b.name)),
    items,
    addons,
    offerings,
  };
}
