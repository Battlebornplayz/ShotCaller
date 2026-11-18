import { app, dialog, net, protocol, BrowserWindow } from 'electron';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  checkModule,
  diffModules,
  EMPTY_MODULES,
  imageSources,
  LIMITS,
  MODULE_FORMAT,
  MODULE_TEMPLATES,
  normalizeDoc,
  SHARE_PREFIX,
  slug,
  type AiLogEntry,
  type ImportPreview,
  type ModuleDoc,
  type ModulePermissions,
  type ModuleProposal,
  type ModuleQuestion,
  type ModulesState,
  type ProposalKind,
  type SharedModuleFile,
  type StoredModule,
} from '../../shared/modules';
import { getSettings, updateSettings } from '../settings';

/**
 * AI-made modules on this PC (Phase M1). Each lives in userData/modules/<id>/:
 *   module.json   the module and its history notes (StoredModule)
 *   storage.json  what the player keeps in it (ticks, notes, journal, option choices)
 *   versions/N.json  every version, so any one can be restored (M-Q6)
 *   assets/       its pictures and videos
 * App updates never touch this folder. The AI never changes a module directly: it makes a proposal, and nothing
 * changes until the player clicks Apply (M-Q5).
 */

export const MODULE_SCHEME = 'scmod';

const root = () => path.join(app.getPath('userData'), 'modules');
const modDir = (id: string) => path.join(root(), safeId(id));
const safeId = (id: string) => slug(id);

let modules = new Map<string, StoredModule>();
let proposals: ModuleProposal[] = [];
const questions: ModuleQuestion[] = [];
let log: AiLogEntry[] = [];
const pendingImports = new Map<string, SharedModuleFile>();
const listeners = new Set<(s: ModulesState) => void>();
const storageListeners = new Set<(id: string, storage: Record<string, unknown>) => void>();

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value));
  fs.renameSync(tmp, file);
}

// ---------------------------------------------------------------------------------------------
// State and change events

export function getModulesState(): ModulesState {
  return {
    modules: [...modules.values()].sort((a, b) => a.doc.name.localeCompare(b.doc.name)),
    proposals,
    questions: questions.filter((q) => q.answer === null),
    safeMode: getSettings().mcp.modulesSafeMode,
  };
}

