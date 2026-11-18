/**
 * AI-made modules (Phase M1): the file format, the building-block kit, the mistake checker, one-piece edits and
 * the side-by-side change list. Plain data and pure functions, so the main process (MCP tools, saving) and the
 * renderer (drawing, review) share one copy. Code modules are Phase M2: an M1 module is data and kit blocks only.
 */

export const MODULE_FORMAT = 1;

/** Size limits (M-Q49 "size limits"). */
export const LIMITS = {
  docBytes: 1_000_000,
  assetBytes: 3_000_000,
  moduleAssetsBytes: 12_000_000,
  storageBytes: 2_000_000,
  modules: 100,
  pages: 20,
  blocksPerPage: 40,
  versionsKept: 200,
};

export type BuiltInId = 'dbd' | 'fortnite' | 'skillshot-city';
export const BUILT_IN_NAMES: Record<BuiltInId, string> = {
  dbd: 'Dead by Daylight',
  fortnite: 'Fortnite',
  'skillshot-city': 'Skillshot City',
};

/** Where a module shows (M-Q10). Over-game panels are Phase M2. */
export type ModulePlace = 'page' | 'home' | 'monitor';

export interface ModulePermissions {
  /** ShotCaller may download pictures for it from the internet (M1); outside data at run time is M3. */
  internet: boolean;
  /** Read the player's game library and playtime (sessions block). */
  library: boolean;
  /** Read the game's achievements (achievement guide block). */
  achievements: boolean;
}

export const PERMISSION_TEXT: Record<keyof ModulePermissions, string> = {
  internet: 'Download pictures from the internet',
  library: 'See your games and playtime',
  achievements: 'See your achievements for its game',
};

export interface ModuleOption {
  key: string;
  label: string;
  description?: string;
  type: 'switch' | 'choice' | 'number' | 'text';
  default: boolean | string | number;
  choices?: string[];
}

export type ShowWhen = 'always' | 'running' | 'not-running';

/** Fields every block has. */
interface BlockBase {
  /** Unique in the module; edits point at blocks by id. */
  id: string;
  title?: string;
  /** Hover help text, shown as a small "?" (G6). */
  help?: string;
  /** Only while its game runs, or only while it doesn't (B2 "pretend the game is running" tests this). */
  showWhen?: ShowWhen;
  /** Only while this switch option is on. */
  option?: string;
  /** Half-width blocks sit two to a row. */
  width?: 'full' | 'half';
  /** Own colour for this block's bar (M-Q22). */
  color?: string;
}

export type Block = BlockBase &
  (
    | { type: 'heading'; text: string }
    | { type: 'text'; text: string }
    | { type: 'image'; src: string; caption?: string }
    | { type: 'cards'; items: { title: string; text?: string; image?: string; tag?: string }[] }
    | { type: 'list'; items?: string[]; data?: string; numbered?: boolean }
    | {
        type: 'table';
        columns?: string[];
        rows?: (string | number)[][];
        data?: string;
        search?: boolean;
        sort?: boolean;
        filter?: string;
      }
    | { type: 'search'; data: string; fields?: string[]; placeholder?: string }
    | { type: 'timer'; seconds: number; label?: string; warnAt?: number }
    | {
        type: 'chart';
        kind: 'bar' | 'line' | 'pie';
        labels: string[];
        series: { name: string; values: number[] }[];
      }
    | { type: 'checklist'; items: string[]; reset?: 'never' | 'daily' | 'weekly' }
    | { type: 'links'; links: { label: string; url: string }[] }
    | { type: 'notes'; placeholder?: string }
    | { type: 'tierlist'; tiers: { label: string; color?: string; items: string[] }[] }
    | { type: 'tabs'; tabs: { title: string; blocks: Block[] }[] }
    | { type: 'progress'; items: { label: string; max: number }[] }
    | { type: 'build'; name: string; items: string[]; code?: string; notes?: string }
    | { type: 'gallery'; images: { src: string; caption?: string }[] }
    | { type: 'map'; image: string; pins: { x: number; y: number; label: string; note?: string; color?: string }[] }
    | { type: 'calendar'; events: { date: string; title: string; note?: string }[] }
    | { type: 'countdown'; to: string; label?: string }
    | { type: 'flashcards'; cards: { front: string; back: string }[]; quiz?: boolean }
    | { type: 'compare'; columns: string[]; rows: { label: string; values: string[] }[] }
    | { type: 'wheel'; items: string[] }
    | { type: 'counter'; label?: string; step?: number; min?: number; max?: number }
    | { type: 'video'; url: string; caption?: string }
    | { type: 'journal'; prompt?: string }
    | { type: 'bests'; stats: { label: string; unit?: string; lowerIsBetter?: boolean }[] }
    | { type: 'goals'; goals?: { text: string; due?: string }[] }
    | { type: 'backlog' }
    | { type: 'achievements'; tips?: Record<string, string>; show?: 'locked' | 'all'; limit?: number }
    | { type: 'sessions'; limit?: number }
  );

export type BlockType = Block['type'];

export interface ModulePage {
  id: string;
  title: string;
  blocks: Block[];
}

export interface TourStep {
  block: string;
  text: string;
}

/** A saved test (B8): open a page, maybe pretend the game runs, and expect some text on it. */
export interface ModuleTest {
  name: string;
  page?: string;
  pretendRunning?: boolean;
  expectText: string[];
}

export interface ModuleDoc {
  format: number;
  /** Lower-case slug, also the folder name. */
  id: string;
  name: string;
  description: string;
  /** One or two characters (an emoji is fine) or an asset file name. */
  icon: string;
  /** Accent colour, hex. */
  color: string;
  author: string;
  /** The library game it belongs to (null: a general module). */
  game: { key: string | null; name: string } | null;
  /** Layered on a built-in module's page (M-Q7). The built-in's own code is never changed. */
  addOnFor: BuiltInId | null;
  places: ModulePlace[];
  permissions: ModulePermissions;
  options: ModuleOption[];
  pages: ModulePage[];
  /** Named data sets blocks can point at ("data": "perks"). */
  data: Record<string, unknown>;
  /** Block ids shown on the Home card. Default: the first two blocks of the first page. */
  homeBlocks?: string[];
  tour?: TourStep[];
  tests?: ModuleTest[];
  /** Shared locked (H6): this copy can't be edited, by you or the AI. */
  locked?: boolean;
}

