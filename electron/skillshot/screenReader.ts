import { app, nativeImage } from 'electron';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { skillshotCity } from '../../games/skillshot-city';
import type { ScreenPreview, ScreenRead, ScreenReadMode, ScreenReadStatus } from '../../shared/skillshot';
import {
  BUILD_TEMPLATE_SIZE,
  checkAgainstLog,
  draftGeometry,
  isBlank,
  makeTemplate,
  OFFER_TEMPLATE_SIZE,
  OfferTracker,
  pickFromBuildRow,
  readOffers,
  readRarity,
  toGray,
  type Box,
  type IconTemplate,
} from '../../shared/skillshotVision';
import { captureScreen, foregroundGameArea, type WindowArea } from './screenCapture';
import { endScreenOffer, getSkillshotData, getSkillshotState, noteScreenRarity, onLoggedDraft, pickOffer, resetScreenState, setOffer } from './tracker';

/**
 * Reads the 2 offered skills off the screen while the game is the window in front. Works from a copy of a
 * small strip at the top of the picture, offline, and never touches the game. When the panels close it works
 * out what you picked from your build row, or from a click on a card. The log still has the final say: it
 * corrects anything read wrongly when it's written, up to about 2.5 minutes later, and marks each read right
 * or wrong for the Screen check page.
 */

const POLL_MS = 400;
/** Polls to wait for your pick to show up in the build row. */
const PICK_POLLS = 6;
/** A click counts toward a pick for this long. */
const CLICK_MS = 4000;
const MAX_SAMPLES = 200;
const MAX_UNSURE = 20;
const UNSURE_GAP_MS = 5000;
/** Status goes out on every change, and this often anyway so you can see it's alive. */
const HEARTBEAT_FRAMES = 6;
const MAX_READS = 100;

let timer: NodeJS.Timeout | null = null;
const offerTemplates: IconTemplate[] = [];
let rowTemplates = new Map<string, IconTemplate>();
let offerTracker = new OfferTracker();
let lastArea: WindowArea | null = null;
let lastFrame: { pixels: Uint8Array; box: Box } | null = null;
let offered: string[] = [];
let click: { index: number; at: number } | null = null;
/** An offer that just closed and whose pick isn't known yet. */
let settling: { ids: string[]; polls: number } | null = null;
/** Per open card: the rarity on the last look, and whether it's been settled for this offer. */
let cardRarity: { last: number | null; done: boolean }[] = [];
let samples = 0;
let unsure = 0;
let lastUnsureAt = 0;

let enabled = true;
let startedAt = 0;
let nextReadId = 1;
const status: ScreenReadStatus = { mode: 'no-game', frames: 0, width: 0, height: 0, reads: [] };
const listeners = new Set<(s: ScreenReadStatus) => void>();

const visionDir = () => path.join(app.getPath('userData'), 'skillshot', 'vision');

export function getScreenStatus(): ScreenReadStatus {
  return status;
}