export function onModulesChange(fn: (s: ModulesState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function onModuleStorageChange(fn: (id: string, storage: Record<string, unknown>) => void): () => void {
  storageListeners.add(fn);
  return () => storageListeners.delete(fn);
}

function changed(): void {
  const s = getModulesState();
  for (const fn of listeners) fn(s);
}

/** Loads every module from disk. Folders without a module.json (e.g. a discarded new module's pictures) are skipped. */
export function initModules(): void {
  modules = new Map();
  try {
    for (const name of fs.readdirSync(root())) {
      const m = readJson<StoredModule>(path.join(root(), name, 'module.json'));
      if (m?.doc?.id) modules.set(m.doc.id, { ...m, doc: normalizeDoc(m.doc, m.doc.id) });
    }
  } catch {
    /* no modules yet */
  }
  proposals = readJson<ModuleProposal[]>(path.join(root(), 'proposals.json')) ?? [];
  log = readJson<AiLogEntry[]>(path.join(root(), 'ai-log.json')) ?? [];
  protocol.handle(MODULE_SCHEME, async (req) => {
    // scmod://asset/<module>/<file>
    const u = new URL(req.url);
    const [id, file] = u.pathname.replace(/^\/+/, '').split('/').map(decodeURIComponent);
    const full = assetPath(id ?? '', file ?? '');
    if (!full || !fs.existsSync(full)) return new Response('Not found', { status: 404 });
    return net.fetch(`file:///${full.replace(/\\/g, '/')}`);
  });
}

function saveModule(m: StoredModule): void {
  modules.set(m.doc.id, m);
  writeJson(path.join(modDir(m.doc.id), 'module.json'), m);
}
const saveProposals = () => writeJson(path.join(root(), 'proposals.json'), proposals);

export function getModule(id: string): StoredModule | null {
  return modules.get(id) ?? modules.get(safeId(id)) ?? [...modules.values()].find((m) => m.doc.name.toLowerCase() === id.toLowerCase()) ?? null;
}

// ---------------------------------------------------------------------------------------------
// The AI's log (I1)

export function logAi(entry: Omit<AiLogEntry, 'at'>): void {
  log.push({ ...entry, at: Date.now() });
  if (log.length > 500) log = log.slice(-500);
  try {
    writeJson(path.join(root(), 'ai-log.json'), log);
  } catch {
    /* best effort */
  }
}
export const getAiLog = () => [...log].reverse();

// ---------------------------------------------------------------------------------------------
// Assets

const ASSET_EXT = /\.(png|jpe?g|webp|gif|svg|mp4|webm)$/i;

export function cleanAssetName(name: string): string | null {
  const base = path.basename(name).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(0, 60);
  return ASSET_EXT.test(base) && !base.startsWith('.') ? base : null;
}

function assetPath(id: string, file: string): string | null {
  const name = cleanAssetName(file);
  if (!name) return null;
  return path.join(modDir(id), 'assets', name);
}

export function listAssets(id: string): { name: string; bytes: number }[] {
  try {
    const dir = path.join(modDir(id), 'assets');
    return fs.readdirSync(dir).map((name) => ({ name, bytes: fs.statSync(path.join(dir, name)).size }));
  } catch {
    return [];
  }
}

function refreshAssetBytes(id: string): void {
  const m = modules.get(id);
  if (!m) return;
  m.assetsBytes = listAssets(id).reduce((n, a) => n + a.bytes, 0);
  saveModule(m);
}

/** Saves a picture or video into a module (M-Q31). The module can be a pending new one. */
export function saveAsset(id: string, name: string, data: Buffer): { ok: true; name: string } | { ok: false; error: string } {
  const clean = cleanAssetName(name);
  if (!clean) return { ok: false, error: 'Use a file name ending in .png, .jpg, .webp, .gif, .svg, .mp4 or .webm.' };
  if (data.length > LIMITS.assetBytes) return { ok: false, error: `That file is ${Math.round(data.length / 1000)} KB; the limit is ${LIMITS.assetBytes / 1000} KB.` };
  const total = listAssets(id).filter((a) => a.name !== clean).reduce((n, a) => n + a.bytes, 0);
  if (total + data.length > LIMITS.moduleAssetsBytes) return { ok: false, error: `The module's pictures would go over ${LIMITS.moduleAssetsBytes / 1_000_000} MB.` };
  if (clean.endsWith('.svg') && /<script|on\w+\s*=|javascript:/i.test(data.toString('utf8'))) return { ok: false, error: 'Pictures can’t contain scripts.' };
  const file = path.join(modDir(id), 'assets', clean);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  refreshAssetBytes(id);
  changed();
  return { ok: true, name: clean };
}

/** Downloads a picture for a module. Needs the module's internet permission (I6). Honest about who's asking. */
export async function downloadAsset(id: string, name: string, url: string, allowed: boolean): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  if (!allowed) return { ok: false, error: 'This module isn’t allowed to use the internet. Turn on its "internet" permission (the player can block it again on the Modules page).' };
  if (!/^https:\/\//i.test(url)) return { ok: false, error: 'Only https links.' };
  try {
    const res = await net.fetch(url, { headers: { 'User-Agent': `ShotCaller/${app.getVersion()} (module picture)` } });
    if (!res.ok) return { ok: false, error: `The site answered ${res.status}.` };
    const type = res.headers.get('content-type') ?? '';
    if (!/^(image|video)\//.test(type)) return { ok: false, error: `That link isn’t a picture or video (${type || 'unknown type'}).` };
    const buf = Buffer.from(await res.arrayBuffer());
    return saveAsset(id, name, buf);
  } catch (e) {
    return { ok: false, error: `Couldn’t download it: ${(e as Error).message}` };
  }
}

const assetSet = (id: string) => new Set(listAssets(id).map((a) => a.name));

// ---------------------------------------------------------------------------------------------
// Proposals: the AI's changes waiting for Apply

/** Makes a module id that isn't taken (by a module or another pending new module). */
function freeId(want: string): string {
  const base = safeId(want);
  const taken = (id: string) => modules.has(id) || proposals.some((p) => p.kind === 'create' && p.moduleId === id);
  if (!taken(base)) return base;
  for (let i = 2; ; i++) if (!taken(`${base}-${i}`)) return `${base}-${i}`;
}

export function propose(
  kind: ProposalKind,
  moduleId: string | null,
  doc: ModuleDoc | null,
  summary: string,
  draft: boolean,
  by: 'chat' | 'outside',
): ModuleProposal | { error: string } {
  let id = moduleId ?? doc?.id ?? 'module';
  const existing = kind === 'create' ? null : getModule(id);
  if (kind !== 'create' && !existing) return { error: `There is no module "${id}". Use modules_list.` };
  if (existing?.doc.locked && kind === 'edit') return { error: `"${existing.doc.name}" was shared locked, so it can't be edited.` };
  if (kind === 'create') {
    if (modules.size >= LIMITS.modules) return { error: `There are already ${LIMITS.modules} modules. Delete some first.` };
    // Editing a new module that is still waiting for Apply keeps its id (it replaces that waiting change).
    const replacing = !!moduleId && !modules.has(moduleId) && proposals.some((p) => p.kind === 'create' && p.moduleId === moduleId);
    id = replacing ? moduleId : freeId(doc?.id ?? id);
  } else id = existing!.doc.id;
  const next = doc ? { ...normalizeDoc(doc, id), id } : null;
  const problems = next ? checkModule(next, assetSet(id)) : [];
  // A newer change to the same module replaces the older one still waiting.
  proposals = proposals.filter((p) => p.moduleId !== id);
  const p: ModuleProposal = {
    id: randomBytes(6).toString('hex'),
    moduleId: id,
    kind,
    doc: next,
    baseVersion: existing?.version ?? 0,
    summary: summary.trim().slice(0, 300) || 'Changes',
    draft,
    at: Date.now(),
    by,
    problems,
  };
  proposals.push(p);
  saveProposals();
  changed();
  return p;
}

export function getProposal(id: string): ModuleProposal | null {
  return proposals.find((p) => p.id === id || p.moduleId === id) ?? null;
}

export function discardProposal(id: string): void {
  proposals = proposals.filter((p) => p.id !== id);
  saveProposals();
  changed();
}

function writeVersion(id: string, version: number, doc: ModuleDoc): void {
  writeJson(path.join(modDir(id), 'versions', `${version}.json`), doc);
  // Keep the newest ones within the limit.
  const old = version - LIMITS.versionsKept;
  if (old > 0) fs.rmSync(path.join(modDir(id), 'versions', `${old}.json`), { force: true });
}

/** Saves a new version of a module. */
function commit(id: string, doc: ModuleDoc, summary: string, by: StoredModule['history'][number]['by']): StoredModule {
  const prev = modules.get(id);
  const now = Date.now();
  const version = (prev?.version ?? 0) + 1;
  const m: StoredModule = {
    doc: { ...doc, id },
    version,
    enabled: prev ? prev.enabled : true,
    broken: null,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
    history: [...(prev?.history ?? []), { version, at: now, summary, by }].slice(-LIMITS.versionsKept),
    shared: prev?.shared ?? null,
    assetsBytes: listAssets(id).reduce((n, a) => n + a.bytes, 0),
  };
  saveModule(m);
  writeVersion(id, version, m.doc);
  return m;
}

export function applyProposal(id: string): { ok: true } | { ok: false; error: string } {
  const p = proposals.find((x) => x.id === id);
  if (!p) return { ok: false, error: 'That change is gone.' };
  const current = modules.get(p.moduleId);
  if (p.kind !== 'create' && current && current.version !== p.baseVersion)
    return { ok: false, error: 'The module changed after the AI made this. Ask the AI to make it again.' };
  if (p.kind === 'delete') {
    deleteModule(p.moduleId);
  } else if (p.doc) {
    const problems = checkModule(p.doc, assetSet(p.moduleId)).filter((x) => x.level === 'error');
    if (problems.length) return { ok: false, error: `It has ${problems.length} mistake(s) to fix first: ${problems[0].where}: ${problems[0].message}` };
    commit(p.moduleId, p.doc, p.summary, 'ai');
  }
  proposals = proposals.filter((x) => x.id !== id);
  saveProposals();
  changed();
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// The player's own actions

export function setModuleEnabled(id: string, enabled: boolean): void {
  const m = modules.get(id);
  if (!m) return;
  m.enabled = enabled;
  if (enabled) m.broken = null;
  saveModule(m);
  changed();
}

/** A module that fails to draw is turned off with its error (M-Q18). */
export function reportModuleError(id: string, error: string): void {
  const m = modules.get(id);
  if (!m) return;
  appendError(id, error);
  if (m.broken) return;
  m.broken = { error: error.slice(0, 500), at: Date.now() };
  m.enabled = false;
  saveModule(m);
  changed();
}

function appendError(id: string, error: string): void {
  const file = path.join(modDir(id), 'errors.json');
  const list = readJson<{ at: number; error: string }[]>(file) ?? [];
  list.push({ at: Date.now(), error: error.slice(0, 500) });
  try {
    writeJson(file, list.slice(-50));
  } catch {
    /* best effort */
  }
}
/** Errors from previews go in the error log (B3) but don't turn the module off: it may be a change not applied yet. */
export function recordModuleErrors(id: string, errors: string[]): void {
  for (const e of errors.slice(0, 5)) appendError(id, `Preview: ${e}`);
}
export function getModuleErrors(id: string): { at: number; error: string }[] {
  return (readJson<{ at: number; error: string }[]>(path.join(modDir(id), 'errors.json')) ?? []).reverse();
}

export function getVersion(id: string, version: number): ModuleDoc | null {
  const d = readJson<ModuleDoc>(path.join(modDir(id), 'versions', `${version}.json`));
  return d ? normalizeDoc(d, id) : null;
}

/** Restores an old version as a new one (so restoring can be undone too). */
export function restoreVersion(id: string, version: number, by: 'you' | 'ai' = 'you'): { ok: true } | { ok: false; error: string } {
  const m = modules.get(id);
  if (!m) return { ok: false, error: 'No such module.' };
  const doc = getVersion(id, version);
  if (!doc) return { ok: false, error: `Version ${version} isn't kept any more.` };
  commit(id, doc, `Back to version ${version}`, by);
  changed();
  return { ok: true };
}

/** Undo last change (A6): back to the version before the current one. */
export function undoLast(id: string): { ok: true } | { ok: false; error: string } {
  const m = modules.get(id);
  if (!m || m.version < 2) return { ok: false, error: 'There is nothing to undo.' };
  return restoreVersion(id, m.version - 1);
}

export function setPermissions(id: string, perms: Partial<ModulePermissions>): void {
  const m = modules.get(id);
  if (!m) return;
  const doc = { ...m.doc, permissions: { ...m.doc.permissions, ...perms } };
  commit(id, doc, 'You changed what it can do', 'you');
  changed();
}

/** Deleted modules go to a bin folder rather than being erased. */
export function deleteModule(id: string): void {
  const m = modules.get(id);
  if (!m) return;
  modules.delete(id);
  const bin = path.join(root(), '.bin', `${id}-${Date.now()}`);
  try {
    fs.mkdirSync(path.dirname(bin), { recursive: true });
    fs.renameSync(modDir(id), bin);
  } catch (e) {
    console.warn('[modules] could not move to the bin:', e);
  }
  proposals = proposals.filter((p) => p.moduleId !== id);
  saveProposals();
  changed();
}

/** Start from a template without the AI. */
export function createFromTemplate(templateId: string, game: { key: string | null; name: string } | null): { ok: true; id: string } | { ok: false; error: string } {
  const t = MODULE_TEMPLATES.find((x) => x.id === templateId);
  if (!t) return { ok: false, error: 'No such template.' };
  const doc = t.make(game);
  doc.author = 'You';
  const id = freeId(doc.id);
  commit(id, { ...doc, id }, `Made from the ${t.name} template`, 'template');
  changed();
  return { ok: true, id };
}

export function setSafeMode(on: boolean): void {
  updateSettings({ mcp: { modulesSafeMode: on } });
}

/** Safe mode was switched (here or in Settings). */
export function modulesSettingsChanged(): void {
  changed();
}

// ---------------------------------------------------------------------------------------------
// Storage: what the player keeps in a module

export function getModuleStorage(id: string): Record<string, unknown> {
  return readJson<Record<string, unknown>>(path.join(modDir(id), 'storage.json')) ?? {};
}

export function setModuleStorage(id: string, key: string, value: unknown): { ok: true } | { ok: false; error: string } {
  if (!modules.has(id)) return { ok: false, error: 'No such module.' };
  const s = getModuleStorage(id);
  if (value === undefined || value === null) delete s[key];
  else s[key] = value;
  if (JSON.stringify(s).length > LIMITS.storageBytes) return { ok: false, error: 'This module’s saved data is full.' };
  writeJson(path.join(modDir(id), 'storage.json'), s);
  for (const fn of storageListeners) fn(id, s);
  return { ok: true };
}

/** Reset a module's data (I5). */
export function resetModuleStorage(id: string): void {
  fs.rmSync(path.join(modDir(id), 'storage.json'), { force: true });
  for (const fn of storageListeners) fn(id, {});
}

// ---------------------------------------------------------------------------------------------
// Questions the AI asks with buttons (G2)

const questionWaiters = new Map<string, (answer: string | null) => void>();

export function askQuestion(question: string, choices: string[]): ModuleQuestion {
  const q: ModuleQuestion = { id: randomBytes(5).toString('hex'), question: question.slice(0, 300), choices: choices.slice(0, 6).map((c) => c.slice(0, 80)), at: Date.now(), answer: null };
  questions.push(q);
  if (questions.length > 20) questions.shift();
  changed();
  return q;
}

export function answerQuestion(id: string, answer: string): void {
  const q = questions.find((x) => x.id === id);
  if (!q || q.answer !== null) return;
  q.answer = answer.slice(0, 300);
  questionWaiters.get(id)?.(q.answer);
  changed();
}

export function getQuestion(id: string): ModuleQuestion | null {
  return questions.find((q) => q.id === id) ?? null;
}

export function waitForAnswer(id: string, seconds: number): Promise<string | null> {
  const q = getQuestion(id);
  if (!q) return Promise.resolve(null);
  if (q.answer !== null) return Promise.resolve(q.answer);
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      questionWaiters.delete(id);
      resolve(null);
    }, seconds * 1000);
    questionWaiters.set(id, (a) => {
      clearTimeout(t);
      questionWaiters.delete(id);
      resolve(a);
    });
  });
}