export interface ModuleVersionNote {
  version: number;
  at: number;
  /** One line of what changed (the AI writes it: A7). */
  summary: string;
  by: 'ai' | 'you' | 'import' | 'template';
}

/** A module as saved on this PC. */
export interface StoredModule {
  doc: ModuleDoc;
  version: number;
  enabled: boolean;
  broken: { error: string; at: number } | null;
  createdAt: number;
  updatedAt: number;
  history: ModuleVersionNote[];
  /** Where a shared copy came from, so a newer share can update it (H1). */
  shared: { author: string; sharedVersion: number } | null;
  assetsBytes: number;
}

export type ProposalKind = 'create' | 'edit' | 'restore' | 'delete';

/** A change the AI wants to make. Nothing changes until the player clicks Apply (M-Q5). */
export interface ModuleProposal {
  id: string;
  moduleId: string;
  kind: ProposalKind;
  /** The module after the change (null for delete). */
  doc: ModuleDoc | null;
  /** The version it was made against (0 for a new module). */
  baseVersion: number;
  summary: string;
  /** Saved as a draft: kept quietly in the list instead of asking right away (A5). */
  draft: boolean;
  at: number;
  by: 'chat' | 'outside';
  problems: ModuleProblem[];
}

export interface ModuleProblem {
  level: 'error' | 'warning';
  where: string;
  message: string;
}

/** A question the AI asked with buttons (G2). */
export interface ModuleQuestion {
  id: string;
  question: string;
  choices: string[];
  at: number;
  answer: string | null;
}

export interface AiLogEntry {
  at: number;
  tool: string;
  module: string | null;
  text: string;
  by: 'chat' | 'outside';
}

export interface ModulesState {
  modules: StoredModule[];
  proposals: ModuleProposal[];
  questions: ModuleQuestion[];
  safeMode: boolean;
}

export const EMPTY_MODULES: ModulesState = { modules: [], proposals: [], questions: [], safeMode: false };

/** What an import would install, shown before it does (M-Q16). */
export interface ImportPreview {
  ok: true;
  doc: ModuleDoc;
  author: string;
  sharedVersion: number;
  assets: { name: string; bytes: number }[];
  /** Already installed: this is an update to it (or an older copy). */
  existing: { version: number; sharedVersion: number | null; name: string } | null;
  token: string;
}

// ---------------------------------------------------------------------------------------------
// The kit catalogue, for the AI (modules_kit) and the docs

export const BLOCK_KIT: Record<BlockType, { what: string; fields: string }> = {
  heading: { what: 'A section title.', fields: 'text' },
  text: { what: 'Paragraphs. **bold**, lines starting "- " become bullets.', fields: 'text' },
  image: { what: 'One picture.', fields: 'src (asset name or https url from allowed sites), caption?' },
  cards: { what: 'A grid of small cards.', fields: 'items: [{title, text?, image?, tag?}]' },
  list: { what: 'A list of lines.', fields: 'items: string[] or data: name of a string list; numbered?' },
  table: {
    what: 'A table, optionally searchable, sortable and filterable.',
    fields: 'columns + rows, or data: name of a list of objects (columns = keys); search?, sort?, filter?: column to filter by',
  },
  search: { what: 'A search box over a data set; shows matching items as cards.', fields: 'data, fields?: keys to search, placeholder?' },
  timer: { what: 'A start/pause/reset timer with a ring; turns red near the end.', fields: 'seconds, label?, warnAt?: seconds left' },
  chart: { what: 'Bar, line or pie chart.', fields: 'kind, labels: string[], series: [{name, values: number[]}]' },
  checklist: { what: 'Tick boxes the player keeps; can reset daily or weekly.', fields: 'items: string[], reset?: never|daily|weekly' },
  links: { what: 'Buttons that open web pages (https only).', fields: 'links: [{label, url}]' },
  notes: { what: 'A notes box the player writes in, with simple formatting.', fields: 'placeholder?' },
  tierlist: { what: 'Tiers (S, A, B...) with items.', fields: 'tiers: [{label, color?, items: string[]}]' },
  tabs: { what: 'Tabs inside a page, each with its own blocks.', fields: 'tabs: [{title, blocks: Block[]}]' },
  progress: { what: 'Progress bars the player moves with + and -.', fields: 'items: [{label, max}]' },
  build: { what: 'A loadout/build card with a copyable share code.', fields: 'name, items: string[], code?, notes?' },
  gallery: { what: 'A picture grid; click to enlarge.', fields: 'images: [{src, caption?}]' },
  map: { what: 'A picture with numbered pins; hover a pin for its note.', fields: 'image, pins: [{x: 0-100, y: 0-100, label, note?, color?}]' },
  calendar: { what: 'A month calendar with events and the next ones listed.', fields: 'events: [{date: YYYY-MM-DD, title, note?}]' },
  countdown: { what: 'Days/hours left until a date (season end, event).', fields: 'to: ISO date, label?' },
  flashcards: { what: 'Flip cards to learn; quiz mode counts right answers.', fields: 'cards: [{front, back}], quiz?' },
  compare: { what: 'Side-by-side comparison.', fields: 'columns: names, rows: [{label, values: string[]}]' },
  wheel: { what: 'A random picker wheel.', fields: 'items: string[]' },
  counter: { what: 'A tally counter the player clicks.', fields: 'label?, step?, min?, max?' },
  video: { what: 'A YouTube link with its thumbnail, or a video asset.', fields: 'url, caption?' },
  journal: { what: 'A dated session journal the player writes in.', fields: 'prompt?' },
  bests: { what: 'Personal bests the player records; keeps the date of each.', fields: 'stats: [{label, unit?, lowerIsBetter?}]' },
  goals: { what: 'Goals with deadlines the player ticks off; you can suggest some.', fields: 'goals?: [{text, due?: YYYY-MM-DD}]' },
  backlog: { what: "The player's what-to-play-next list, picked from their library.", fields: '(none)' },
  achievements: {
    what: "The game's achievements with your tip for each (needs the achievements permission).",
    fields: 'tips?: {achievement name: tip}, show?: locked|all, limit?',
  },
  sessions: { what: 'Recent play sessions and time per session (needs the library permission).', fields: 'limit?' },
};

