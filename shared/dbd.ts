/**
 * Dead by Daylight: data shapes shared by the main process, the hub and (Phase D2) the MCP tools.
 *
 * Game data comes from the DbD wiki (deadbydaylight.wiki.gg), patch notes from Steam's news feed for DbD.
 * Never from the game itself: ShotCaller doesn't touch DbD's memory or process (EasyAntiCheat).
 */

export const DBD_STEAM_APP = 381210;

export type DbdSide = 'survivor' | 'killer';

export interface DbdPatch {
  version: string;
  /** Release day, ms (local midnight). */
  date: number;
}

export interface DbdChapter {
  id: number;
  name: string;
  date: number;
  version: string | null;
}

export interface DbdKiller {
  id: number;
  name: string;
  realName: string | null;
  power: string | null;
  powerText: string | null;
  /** e.g. "4.6 m/s" (110 %). */
  speed: string | null;
  /** Terror radius, e.g. "32 m". */
  radius: string | null;
  chapter: string | null;
  date: number;
  version: string | null;
  /** Patch the power last changed in. */
  powerPatch: string | null;
  icon: string | null;
}

export interface DbdSurvivor {
  id: number;
  name: string;
  chapter: string | null;
  date: number;
  version: string | null;
  icon: string | null;
}

export interface DbdMap {
  id: number;
  name: string;
  realm: string | null;
  version: string | null;
  date: number | null;
}

/** One past version of a perk's numbers (from the wiki's change history). */
export interface DbdPerkVersion {
  version: string;
  values: number[];
}

export interface DbdPerk {
  name: string;
  side: DbdSide;
  /** Owner's name, or null for perks every character has. */
  character: string | null;
  tags: string[];
  /** Patch the perk last changed in. */
  patch: string | null;
  /** When it came out (its character's chapter, or its first known version). */
  date: number;
  /** Tier values (I, II, III) and their unit, e.g. [60, 50, 40] "s". */
  values: number[];
  unit: string;
  history: DbdPerkVersion[];
  /** One plain line. */
  summary: string;
  /** Full game text as a few safe tags (b, i, br, ul, li). */
  text: string;
  quote: string | null;
  icon: string | null;
}

export interface DbdLoadoutThing {
  name: string;
  kind: 'item' | 'addon' | 'offering';
  rarity: string;
  /** Add-ons: the killer they belong to, or the item type (e.g. "Med-Kits"). Items: their type. */
  group: string | null;
  side: DbdSide | 'both';
  patch: string | null;
  tags: string[];
  summary: string;
  text: string;
  icon: string | null;
}

export interface DbdData {
  fetchedAt: number;
  /** DbD's Steam build id the data was fetched for (refetched when it changes). */
  steamBuild: string | null;
  latestPatch: string | null;
  patches: DbdPatch[];
  chapters: DbdChapter[];
  killers: DbdKiller[];
  survivors: DbdSurvivor[];
  maps: DbdMap[];
  perks: DbdPerk[];
  items: DbdLoadoutThing[];
  addons: DbdLoadoutThing[];
  offerings: DbdLoadoutThing[];
}

/** A patch's official notes, from Steam's news feed. */
export interface DbdPatchNote {
  id: string;
  title: string;
  version: string | null;
  ptb: boolean;
  date: number;
  url: string;
  /** Safe tags only (b, i, br, ul, li). */
  html: string;
}

export interface DbdBuild {
  id: string;
  name: string;
  side: DbdSide;
  /** Up to 4 perk names; '' for an empty slot. */
  perks: string[];
  /** Killer builds: the killer. */
  killer: string | null;
  /** Survivor builds: the item. */
  item: string | null;
  addons: string[];
  offering: string | null;
  notes: string;
  /** Where it came from. */
  from: 'mine' | 'popular' | 'friend';
  createdAt: number;
  updatedAt: number;
}

/** A build in the curated "popular builds" list (games/dbd/builds.json). */
export interface DbdPopularBuild {
  name: string;
  side: DbdSide;
  killer?: string;
  perks: string[];
  item?: string;
  addons?: string[];
  offering?: string;
  why: string;
}

export interface DbdPopularList {
  /** Patch the list was last checked against. */
  checkedPatch: string;
  updated: string;
  builds: DbdPopularBuild[];
}

/** What DbD's own settings file says (GameUserSettings.ini). */
export interface DbdGameSettings {
  found: boolean;
  menuScale: number | null;
  hudScale: number | null;
  width: number | null;
  height: number | null;
  /** 0 fullscreen, 1 windowed fullscreen, 2 windowed. */
  windowMode: number | null;
}