// ---------------------------------------------------------------------------------------------
// Sharing (M-Q15, H1, H2, H6), import with a look first (M-Q16), backups (I3)

function packModule(m: StoredModule, locked: boolean): SharedModuleFile {
  const assets: Record<string, string> = {};
  const used = new Set(imageSources(m.doc));
  for (const a of listAssets(m.doc.id)) {
    if (!used.has(a.name)) continue;
    try {
      assets[a.name] = fs.readFileSync(path.join(modDir(m.doc.id), 'assets', a.name)).toString('base64');
    } catch {
      /* skip */
    }
  }
  return {
    kind: 'shotcaller-module',
    format: MODULE_FORMAT,
    doc: { ...m.doc, ...(locked ? { locked: true } : {}) },
    author: m.doc.author,
    sharedVersion: m.version,
    assets,
  };
}

const encode = (v: unknown) => SHARE_PREFIX + zlib.gzipSync(Buffer.from(JSON.stringify(v))).toString('base64url');

export function shareCode(id: string, locked: boolean): { ok: true; code: string } | { ok: false; error: string } {
  const m = modules.get(id);
  if (!m) return { ok: false, error: 'No such module.' };
  if (m.doc.locked) return { ok: false, error: 'This module was shared with you locked, so it can’t be shared on.' };
  return { ok: true, code: encode(packModule(m, locked)) };
}