export const MODULE_GUIDE = `A module is one JSON document (format ${MODULE_FORMAT}):
{ id (lower-case-slug), name, description, icon (1-2 characters or emoji, or an asset file name), color (#hex), author,
  game: {key, name} or null (key from modules_suggest_game / games_list), addOnFor: "dbd"|"fortnite"|"skillshot-city"|null,
  places: ["page","home","monitor"], permissions: {internet, library, achievements},
  options: [{key, label, description?, type: switch|choice|number|text, default, choices?}],
  pages: [{id, title, blocks: [...]}], data: {name: any JSON}, homeBlocks?: [block ids], tour?: [{block, text}],
  tests?: [{name, page?, pretendRunning?, expectText: [..]}] }
Every block: {id (unique), type, title?, help? (hover tip), showWhen?: always|running|not-running, option? (switch key), width?: full|half, color?}.
Pictures: add them with modules_add_asset first and use the file name; only these https sites work directly: steamstatic.com, steamgriddb.com, ytimg.com.
ShotCaller's dark navy look is the default; colour is optional. Keep words plain and short.`;

// ---------------------------------------------------------------------------------------------
// Small helpers

export const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'module';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const HEX = /^#[0-9a-f]{6}$/i;

/** Every block in a module, including the ones inside tabs, with where it sits. */
export function allBlocks(doc: ModuleDoc): { block: Block; page: ModulePage; path: string }[] {
  const out: { block: Block; page: ModulePage; path: string }[] = [];
  const walk = (blocks: Block[], page: ModulePage, path: string) => {
    blocks.forEach((b, i) => {
      out.push({ block: b, page, path: `${path}[${i}]` });
      if (b.type === 'tabs' && Array.isArray(b.tabs))
        b.tabs.forEach((t, j) => walk(Array.isArray(t.blocks) ? t.blocks : [], page, `${path}[${i}].tabs[${j}]`));
    });
  };
  for (const p of doc.pages) walk(Array.isArray(p.blocks) ? p.blocks : [], p, `page "${p.id}"`);
  return out;
}

export function findBlock(doc: ModuleDoc, id: string): Block | null {
  return allBlocks(doc).find((x) => x.block.id === id)?.block ?? null;
}

/** Pictures a module uses, so sharing can include its assets. */
export function imageSources(doc: ModuleDoc): string[] {
  const out: string[] = [];
  if (doc.icon && /\.(png|jpe?g|webp|gif|svg)$/i.test(doc.icon)) out.push(doc.icon);
  for (const { block: b } of allBlocks(doc)) {
    if (b.type === 'image') out.push(b.src);
    if (b.type === 'cards') b.items?.forEach((c) => c.image && out.push(c.image));
    if (b.type === 'gallery') b.images?.forEach((g) => out.push(g.src));
    if (b.type === 'map') out.push(b.image);
    if (b.type === 'video' && !/^https?:/i.test(b.url)) out.push(b.url);
  }
  return out.filter(Boolean);
}

export const ALLOWED_IMAGE_HOSTS = /^https:\/\/([a-z0-9-]+\.)*(steamstatic\.com|steamgriddb\.com|ytimg\.com)\//i;

export function defaultPermissions(): ModulePermissions {
  return { internet: false, library: false, achievements: false };
}