export function onScreenStatus(fn: (s: ScreenReadStatus) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function pushStatus(): void {
  for (const fn of listeners) fn(status);
}

function setMode(mode: ScreenReadMode): void {
  if (status.mode === mode) return;
  status.mode = mode;
  pushStatus();
}

/** Each read keeps the exact array it was made with, so this finds that one read. */
const currentRead = (ids: string[]): ScreenRead | undefined => status.reads.find((r) => r.offers === ids);

function loadTemplates(): boolean {
  if (offerTemplates.length) return true;
  const skills = getSkillshotData()?.skills.filter((s) => s.icon) ?? [];
  if (!skills.length) return false;
  rowTemplates = new Map();
  for (const s of skills) {
    const img = nativeImage.createFromDataURL(s.icon!);
    const { width, height } = img.getSize();
    const px = new Uint8Array(img.toBitmap());
    offerTemplates.push(makeTemplate(s.id, px, width, height, OFFER_TEMPLATE_SIZE));
    rowTemplates.set(s.id, makeTemplate(s.id, px, width, height, BUILD_TEMPLATE_SIZE));
  }
  return true;
}

/** Keeps a record of what was read, so it can be checked later and the layout re-measured. */
function note(entry: Record<string, unknown>): void {
  void fsp
    .mkdir(visionDir(), { recursive: true })
    .then(() => fsp.appendFile(path.join(visionDir(), 'reads.jsonl'), JSON.stringify({ at: Date.now(), ...entry }) + '\n'))
    .catch(() => undefined);
}

/** Screen copies have no meaningful alpha, so make every pixel solid before turning them into an image. */
function toImage(pixels: Uint8Array, box: Box): Electron.NativeImage {
  const opaque = Buffer.from(pixels);
  for (let i = 3; i < opaque.length; i += 4) opaque[i] = 255;
  return nativeImage.createFromBitmap(opaque, { width: box.width, height: box.height });
}

function saveSample(pixels: Uint8Array, box: Box, name: string): void {
  const png = toImage(pixels, box).toPNG();
  void fsp
    .mkdir(visionDir(), { recursive: true })
    .then(() => fsp.writeFile(path.join(visionDir(), `${name}-${Date.now()}.png`), png))
    .catch(() => undefined);
}

function clickedId(ids: string[]): string | null {
  if (!click || Date.now() - click.at > CLICK_MS) return null;
  return ids[click.index] ?? null;
}

function pickBy(ids: string[], id: string, how: NonNullable<ScreenRead['how']>): void {
  pickOffer(id);
  const read = currentRead(ids);
  if (read && read.verdict === 'waiting') {
    read.picked = id;
    read.how = how;
  }
  note({ picked: id, how });
  pushStatus();
}

/** A new offer came up without the panels closing: a card click means the last one was picked, else it's a reroll. */
function onNewOffer(ids: string[], scores: number[], pixels: Uint8Array, box: Box): void {
  const previous = settling?.ids ?? offered;
  if (previous.length) {
    const id = clickedId(previous);
    if (id) pickBy(previous, id, 'click');
    else {
      const read = currentRead(previous);
      if (read?.verdict === 'waiting' && !read.picked) read.verdict = 'rerolled';
    }
  }
  click = null;
  settling = null;
  offered = ids;
  cardRarity = ids.map(() => ({ last: null, done: false }));
  setOffer(ids, 'screen');
  const rounded = scores.map((s) => Math.round(s * 100) / 100);
  status.reads.push({ id: nextReadId++, at: Date.now(), offers: ids, scores: rounded, picked: null, how: null, verdict: 'waiting' });
  if (status.reads.length > MAX_READS) status.reads.shift();
  note({ offer: ids, scores: rounded });
  if (samples++ < MAX_SAMPLES) saveSample(pixels, box, 'offer');
}

/**
 * Reads the rarity on each open card. A rarity counts after the same answer twice in a row, so a card fading in
 * or a cursor passing over it can't save a wrong one. Each offer settles once, right after it appears.
 */
function readCardRarities(pixels: Uint8Array, width: number, geo: ReturnType<typeof draftGeometry>): void {
  offered.forEach((id, i) => {
    const card = cardRarity[i];
    if (!card || card.done) return;
    const rarity = readRarity(pixels, width, geo.levelText[i]);
    if (rarity === null || rarity !== card.last) {
      card.last = rarity;
      return;
    }
    card.done = true;
    const read = currentRead(offered);
    if (read) (read.rarities ??= offered.map(() => null))[i] = rarity;
    note({ skill: id, rarity });
    noteScreenRarity(id, rarity);
    pushStatus();
  });
}

function settle(frame: ReturnType<typeof toGray>, geo: ReturnType<typeof draftGeometry>): void {
  if (!settling) return;
  const { ids } = settling;
  const owned = new Set(Object.keys(getSkillshotState().build));
  const templates = ids.map((id) => rowTemplates.get(id)).filter((t): t is IconTemplate => !!t);
  const seen = pickFromBuildRow(frame, geo, templates, owned);
  if (seen) {
    settling = null;
    return pickBy(ids, seen, 'build row');
  }
  if (++settling.polls < PICK_POLLS) return;
  settling = null;
  const clicked = clickedId(ids);
  if (clicked) return pickBy(ids, clicked, 'click');
  // One new skill and one you already had, and the new one never appeared: it was the upgrade.
  const have = ids.filter((id) => owned.has(id));
  if (have.length === 1) return pickBy(ids, have[0], 'not in build row');
  note({ picked: null, offer: ids }); // Two upgrades with no click: the log fills this one in.
}

function tick(): void {
  const area = foregroundGameArea(skillshotCity.exeNames);
  if (!area) return setMode('not-front'); // Keep what's showing rather than call the offer over.
  if (!loadTemplates()) return;
  lastArea = area;
  status.width = area.width;
  status.height = area.height;
  const geo = draftGeometry(area.width, area.height);
  const box = geo.capture;
  const pixels = captureScreen({ x: area.x + box.x, y: area.y + box.y, width: box.width, height: box.height });
  if (!pixels) return setMode('no-picture');
  lastFrame = { pixels, box };
  const frame = toGray(pixels, box.width, box.height);
  if (isBlank(frame)) return setMode('no-picture');
  const read = readOffers(frame, geo, offerTemplates, offered);

  if (read?.partial && unsure < MAX_UNSURE && Date.now() - lastUnsureAt > UNSURE_GAP_MS) {
    unsure++;
    lastUnsureAt = Date.now();
    saveSample(pixels, box, 'unsure');
    note({ unsure: read.scores.map((s) => Math.round(s * 100) / 100) });
  }

  const change = offerTracker.update(read && !read.partial ? read.ids : null);
  if (change) {
    onNewOffer(change, read!.scores, pixels, box);
    pushStatus();
  } else if (change === null) {
    // The panels closed. Alt+1/Alt+2 or the manual grid may already have answered it.
    if (endScreenOffer()) settling = { ids: offered, polls: 0 };
    offered = [];
  }
  readCardRarities(pixels, box.width, geo);
  settle(frame, geo);

  setMode(offered.length ? 'offer' : 'watching');
  if (++status.frames % HEARTBEAT_FRAMES === 0) pushStatus();
}

const inBox = (b: Box, x: number, y: number) => x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height;

/** A mouse press anywhere: remembered if it landed on an offered card. Nothing else about it is kept. */
export function noteMouseDown(x: number, y: number): void {
  if (!timer || !lastArea || (!offered.length && !settling)) return;
  const geo = draftGeometry(lastArea.width, lastArea.height);
  const index = geo.cards.findIndex((c) => inBox(c, x - lastArea!.x, y - lastArea!.y));
  if (index >= 0) click = { index, at: Date.now() };
}

/** The latest picture the reader looked at, for the Screen check page. Only encoded when asked for. */
export function getScreenPreview(): ScreenPreview | null {
  if (!timer || !lastFrame || !lastArea) return null;
  const { pixels, box } = lastFrame;
  const geo = draftGeometry(lastArea.width, lastArea.height);
  const frac = (b: Box) => ({ x: b.x / box.width, y: b.y / box.height, width: b.width / box.width, height: b.height / box.height });
  return {
    image: toImage(pixels, box).toDataURL(),
    aspect: box.width / box.height,
    offers: geo.offers.map(frac),
    buildRow: frac(geo.buildRow),
  };
}

export function screenReaderRunning(): boolean {
  return !!timer;
}

onLoggedDraft((d) => {
  // Older drafts in the log came from before this session, when nothing was watching.
  if (!timer || d.at < startedAt) return;
  checkAgainstLog(status.reads, d, nextReadId++);
  pushStatus();
});

export function setScreenReaderRunning(playing: boolean, on: boolean): void {
  enabled = on;
  const want = playing && enabled;
  if (want !== !!timer) {
    if (want) {
      offerTracker = new OfferTracker();
      startedAt = Date.now();
      status.frames = 0;
      timer = setInterval(() => {
        try {
          tick();
        } catch (err) {
          console.warn('[screenReader] read failed:', err);
        }
      }, POLL_MS);
    } else {
      clearInterval(timer!);
      timer = null;
      offered = [];
      settling = null;
      click = null;
      lastArea = null;
      lastFrame = null;
      resetScreenState();
    }
  }
  if (!want) setMode(enabled ? 'no-game' : 'off');
  else if (status.mode === 'off' || status.mode === 'no-game') setMode('not-front');
}