export async function shareFile(id: string, locked: boolean, parent: BrowserWindow | null): Promise<{ ok: boolean; error?: string }> {
  const c = shareCode(id, locked);
  if (!c.ok) return c;
  const opts = { title: 'Save module', defaultPath: `${id}.scmod`, filters: [{ name: 'ShotCaller module', extensions: ['scmod'] }] };
  const r = parent ? await dialog.showSaveDialog(parent, opts) : await dialog.showSaveDialog(opts);
  if (r.canceled || !r.filePath) return { ok: false };
  fs.writeFileSync(r.filePath, c.code, 'utf8');
  return { ok: true };
}

function decode(text: string): unknown {
  const t = text.trim();
  if (t.startsWith(SHARE_PREFIX)) return JSON.parse(zlib.gunzipSync(Buffer.from(t.slice(SHARE_PREFIX.length), 'base64url'), { maxOutputLength: 40_000_000 }).toString('utf8'));
  return JSON.parse(t);
}

/** Reads a share code or file and says what it would install, without installing. */
export function previewImport(text: string): ImportPreview | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = decode(text);
  } catch {
    return { ok: false, error: 'That isn’t a ShotCaller module code or file.' };
  }
  const f = raw as Partial<SharedModuleFile> & { kind?: string; modules?: unknown };
  if ((f?.kind as string) === 'shotcaller-modules-backup') return { ok: false, error: 'That’s a backup of all modules: use "Restore a backup" instead.' };
  if (f?.kind !== 'shotcaller-module' || !f.doc) return { ok: false, error: 'That isn’t a ShotCaller module code or file.' };
  const doc = normalizeDoc(f.doc);
  const assets = Object.entries(f.assets ?? {}).map(([name, b64]) => ({ name, bytes: Math.floor((String(b64).length * 3) / 4) }));
  const existing = modules.get(doc.id);
  const token = randomBytes(6).toString('hex');
  pendingImports.set(token, { kind: 'shotcaller-module', format: MODULE_FORMAT, doc, author: String(f.author ?? doc.author), sharedVersion: Number(f.sharedVersion) || 1, assets: f.assets ?? {} });
  return {
    ok: true,
    doc,
    author: String(f.author ?? doc.author),
    sharedVersion: Number(f.sharedVersion) || 1,
    assets,
    existing: existing ? { version: existing.version, sharedVersion: existing.shared?.sharedVersion ?? null, name: existing.doc.name } : null,
    token,
  };
}