/** Fills the gaps in a doc the AI wrote, so small slips (no places, no options) aren't errors. */
export function normalizeDoc(raw: unknown, fallbackId?: string): ModuleDoc {
  const r = isObj(raw) ? raw : {};
  const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
  const name = str(r.name, 'New module').trim() || 'New module';
  const perms = isObj(r.permissions) ? r.permissions : {};
  const game = isObj(r.game) ? { key: typeof r.game.key === 'string' ? r.game.key : null, name: str(r.game.name) } : null;
  return {
    format: MODULE_FORMAT,
    id: slug(str(r.id) || fallbackId || name),
    name: name.slice(0, 60),
    description: str(r.description).slice(0, 400),
    icon: str(r.icon, name.slice(0, 2).toUpperCase()).slice(0, 80) || name.slice(0, 2).toUpperCase(),
    color: HEX.test(str(r.color)) ? str(r.color) : '#4f8cff',
    author: str(r.author, 'AI').slice(0, 60) || 'AI',
    game,
    addOnFor: r.addOnFor === 'dbd' || r.addOnFor === 'fortnite' || r.addOnFor === 'skillshot-city' ? r.addOnFor : null,
    places: Array.isArray(r.places)
      ? (r.places.filter((p) => p === 'page' || p === 'home' || p === 'monitor') as ModulePlace[])
      : ['page'],
    permissions: {
      internet: perms.internet === true,
      library: perms.library === true,
      achievements: perms.achievements === true,
    },
    options: Array.isArray(r.options) ? (r.options as ModuleOption[]) : [],
    pages: Array.isArray(r.pages) ? (r.pages as ModulePage[]) : [],
    data: isObj(r.data) ? r.data : {},
    ...(Array.isArray(r.homeBlocks) ? { homeBlocks: r.homeBlocks.filter((x) => typeof x === 'string') as string[] } : {}),
    ...(Array.isArray(r.tour) ? { tour: r.tour as TourStep[] } : {}),
    ...(Array.isArray(r.tests) ? { tests: r.tests as ModuleTest[] } : {}),
    ...(r.locked === true ? { locked: true } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// Mistake checker (B1), readability (B5) and slow-module warnings (B6)

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
/** Contrast against ShotCaller's card colour (#1a1c3a). */
export function contrastOnCard(hex: string): number {
  if (!HEX.test(hex)) return 21;
  const a = luminance(hex);
  const b = luminance('#1a1c3a');
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const REQUIRED: Partial<Record<BlockType, string[]>> = {
  heading: ['text'],
  text: ['text'],
  image: ['src'],
  cards: ['items'],
  search: ['data'],
  timer: ['seconds'],
  chart: ['kind', 'labels', 'series'],
  checklist: ['items'],
  links: ['links'],
  tierlist: ['tiers'],
  tabs: ['tabs'],
  progress: ['items'],
  build: ['name', 'items'],
  gallery: ['images'],
  map: ['image', 'pins'],
  calendar: ['events'],
  countdown: ['to'],
  flashcards: ['cards'],
  compare: ['columns', 'rows'],
  wheel: ['items'],
  bests: ['stats'],
};

const ARRAY_FIELDS = new Set(['items', 'series', 'labels', 'links', 'tiers', 'tabs', 'images', 'pins', 'events', 'cards', 'columns', 'rows', 'stats']);

/** Checks a module and lists problems in plain words. Errors stop it being applied; warnings don't. */
export function checkModule(doc: ModuleDoc, assets?: Set<string>): ModuleProblem[] {
  const out: ModuleProblem[] = [];
  const err = (where: string, message: string) => out.push({ level: 'error', where, message });
  const warn = (where: string, message: string) => out.push({ level: 'warning', where, message });

  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(doc.id)) err('id', 'The id must be a lower-case slug (a-z, 0-9, dashes).');
  if (!doc.name.trim()) err('name', 'The module needs a name.');
  if (!HEX.test(doc.color)) err('color', 'Colour must look like #4f8cff.');
  else if (contrastOnCard(doc.color) < 3) warn('color', `The colour ${doc.color} is hard to see on ShotCaller's dark cards. Pick a lighter one.`);
  if (!doc.pages.length) err('pages', 'A module needs at least one page.');
  if (doc.pages.length > LIMITS.pages) err('pages', `At most ${LIMITS.pages} pages.`);
  if (!doc.places.length) warn('places', 'It shows nowhere: add "page", "home" or "monitor" to places.');
  if (doc.places.includes('monitor') && !doc.game?.key && !doc.addOnFor)
    warn('places', 'The second-monitor spot only opens while its game runs, and this module has no game.');
  if (doc.addOnFor && doc.game?.key) warn('addOnFor', 'An add-on uses the built-in game; "game" is ignored.');

  const pageIds = new Set<string>();
  for (const p of doc.pages) {
    if (!p || typeof p.id !== 'string' || !p.id) err('pages', 'Every page needs an id.');
    else if (pageIds.has(p.id)) err(`page "${p.id}"`, 'Two pages have the same id.');
    else pageIds.add(p.id);
    if (!p.title) warn(`page "${p.id}"`, 'The page has no title.');
    if (!Array.isArray(p.blocks)) err(`page "${p.id}"`, '"blocks" must be a list.');
    else if (p.blocks.length > LIMITS.blocksPerPage) err(`page "${p.id}"`, `At most ${LIMITS.blocksPerPage} blocks on a page.`);
    else if (!p.blocks.length) warn(`page "${p.id}"`, 'The page is empty.');
  }

  const optionKeys = new Set<string>();
  for (const o of doc.options) {
    if (!o || typeof o.key !== 'string' || !o.key) {
      err('options', 'Every option needs a key.');
      continue;
    }
    if (optionKeys.has(o.key)) err(`option "${o.key}"`, 'Two options have the same key.');
    optionKeys.add(o.key);
    if (!['switch', 'choice', 'number', 'text'].includes(o.type)) err(`option "${o.key}"`, 'type must be switch, choice, number or text.');
    if (o.type === 'choice' && !(Array.isArray(o.choices) && o.choices.length)) err(`option "${o.key}"`, 'A choice option needs choices.');
    if (!o.label) warn(`option "${o.key}"`, 'The option has no label.');
  }

  const ids = new Set<string>();
  for (const { block: b, path } of allBlocks(doc)) {
    if (!b || typeof b !== 'object') {
      err(path, 'This block is empty.');
      continue;
    }
    const where = b.id ? `block "${b.id}"` : path;
    if (!b.id || typeof b.id !== 'string') err(where, 'Every block needs an id.');
    else if (ids.has(b.id)) err(where, 'Two blocks have the same id.');
    else ids.add(b.id);
    if (!(b.type in BLOCK_KIT)) {
      err(where, `Unknown block type "${String(b.type)}". Use modules_kit for the list.`);
      continue;
    }
    for (const f of REQUIRED[b.type] ?? []) {
      const v = (b as unknown as Record<string, unknown>)[f];
      if (v === undefined || v === null || v === '') err(where, `"${f}" is missing.`);
      else if (ARRAY_FIELDS.has(f) && !Array.isArray(v)) err(where, `"${f}" must be a list.`);
    }
    if (b.option && !optionKeys.has(b.option)) err(where, `It depends on the option "${b.option}", which doesn't exist.`);
    if (b.color && !HEX.test(b.color)) err(where, 'Colour must look like #4f8cff.');
    else if (b.color && contrastOnCard(b.color) < 3) warn(where, `The colour ${b.color} is hard to see on dark cards.`);
    if ((b.type === 'list' || b.type === 'table' || b.type === 'search') && b.data !== undefined) {
      const d = doc.data[b.data];
      if (d === undefined) err(where, `It uses the data set "${b.data}", which doesn't exist.`);
      else if (!Array.isArray(d)) err(where, `The data set "${b.data}" must be a list.`);
      else if (d.length > 2000) warn(where, `"${b.data}" has ${d.length} items: the page may feel slow. Split it up or add a search.`);
    }
    if (b.type === 'list' && !b.items && !b.data) err(where, 'A list needs items or data.');
    if (b.type === 'table') {
      if (!b.data && !(Array.isArray(b.columns) && Array.isArray(b.rows))) err(where, 'A table needs columns and rows, or data.');
      if (Array.isArray(b.rows) && b.rows.length > 500) warn(where, `${b.rows.length} rows: add search, or move them to a data set.`);
    }
    if (b.type === 'text' && typeof b.text === 'string' && b.text.length > 1500)
      warn(where, 'A very long text: split it into a few blocks or cards so it is easier to read.');
    if (b.type === 'links') for (const l of b.links ?? []) if (!/^https:\/\//i.test(l?.url ?? '')) err(where, `"${l?.label}" must be an https link.`);
    if (b.type === 'countdown' && Number.isNaN(Date.parse(b.to))) err(where, '"to" must be a date like 2026-12-31 or 2026-12-31T18:00:00Z.');
    if (b.type === 'calendar') for (const e of b.events ?? []) if (!/^\d{4}-\d{2}-\d{2}$/.test(e?.date ?? '')) err(where, `Event "${e?.title}" needs a date like 2026-12-31.`);
    if (b.type === 'chart') for (const s of b.series ?? []) if ((s.values?.length ?? 0) !== (b.labels?.length ?? 0)) err(where, `Series "${s.name}" needs one value per label.`);
    if (b.type === 'timer' && !(typeof b.seconds === 'number' && b.seconds > 0 && b.seconds <= 86400)) err(where, 'seconds must be between 1 and 86400.');
    if (b.type === 'achievements' && !doc.permissions.achievements) err(where, 'Turn on the "achievements" permission to use this block.');
    if (b.type === 'sessions' && !doc.permissions.library) err(where, 'Turn on the "library" permission to use this block.');
    if ((b.type === 'achievements' || b.type === 'sessions') && !doc.game?.key) err(where, 'This block needs the module to have a game.');
    if (b.type === 'map') for (const p of b.pins ?? []) if (!(p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100)) err(where, `Pin "${p.label}" must have x and y from 0 to 100.`);
  }

  for (const src of imageSources(doc)) {
    if (/^https?:/i.test(src)) {
      if (!ALLOWED_IMAGE_HOSTS.test(src)) err('pictures', `${src} can't be shown directly: save it with modules_add_asset and use the file name.`);
    } else if (assets && !assets.has(src)) err('pictures', `The picture "${src}" isn't in the module yet: add it with modules_add_asset.`);
  }
  for (const id of doc.homeBlocks ?? []) if (!ids.has(id)) err('homeBlocks', `There is no block "${id}".`);
  for (const t of doc.tour ?? []) if (!ids.has(t.block)) err('tour', `The tour points at "${t.block}", which doesn't exist.`);
  for (const t of doc.tests ?? []) {
    if (t.page && !pageIds.has(t.page)) err(`test "${t.name}"`, `There is no page "${t.page}".`);
    if (!Array.isArray(t.expectText) || !t.expectText.length) err(`test "${t.name}"`, 'A test needs expectText.');
  }
  const bytes = JSON.stringify(doc).length;
  if (bytes > LIMITS.docBytes) err('size', `The module is ${Math.round(bytes / 1000)} KB; the limit is ${LIMITS.docBytes / 1000} KB.`);
  else if (bytes > 300_000) warn('size', `The module is ${Math.round(bytes / 1000)} KB: it may load slowly.`);
  return out;
}

// ---------------------------------------------------------------------------------------------
// One-piece edits (A3)

export type ModuleEdit =
  | { op: 'set'; field: 'name' | 'description' | 'icon' | 'color' | 'author' | 'game' | 'addOnFor' | 'places' | 'permissions' | 'homeBlocks' | 'tour' | 'tests'; value: unknown }
  | { op: 'set_block'; block: Block }
  | { op: 'add_block'; page: string; block: Block; after?: string }
  | { op: 'remove_block'; id: string }
  | { op: 'move_block'; id: string; page: string; after?: string }
  | { op: 'set_page'; page: ModulePage }
  | { op: 'remove_page'; id: string }
  | { op: 'set_data'; name: string; value: unknown }
  | { op: 'remove_data'; name: string }
  | { op: 'set_option'; option: ModuleOption }
  | { op: 'remove_option'; key: string };

/** Finds the list a block sits in (a page's blocks or a tab's), so it can be replaced or removed in place. */
function locate(doc: ModuleDoc, id: string): { list: Block[]; index: number } | null {
  const search = (blocks: Block[]): { list: Block[]; index: number } | null => {
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b?.id === id) return { list: blocks, index: i };
      if (b?.type === 'tabs' && Array.isArray(b.tabs))
        for (const t of b.tabs) {
          const hit = search(Array.isArray(t.blocks) ? t.blocks : []);
          if (hit) return hit;
        }
    }
    return null;
  };
  for (const p of doc.pages) {
    const hit = search(p.blocks ?? []);
    if (hit) return hit;
  }
  return null;
}

/** Applies edits to a copy. Throws a plain-words Error on the first one that can't apply. */
export function applyEdits(doc: ModuleDoc, edits: ModuleEdit[]): ModuleDoc {
  const next = JSON.parse(JSON.stringify(doc)) as ModuleDoc;
  edits.forEach((e, n) => {
    const fail: (msg: string) => never = (msg) => {
      throw new Error(`Edit ${n + 1} (${(e as { op?: string })?.op}): ${msg}`);
    };
    switch (e?.op) {
      case 'set': {
        const allowed = ['name', 'description', 'icon', 'color', 'author', 'game', 'addOnFor', 'places', 'permissions', 'homeBlocks', 'tour', 'tests'];
        if (!allowed.includes(e.field)) fail(`"${e.field}" can't be set this way.`);
        (next as unknown as Record<string, unknown>)[e.field] = e.value;
        break;
      }
      case 'set_block': {
        const at = locate(next, e.block?.id);
        if (!at) fail(`no block "${e.block?.id}". Use add_block for a new one.`);
        else at.list[at.index] = e.block;
        break;
      }
      case 'add_block': {
        if (locate(next, e.block?.id)) fail(`a block "${e.block?.id}" already exists. Use set_block to change it.`);
        const page = next.pages.find((p) => p.id === e.page);
        if (!page) fail(`no page "${e.page}".`);
        else if (e.after) {
          const at = locate(next, e.after);
          if (!at) fail(`no block "${e.after}" to add after.`);
          else at.list.splice(at.index + 1, 0, e.block);
        } else page.blocks.push(e.block);
        break;
      }
      case 'remove_block': {
        const at = locate(next, e.id);
        if (!at) fail(`no block "${e.id}".`);
        else at.list.splice(at.index, 1);
        break;
      }
      case 'move_block': {
        const at = locate(next, e.id);
        if (!at) fail(`no block "${e.id}".`);
        else {
          const [b] = at.list.splice(at.index, 1);
          const page = next.pages.find((p) => p.id === e.page);
          if (!page) fail(`no page "${e.page}".`);
          else if (e.after) {
            const to = locate(next, e.after);
            if (!to) fail(`no block "${e.after}".`);
            else to.list.splice(to.index + 1, 0, b);
          } else page.blocks.push(b);
        }
        break;
      }
      case 'set_page': {
        const i = next.pages.findIndex((p) => p.id === e.page?.id);
        if (!e.page?.id) fail('the page needs an id.');
        if (i >= 0) next.pages[i] = e.page;
        else next.pages.push(e.page);
        break;
      }
      case 'remove_page': {
        const i = next.pages.findIndex((p) => p.id === e.id);
        if (i < 0) fail(`no page "${e.id}".`);
        next.pages.splice(i, 1);
        break;
      }
      case 'set_data':
        if (!e.name) fail('the data set needs a name.');
        next.data[e.name] = e.value;
        break;
      case 'remove_data':
        if (!(e.name in next.data)) fail(`no data set "${e.name}".`);
        delete next.data[e.name];
        break;
      case 'set_option': {
        const i = next.options.findIndex((o) => o.key === e.option?.key);
        if (!e.option?.key) fail('the option needs a key.');
        if (i >= 0) next.options[i] = e.option;
        else next.options.push(e.option);
        break;
      }
      case 'remove_option': {
        const i = next.options.findIndex((o) => o.key === e.key);
        if (i < 0) fail(`no option "${e.key}".`);
        next.options.splice(i, 1);
        break;
      }
      default:
        fail('unknown op. Use set, set_block, add_block, remove_block, move_block, set_page, remove_page, set_data, remove_data, set_option or remove_option.');
    }
  });
  return normalizeDoc(next, doc.id);
}

// ---------------------------------------------------------------------------------------------
// Side-by-side changes (A4)

export interface ModuleChange {
  kind: 'added' | 'removed' | 'changed';
  what: 'module' | 'page' | 'block' | 'data' | 'option';
  /** Plain label, e.g. 'Block "perk-tips" (cards)'. */
  label: string;
  /** For blocks: the id, so the review can draw before and after. */
  blockId?: string;
  before?: string;
  after?: string;
}

const short = (v: unknown) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 160 ? `${s.slice(0, 157)}...` : s;
};

export function diffModules(before: ModuleDoc | null, after: ModuleDoc | null): ModuleChange[] {
  const out: ModuleChange[] = [];
  if (!before && after) return [{ kind: 'added', what: 'module', label: `New module "${after.name}"` }];
  if (before && !after) return [{ kind: 'removed', what: 'module', label: `Delete "${before.name}"` }];
  if (!before || !after) return out;
  for (const f of ['name', 'description', 'icon', 'color', 'author', 'game', 'addOnFor', 'places', 'permissions', 'homeBlocks', 'tour', 'tests'] as const) {
    const a = JSON.stringify(before[f] ?? null);
    const b = JSON.stringify(after[f] ?? null);
    if (a !== b) out.push({ kind: 'changed', what: 'module', label: f === 'permissions' ? 'What it can do (permissions)' : `Module ${f}`, before: short(before[f] ?? '—'), after: short(after[f] ?? '—') });
  }
  const pa = new Map(before.pages.map((p) => [p.id, p]));
  const pb = new Map(after.pages.map((p) => [p.id, p]));
  for (const [id, p] of pb) if (!pa.has(id)) out.push({ kind: 'added', what: 'page', label: `Page "${p.title || id}"` });
  for (const [id, p] of pa) if (!pb.has(id)) out.push({ kind: 'removed', what: 'page', label: `Page "${p.title || id}"` });
  for (const [id, p] of pb) {
    const old = pa.get(id);
    if (old && old.title !== p.title) out.push({ kind: 'changed', what: 'page', label: `Page "${id}" title`, before: old.title, after: p.title });
    if (old && JSON.stringify(old.blocks.map((b) => b?.id)) !== JSON.stringify(p.blocks.map((b) => b?.id)))
      out.push({
        kind: 'changed',
        what: 'page',
        label: `Order of blocks on "${p.title || id}"`,
        before: old.blocks.map((b) => b?.title || b?.id).join(' → '),
        after: p.blocks.map((b) => b?.title || b?.id).join(' → '),
      });
  }
  const ba = new Map(allBlocks(before).map((x) => [x.block.id, x.block]));
  const bb = new Map(allBlocks(after).map((x) => [x.block.id, x.block]));
  const name = (b: Block) => `Block "${b.title || b.id}" (${b.type})`;
  for (const [id, b] of bb) {
    const old = ba.get(id);
    if (!old) out.push({ kind: 'added', what: 'block', label: name(b), blockId: id });
    else if (JSON.stringify(old) !== JSON.stringify(b)) out.push({ kind: 'changed', what: 'block', label: name(b), blockId: id });
  }
  for (const [id, b] of ba) if (!bb.has(id)) out.push({ kind: 'removed', what: 'block', label: name(b), blockId: id });
  const keys = new Set([...Object.keys(before.data), ...Object.keys(after.data)]);
  for (const k of keys) {
    const a = before.data[k];
    const b = after.data[k];
    if (a === undefined) out.push({ kind: 'added', what: 'data', label: `Data "${k}"`, after: short(b) });
    else if (b === undefined) out.push({ kind: 'removed', what: 'data', label: `Data "${k}"`, before: short(a) });
    else if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ kind: 'changed', what: 'data', label: `Data "${k}"`, before: short(a), after: short(b) });
  }
  const oa = new Map(before.options.map((o) => [o.key, o]));
  const ob = new Map(after.options.map((o) => [o.key, o]));
  for (const [k, o] of ob) {
    const old = oa.get(k);
    if (!old) out.push({ kind: 'added', what: 'option', label: `Option "${o.label || k}"` });
    else if (JSON.stringify(old) !== JSON.stringify(o)) out.push({ kind: 'changed', what: 'option', label: `Option "${o.label || k}"`, before: short(old), after: short(o) });
  }
  for (const [k, o] of oa) if (!ob.has(k)) out.push({ kind: 'removed', what: 'option', label: `Option "${o.label || k}"` });
  return out;
}

