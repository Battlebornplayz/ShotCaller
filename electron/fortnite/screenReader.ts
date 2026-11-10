import { app, nativeImage, shell } from 'electron';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fortnite } from '../../games/fortnite';
import chestLabel from '../../games/fortnite/chestLabel.json';
import chestWords from '../../games/fortnite/chestWords.json';
import type { FnScreenMode, FnScreenPreview, FnScreenStatus } from '../../shared/fortnite';
import hudGlyphs from '../../games/fortnite/hudGlyphs.json';
import {
  ChestPopupCounter,
  chestArea,
  hudArea,
  readChestLines,
  readHud,
  SteadyNumber,
  toGreyHalf,
  type Box,
  type ChestWords,
  type GreyTemplate,
  type HudGlyphs,
} from '../../shared/fortniteVision';
import { captureScreen, foregroundGameArea, type WindowArea } from '../skillshot/screenCapture';
import { getSettings } from '../settings';
import { pinChest, readLiveMap } from './liveMap';
import { readHotbar } from './squad';
import { addChest, busHasLeft, inFortniteMatch, setEliminations, setPlayersLeftAlive, setTimeAlive } from './tracker';

/**
 * Reads Fortnite's screen while it's the window in front and a match is on: a copy of a small area right of
 * centre, 4 times a second, offline. Never touches the game. Optionally (off by default) saves screenshots
 * to userData/fortnite/shots so readers can be built and checked; local only, capped.
 */

const POLL_MS = 250;
const HEARTBEAT_FRAMES = 8;
const MAX_CHEST_READS = 200;
/** Recorder: one full screenshot this often during a match, up to the cap. */
const SHOT_EVERY_MS = 10_000;
const SHOT_CAP = 600;
const CHEST_SAMPLE_CAP = 100;

const template = chestLabel as GreyTemplate;
const words = chestWords as ChestWords;
let timer: NodeJS.Timeout | null = null;
let enabled = true;
let recorderOn = false;
let counter = new ChestPopupCounter();
const glyphs = hudGlyphs as unknown as HudGlyphs;
/** Your eliminations from the number next to the skull: settles after two equal reads, only rises. */
let elims = new SteadyNumber(true);
/** Players left, settled (it flickered 41/42 once), only taken while you're alive: it gives solo placement. */
let playersLeft = new SteadyNumber(false);
/** Alive or down as last seen (kept while the map or a menu hides the HUD), and time alive since the bus. */
let lifeState: 'alive' | 'down' | null = null;
let aliveMs = 0;
let lastTickAt = 0;
let lastFrame: { pixels: Uint8Array; box: Box; match: { x: number; y: number } | null; score: number } | null = null;
let lastShotAt = 0;
let chestSamples = 0;

const status: FnScreenStatus = { mode: 'no-game', frames: 0, width: 0, height: 0, lastScore: null, eliminations: null, chests: [], recorder: { on: false, saved: 0, cap: SHOT_CAP } };
const listeners = new Set<(s: FnScreenStatus) => void>();

const shotsDir = () => path.join(app.getPath('userData'), 'fortnite', 'shots');

export function getFortniteScreen(): FnScreenStatus {
  return status;
}