export async function pickImportFile(parent: BrowserWindow | null): Promise<string | null> {
  const opts = { title: 'Open a module', properties: ['openFile' as const], filters: [{ name: 'ShotCaller module', extensions: ['scmod', 'json'] }] };
  const r = parent ? await dialog.showOpenDialog(parent, opts) : await dialog.showOpenDialog(opts);
  if (r.canceled || !r.filePaths[0]) return null;
  try {
    return fs.readFileSync(r.filePaths[0], 'utf8');
  } catch {
    return null;
  }
}

/** Installs a looked-at import. An existing module with the same id is updated, keeping the player's data (H1). */
export function installImport(token: string, asCopy: boolean): { ok: true; id: string } | { ok: false; error: string } {
  const f = pendingImports.get(token);
  if (!f) return { ok: false, error: 'Look at it again first.' };
  pendingImports.delete(token);
  const doc = normalizeDoc(f.doc);
  const id = asCopy || !modules.has(doc.id) ? freeId(doc.id) : doc.id;
  const problems = checkModule({ ...doc, id }, new Set(Object.keys(f.assets))).filter((p) => p.level === 'error');
  if (problems.length) return { ok: false, error: `It has mistakes: ${problems[0].where}: ${problems[0].message}` };
  for (const [name, b64] of Object.entries(f.assets)) {
    const r = saveAsset(id, name, Buffer.from(b64, 'base64'));
    if (!r.ok) return { ok: false, error: `Picture ${name}: ${r.error}` };
  }
  const update = modules.has(id);
  const m = commit(id, { ...doc, id }, update ? `Updated from ${f.author}'s share (their version ${f.sharedVersion})` : `Added from ${f.author}'s share`, 'import');
  m.shared = { author: f.author, sharedVersion: f.sharedVersion };
  saveModule(m);
  changed();
  return { ok: true, id };
}