/** Merges two modules into a new one (A9): pages from both, ids made unique. */
export function mergeModules(a: ModuleDoc, b: ModuleDoc, name: string): ModuleDoc {
  const used = new Set(allBlocks(a).map((x) => x.block.id));
  const usedPages = new Set(a.pages.map((p) => p.id));
  const rename = (id: string, set: Set<string>) => {
    let n = id;
    let i = 2;
    while (set.has(n)) n = `${id}-${i++}`;
    set.add(n);
    return n;
  };
  const fix = (blocks: Block[]): Block[] =>
    blocks.map((bl) => {
      const copy = { ...bl, id: rename(bl.id, used) } as Block;
      if (copy.type === 'tabs') copy.tabs = copy.tabs.map((t) => ({ ...t, blocks: fix(t.blocks ?? []) }));
      return copy;
    });
  const pages = [...a.pages, ...b.pages.map((p) => ({ ...p, id: rename(p.id, usedPages), blocks: fix(p.blocks ?? []) }))];
  const optKeys = new Set(a.options.map((o) => o.key));
  return normalizeDoc({
    ...a,
    id: slug(name),
    name,
    description: `${a.description} ${b.description}`.trim().slice(0, 400),
    places: [...new Set([...a.places, ...b.places])],
    permissions: {
      internet: a.permissions.internet || b.permissions.internet,
      library: a.permissions.library || b.permissions.library,
      achievements: a.permissions.achievements || b.permissions.achievements,
    },
    options: [...a.options, ...b.options.filter((o) => !optKeys.has(o.key))],
    pages,
    data: { ...b.data, ...a.data },
    homeBlocks: undefined,
    tour: undefined,
    tests: [...(a.tests ?? []), ...(b.tests ?? [])],
    locked: undefined,
  });
}