export function onFortniteScreen(fn: (s: FnScreenStatus) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function pushStatus(): void {
  for (const fn of listeners) fn(status);
}

function setMode(mode: FnScreenMode): void {
  if (status.mode === mode) return;
  status.mode = mode;
  pushStatus();
}

/** Screen copies have no meaningful alpha: make every pixel solid before turning them into an image. */
function toImage(pixels: Uint8Array, width: number, height: number): Electron.NativeImage {
  const opaque = Buffer.from(pixels);
  for (let i = 3; i < opaque.length; i += 4) opaque[i] = 255;
  return nativeImage.createFromBitmap(opaque, { width, height });
}

async function countShots(): Promise<number> {
  try {
    return (await fsp.readdir(shotsDir())).filter((n) => n.startsWith('shot-')).length;
  } catch {
    return 0;
  }
}

function save(name: string, data: Buffer): void {
  void fsp
    .mkdir(shotsDir(), { recursive: true })
    .then(() => fsp.writeFile(path.join(shotsDir(), name), data))
    .catch(() => undefined);
}

function recordShot(area: WindowArea): void {
  if (!recorderOn || status.recorder.saved >= SHOT_CAP || Date.now() - lastShotAt < SHOT_EVERY_MS) return;
  const pixels = captureScreen(area);
  if (!pixels) return;
  lastShotAt = Date.now();
  status.recorder.saved++;
  save(`shot-${lastShotAt}.jpg`, toImage(pixels, area.width, area.height).toJPEG(85));
}

/** The top-right stack: the number next to the skull. Skipped while it isn't showing (down, spectating). */
function readEliminations(area: WindowArea): void {
  const box = hudArea(area.width, area.height);
  const pixels = captureScreen({ x: area.x + box.x, y: area.y + box.y, width: box.width, height: box.height });
  if (!pixels) return;
  const hud = readHud(pixels, box.width, box.height, glyphs);
  if (hud.state) lifeState = hud.state;
  if (hud.state === 'alive') {
    const left = playersLeft.update(hud.playersLeft);
    if (left !== undefined) setPlayersLeftAlive(left);
  }
  const next = elims.update(hud.eliminations);
  if (next !== undefined) {
    status.eliminations = next;
    setEliminations(next);
    pushStatus();
  }
}

/** Adds the time since the last tick while alive, from the bus on. Runs even when Fortnite isn't in front. */
function countAlive(): void {
  const now = Date.now();
  const dt = lastTickAt ? Math.min(now - lastTickAt, 2000) : 0;
  lastTickAt = now;
  if (lifeState === 'alive' && busHasLeft()) {
    aliveMs += dt;
    setTimeAlive(aliveMs);
  }
}

function tick(): void {
  if (!inFortniteMatch()) {
    counter.reset();
    elims.reset();
    playersLeft.reset();
    status.eliminations = null;
    lifeState = null;
    aliveMs = 0;
    lastTickAt = 0;
    return setMode('lobby');
  }
  countAlive();
  const area = foregroundGameArea(fortnite.exeNames);
  if (!area) return setMode('not-front');
  status.width = area.width;
  status.height = area.height;
  const box = chestArea(area.width, area.height);
  const pixels = captureScreen({ x: area.x + box.x, y: area.y + box.y, width: box.width, height: box.height });
  if (!pixels) return setMode('no-picture');
  const half = toGreyHalf(pixels, box.width, box.height);
  const lines = readChestLines(half.grey, half.width, half.height, template, words);
  const top = lines.reduce<(typeof lines)[number] | null>((b, l) => (!b || l.score > b.score ? l : b), null);
  const score = top ? Math.round(top.score * 100) / 100 : 0;
  status.lastScore = score;
  lastFrame = { pixels, box, match: top ? { x: top.x * 2, y: top.y * 2 } : null, score };

  const found = counter.update(lines, Date.now());
  if (found.length) {
    for (const kind of found) {
      addChest(kind);
      pinChest(kind);
      status.chests.push({ at: Date.now(), score, kind });
    }
    while (status.chests.length > MAX_CHEST_READS) status.chests.shift();
    if (recorderOn && chestSamples++ < CHEST_SAMPLE_CAP) save(`chest-${Date.now()}.png`, toImage(pixels, box.width, box.height).toPNG());
    pushStatus();
  }
  readEliminations(area);
  readLiveMap(area, lifeState, getSettings().fortnite.liveMap);
  if (lifeState !== 'down') readHotbar(area);
  recordShot(area);
  setMode('watching');
  if (++status.frames % HEARTBEAT_FRAMES === 0) pushStatus();
}

/** The latest picture the reader looked at, for the Screen check page. Only encoded when asked for. */
export function getFortniteScreenPreview(): FnScreenPreview | null {
  if (!timer || !lastFrame) return null;
  const { pixels, box, match, score } = lastFrame;
  const tw = template.width * 2;
  const th = template.height * 2;
  return {
    image: toImage(pixels, box.width, box.height).toDataURL(),
    aspect: box.width / box.height,
    match: match ? { x: match.x / box.width, y: match.y / box.height, width: tw / box.width, height: th / box.height } : null,
    score,
  };
}

/** The +1 hotkey: a chest the screen can't see (one you broke open). Listed on the Screen check page too. */
export function addManualChest(): void {
  if (!addChest('manual')) return;
  pinChest('manual');
  status.chests.push({ at: Date.now(), score: 1, kind: 'manual' });
  while (status.chests.length > MAX_CHEST_READS) status.chests.shift();
  pushStatus();
}

export async function openFortniteShots(): Promise<void> {
  await fsp.mkdir(shotsDir(), { recursive: true }).catch(() => undefined);
  await shell.openPath(shotsDir());
}

/** Runs while Fortnite is running and the reader is switched on. */
export function setFortniteReaderRunning(playing: boolean, on: boolean, recorder: boolean): void {
  enabled = on;
  recorderOn = recorder;
  status.recorder.on = recorder;
  const want = playing && enabled;
  if (want !== !!timer) {
    if (want) {
      counter = new ChestPopupCounter();
      elims = new SteadyNumber(true);
      playersLeft = new SteadyNumber(false);
      status.frames = 0;
      void countShots().then((n) => {
        status.recorder.saved = n;
        pushStatus();
      });
      timer = setInterval(() => {
        try {
          tick();
        } catch (err) {
          console.warn('[fortnite] screen read failed:', err);
        }
      }, POLL_MS);
    } else {
      clearInterval(timer!);
      timer = null;
      lastFrame = null;
    }
  }
  if (!want) setMode(enabled ? 'no-game' : 'off');
  pushStatus();
}