export interface DbdSettings {
  /** Feature switches. */
  catchupBanner: boolean;
  patchNotice: boolean;
  newTags: boolean;
  popularOnline: boolean;
  /** Which side the hub shows. */
  side: DbdSide;
  /** Catch-up start, ms; null = Steam's last-played date. */
  catchupFrom: number | null;
  /** Latest patch the user has seen "what changed" for. */
  seenPatch: string | null;
  /** Setup. Null = use DbD's settings file. */
  menuScale: number | null;
  hudScale: number | null;
  monitorId: number | null;
  setupDone: boolean;
}

export const DEFAULT_DBD_SETTINGS: DbdSettings = {
  catchupBanner: true,
  patchNotice: true,
  newTags: true,
  popularOnline: true,
  side: 'survivor',
  catchupFrom: null,
  seenPatch: null,
  menuScale: null,
  hudScale: null,
  monitorId: null,
  setupDone: false,
};

export interface DbdDataStatus {
  state: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  fetchedAt: number | null;
  latestPatch: string | null;
  /** Icons saved on this PC so far. */
  icons: number;
}

/** Everything small the hub needs; the big data set is fetched on its own (getDbdData). */
export interface DbdState {
  settings: DbdSettings;
  builds: DbdBuild[];
  /** Steam's last-played date for DbD, ms. */
  steamLastPlayed: number | null;
  /** How long that last session was, minutes (from Steam's last launch/exit), if known. */
  steamLastSessionMin: number | null;
  steamHours: number | null;
  game: DbdGameSettings;
  data: DbdDataStatus;
}

export type DbdSettingsPatch = Partial<DbdSettings>;

// ---------------------------------------------------------------------------------------------
// Versions

/** Compares "10.2.2b" style versions. */
export function cmpVersion(a: string, b: string): number {
  const pa = a.match(/\d+|[a-z]+/gi) ?? [];
  const pb = b.match(/\d+|[a-z]+/gi) ?? [];
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i];
    const y = pb[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = Number(x);
    const ny = Number(y);
    if (!Number.isNaN(nx) && !Number.isNaN(ny)) {
      if (nx !== ny) return nx - ny;
    } else if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** The newest live patch out on a given day. */
export function versionAt(patches: DbdPatch[], when: number): string | null {
  let best: DbdPatch | null = null;
  for (const p of patches) if (p.date <= when && (!best || p.date > best.date || (p.date === best.date && cmpVersion(p.version, best.version) > 0))) best = p;
  return best?.version ?? null;
}

export function patchDate(patches: DbdPatch[], version: string | null): number | null {
  if (!version) return null;
  const p = patches.find((x) => x.version === version);
  return p ? p.date : null;
}

// ---------------------------------------------------------------------------------------------
// Share codes: "DBD1-" + base64url(deflate(JSON)). Short enough to paste in a chat.

type CodeBody = [s: 0 | 1, name: string, perks: string[], killer: string, item: string, addons: string[], offering: string];

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(text: string): Uint8Array {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encodeBuild(b: Pick<DbdBuild, 'name' | 'side' | 'perks' | 'killer' | 'item' | 'addons' | 'offering'>): Promise<string> {
  const body: CodeBody = [b.side === 'killer' ? 1 : 0, b.name.slice(0, 60), b.perks.slice(0, 4), b.killer ?? '', b.item ?? '', b.addons.slice(0, 2), b.offering ?? ''];
  const packed = await pipe(new TextEncoder().encode(JSON.stringify(body)), new CompressionStream('deflate-raw'));
  return `DBD1-${b64url(packed)}`;
}

export async function decodeBuild(code: string): Promise<Omit<DbdBuild, 'id' | 'from' | 'createdAt' | 'updatedAt' | 'notes'> | null> {
  const m = code.trim().match(/^DBD1-([A-Za-z0-9_-]{8,600})$/);
  if (!m) return null;
  try {
    const raw = await pipe(unb64url(m[1]), new DecompressionStream('deflate-raw'));
    const v = JSON.parse(new TextDecoder().decode(raw)) as unknown;
    if (!Array.isArray(v) || v.length < 7) return null;
    const str = (x: unknown, n: number) => (typeof x === 'string' ? x.slice(0, n) : '');
    const list = (x: unknown, n: number) => (Array.isArray(x) ? x.slice(0, n).map((y) => str(y, 60)) : []);
    const perks = list(v[2], 4);
    while (perks.length < 4) perks.push('');
    return {
      side: v[0] === 1 ? 'killer' : 'survivor',
      name: str(v[1], 60) || 'Shared build',
      perks,
      killer: str(v[3], 60) || null,
      item: str(v[4], 60) || null,
      addons: list(v[5], 2).filter(Boolean),
      offering: str(v[6], 60) || null,
    };
  } catch {
    return null;
  }
}