/** The value of each option, from the player's choices or the default. */
export function optionValues(doc: ModuleDoc, saved: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const o of doc.options) out[o.key] = saved && o.key in saved ? saved[o.key] : o.default;
  return out;
}

/** Whether a block shows right now. */
export function blockVisible(b: Block, running: boolean, options: Record<string, unknown>): boolean {
  if (b.showWhen === 'running' && !running) return false;
  if (b.showWhen === 'not-running' && running) return false;
  if (b.option && !options[b.option]) return false;
  return true;
}

// ---------------------------------------------------------------------------------------------
// Templates (A1)

export interface ModuleTemplate {
  id: string;
  name: string;
  what: string;
  make(game: { key: string | null; name: string } | null): ModuleDoc;
}

const base = (id: string, name: string, game: { key: string | null; name: string } | null, extra: Partial<ModuleDoc>): ModuleDoc =>
  normalizeDoc({
    id: slug(`${game?.name ?? ''} ${id}`),
    name: game ? `${game.name} ${name}` : name,
    description: '',
    icon: (game?.name ?? name).slice(0, 2).toUpperCase(),
    color: '#4f8cff',
    author: 'AI',
    game,
    places: ['page'],
    ...extra,
  });

export const MODULE_TEMPLATES: ModuleTemplate[] = [
  {
    id: 'guide',
    name: 'Guide',
    what: 'Tips as cards, a tier list and useful links.',
    make: (g) =>
      base('guide', 'guide', g, {
        description: 'Quick tips, a tier list and links.',
        pages: [
          {
            id: 'tips',
            title: 'Tips',
            blocks: [
              { id: 'tips-cards', type: 'cards', title: 'Top tips', items: [{ title: 'Tip one', text: 'Write the first tip here.' }] },
              { id: 'tiers', type: 'tierlist', title: 'Tier list', tiers: [{ label: 'S', items: [] }, { label: 'A', items: [] }, { label: 'B', items: [] }] },
              { id: 'links', type: 'links', title: 'Links', links: [] },
            ],
          },
        ],
      }),
  },
  {
    id: 'tracker',
    name: 'Daily tracker',
    what: 'Daily and weekly checklists, a reset countdown and progress bars.',
    make: (g) =>
      base('tracker', 'tracker', g, {
        description: 'What to do each day and week.',
        places: ['page', 'home'],
        pages: [
          {
            id: 'today',
            title: 'Today',
            blocks: [
              { id: 'daily', type: 'checklist', title: 'Daily', items: ['Daily one'], reset: 'daily' },
              { id: 'weekly', type: 'checklist', title: 'Weekly', items: ['Weekly one'], reset: 'weekly' },
              { id: 'progress', type: 'progress', title: 'Progress', items: [{ label: 'Goal', max: 10 }] },
            ],
          },
        ],
      }),
  },
  {
    id: 'builds',
    name: 'Build list',
    what: 'Build cards with share codes and a comparison table.',
    make: (g) =>
      base('builds', 'builds', g, {
        description: 'Saved builds and how they compare.',
        pages: [
          {
            id: 'builds',
            title: 'Builds',
            blocks: [
              { id: 'build-1', type: 'build', name: 'First build', items: ['Item one', 'Item two'], width: 'half' },
              { id: 'compare', type: 'compare', title: 'Compare', columns: ['First build'], rows: [{ label: 'Good at', values: ['—'] }] },
            ],
          },
        ],
      }),
  },
  {
    id: 'improve',
    name: 'Get better',
    what: 'Session journal, personal bests, goals with deadlines and recent sessions.',
    make: (g) =>
      base('improve', 'progress', g, {
        description: 'Track how you play and improve.',
        places: ['page', 'home'],
        permissions: { internet: false, library: !!g?.key, achievements: false },
        pages: [
          {
            id: 'me',
            title: 'Me',
            blocks: [
              { id: 'goals', type: 'goals', title: 'Goals' },
              { id: 'bests', type: 'bests', title: 'Personal bests', stats: [{ label: 'Best score' }] },
              { id: 'journal', type: 'journal', title: 'Journal', prompt: 'What went well? What will you try next time?' },
              ...(g?.key ? [{ id: 'sessions', type: 'sessions', title: 'Recent sessions' } as Block] : []),
            ],
          },
        ],
      }),
  },
  {
    id: 'hunter',
    name: 'Achievement hunter',
    what: 'Locked achievements with a tip for each, plus a checklist.',
    make: (g) =>
      base('hunter', 'achievements', g, {
        description: 'Tips for the achievements you still need.',
        permissions: { internet: false, library: false, achievements: !!g?.key },
        pages: [
          {
            id: 'hunt',
            title: 'Hunt',
            blocks: [
              ...(g?.key ? [{ id: 'achievements', type: 'achievements', title: 'Still to get', show: 'locked', tips: {} } as Block] : []),
              { id: 'plan', type: 'checklist', title: 'Plan', items: ['First achievement to go for'] },
            ],
          },
        ],
      }),
  },
  {
    id: 'blank',
    name: 'Blank',
    what: 'One page with a heading.',
    make: (g) => base('module', 'module', g, { pages: [{ id: 'main', title: 'Main', blocks: [{ id: 'title', type: 'heading', text: g ? g.name : 'My module' }] }] }),
  },
];