export async function backupAll(parent: BrowserWindow | null): Promise<{ ok: boolean; error?: string; count?: number }> {
  const list = [...modules.values()].map((m) => ({ ...packModule(m, false), doc: m.doc, storage: getModuleStorage(m.doc.id), enabled: m.enabled }));
  const opts = { title: 'Back up all modules', defaultPath: `shotcaller-modules-${new Date().toISOString().slice(0, 10)}.scbackup`, filters: [{ name: 'ShotCaller modules backup', extensions: ['scbackup'] }] };
  const r = parent ? await dialog.showSaveDialog(parent, opts) : await dialog.showSaveDialog(opts);
  if (r.canceled || !r.filePath) return { ok: false };
  fs.writeFileSync(r.filePath, encode({ kind: 'shotcaller-modules-backup', at: Date.now(), modules: list }), 'utf8');
  return { ok: true, count: list.length };
}

export async function restoreBackup(parent: BrowserWindow | null): Promise<{ ok: boolean; error?: string; count?: number }> {
  const opts = { title: 'Restore a backup', properties: ['openFile' as const], filters: [{ name: 'ShotCaller modules backup', extensions: ['scbackup'] }] };
  const r = parent ? await dialog.showOpenDialog(parent, opts) : await dialog.showOpenDialog(opts);
  if (r.canceled || !r.filePaths[0]) return { ok: false };
  let raw: { kind?: string; modules?: (SharedModuleFile & { storage?: Record<string, unknown>; enabled?: boolean })[] };
  try {
    raw = decode(fs.readFileSync(r.filePaths[0], 'utf8')) as typeof raw;
  } catch {
    return { ok: false, error: 'That isn’t a ShotCaller modules backup.' };
  }
  if (raw?.kind !== 'shotcaller-modules-backup' || !Array.isArray(raw.modules)) return { ok: false, error: 'That isn’t a ShotCaller modules backup.' };
  let count = 0;
  for (const f of raw.modules) {
    const doc = normalizeDoc(f.doc);
    for (const [name, b64] of Object.entries(f.assets ?? {})) saveAsset(doc.id, name, Buffer.from(b64, 'base64'));
    const m = commit(doc.id, doc, 'Restored from a backup', 'import');
    m.enabled = f.enabled !== false;
    saveModule(m);
    if (f.storage) writeJson(path.join(modDir(doc.id), 'storage.json'), f.storage);
    count++;
  }
  changed();
  return { ok: true, count };
}

/** Plain list of what changed, for the AI's answer and the review. */
export function describeProposal(p: ModuleProposal): string[] {
  const before = p.kind === 'create' ? null : (modules.get(p.moduleId)?.doc ?? null);
  return diffModules(before, p.doc).map((c) => `${c.kind}: ${c.label}`);
}

export { EMPTY_MODULES };