// ---------------------------------------------------------------------------------------------
// Share codes (H): "SCM1." + base64url(JSON). The main process gzips the JSON first.

export const SHARE_PREFIX = 'SCM1.';

export interface SharedModuleFile {
  kind: 'shotcaller-module';
  format: number;
  doc: ModuleDoc;
  author: string;
  sharedVersion: number;
  /** Asset file name → base64. */
  assets: Record<string, string>;
}

// ---------------------------------------------------------------------------------------------
// The renderer's bridge to modules (window.shotcaller)

export type ModResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export interface ModulePreviewPayload {
  moduleId: string;
  doc: ModuleDoc;
  page: string | null;
  pretendRunning: boolean;
  as: 'page' | 'home' | 'monitor';
  storage: Record<string, unknown>;
  assets: string[];
}

export interface ModulesApi {
  getModules(): Promise<ModulesState>;
  onModules(callback: (state: ModulesState) => void): () => void;
  getModuleStorage(id: string): Promise<Record<string, unknown>>;
  onModuleStorage(callback: (change: { id: string; storage: Record<string, unknown> }) => void): () => void;
  setModuleStorage(id: string, key: string, value: unknown): Promise<ModResult>;
  resetModuleStorage(id: string): Promise<void>;
  applyModuleChange(proposalId: string): Promise<ModResult>;
  discardModuleChange(proposalId: string): Promise<void>;
  setModuleEnabled(id: string, enabled: boolean): Promise<void>;
  reportModuleError(id: string, error: string): void;
  getModuleVersion(id: string, version: number): Promise<ModuleDoc | null>;
  restoreModuleVersion(id: string, version: number): Promise<ModResult>;
  undoModule(id: string): Promise<ModResult>;
  setModulePermissions(id: string, perms: Partial<ModulePermissions>): Promise<void>;
  deleteModule(id: string): Promise<void>;
  createModuleFromTemplate(templateId: string, gameKey: string | null): Promise<ModResult<{ id: string }>>;
  setModulesSafeMode(on: boolean): Promise<void>;
  moduleShareCode(id: string, locked: boolean): Promise<ModResult<{ code: string }>>;
  moduleShareFile(id: string, locked: boolean): Promise<{ ok: boolean; error?: string }>;
  /** text null: pick a file. Null back: the file picker was closed. */
  previewModuleImport(text: string | null): Promise<ImportPreview | { ok: false; error: string } | null>;
  installModuleImport(token: string, asCopy: boolean): Promise<ModResult<{ id: string }>>;
  backupModules(): Promise<{ ok: boolean; error?: string; count?: number }>;
  restoreModulesBackup(): Promise<{ ok: boolean; error?: string; count?: number }>;
  getModulesAiLog(): Promise<AiLogEntry[]>;
  getModuleErrors(id: string): Promise<{ at: number; error: string }[]>;
  getModuleAssets(id: string): Promise<{ name: string; bytes: number }[]>;
  answerModuleQuestion(id: string, answer: string): Promise<void>;
  /** Turns the chat on if needed and asks the AI to fix a broken module. */
  askAiToFixModule(id: string): Promise<ModResult>;
  /** The preview window only. */
  getModulePreview(token: string): Promise<ModulePreviewPayload | null>;
  modulePreviewDone(token: string, result: { text: string; errors: string[]; ms: number; height: number }): void;
}
