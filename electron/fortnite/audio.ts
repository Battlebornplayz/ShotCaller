import { app, desktopCapturer, ipcMain, session, type BrowserWindow } from 'electron';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { IPC } from '../../shared/ipc';
import type { FnAudioStatus } from '../../shared/fortnite';
import { createFortniteAudioWindow } from '../windows';

/**
 * Game audio, for chests you break open (they show nothing on screen). A hidden window listens to what the PC is
 * playing (Windows loopback: everything you hear, not the microphone), turned into 16 kHz mono and sent here in
 * small pieces. Only the last few seconds are kept, in memory. With the recorder on, short clips are saved to
 * userData/fortnite/shots so the chest sound can be learned and a reader scored:
 *   open-<time>.wav   a chest the screen reader counted (the popup), so the sound of a chest opening
 *   broke-<time>.wav  the +1 chest key: a chest you broke open
 *   bg-<time>.wav     ordinary play, with no chest (to check the reader stays quiet)
 * Each clip is 6 s before the moment and 3 s after. Local only; nothing is sent anywhere.
 */

export const AUDIO_RATE = 16000;
const KEEP_S = 8;
const BEFORE_S = 6;
const AFTER_S = 3;
const CAPS = { open: 60, broke: 60, bg: 80 } as const;
type ClipKind = keyof typeof CAPS;

const ring = new Int16Array(AUDIO_RATE * KEEP_S);
let ringAt = 0;
let total = 0;
let win: BrowserWindow | null = null;
let ready = false;
const status: FnAudioStatus = { on: false, hearing: false, level: 0, error: null, clips: { open: 0, broke: 0, bg: 0 } };
let lastChunkAt = 0;
const pending: { name: string; kind: ClipKind; dueTotal: number }[] = [];
const listeners = new Set<() => void>();

const shotsDir = () => path.join(app.getPath('userData'), 'fortnite', 'shots');

export function getFortniteAudio(): FnAudioStatus {
  status.hearing = status.on && Date.now() - lastChunkAt < 2000;
  return status;
}

export function onFortniteAudio(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The last `seconds` of sound, oldest first. */
function tail(samples: number): Int16Array {
  const n = Math.min(samples, total, ring.length);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) out[i] = ring[(ringAt - n + i + ring.length) % ring.length];
  return out;
}

function wav(pcm: Int16Array): Buffer {
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + pcm.length * 2, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(AUDIO_RATE, 24);
  head.writeUInt32LE(AUDIO_RATE * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(pcm.length * 2, 40);
  return Buffer.concat([head, Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)]);
}

function onChunk(data: unknown): void {
  if (!(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data)) return;
  const pcm = data instanceof ArrayBuffer ? new Int16Array(data) : new Int16Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 2));
  if (!pcm.length || pcm.length > AUDIO_RATE * 2) return;
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) {
    ring[ringAt] = pcm[i];
    ringAt = (ringAt + 1) % ring.length;
    sum += pcm[i] * pcm[i];
  }
  total += pcm.length;
  lastChunkAt = Date.now();
  status.level = Math.round((Math.sqrt(sum / pcm.length) / 32768) * 1000) / 1000;
  status.error = null;
  // Clips whose "after" part has now been heard.
  while (pending.length && total >= pending[0].dueTotal) {
    const clip = pending.shift()!;
    const pcmClip = tail((BEFORE_S + AFTER_S) * AUDIO_RATE);
    void fsp
      .mkdir(shotsDir(), { recursive: true })
      .then(() => fsp.writeFile(path.join(shotsDir(), clip.name), wav(pcmClip)))
      .catch(() => undefined);
  }
}

/** Saves the sound around this moment (recorder on, audio heard, under the cap for its kind). */
export function saveAudioClip(kind: ClipKind): void {
  if (!status.on || Date.now() - lastChunkAt > 2000 || status.clips[kind] >= CAPS[kind]) return;
  status.clips[kind]++;
  pending.push({ name: `${kind}-${Date.now()}.wav`, kind, dueTotal: total + AFTER_S * AUDIO_RATE });
  for (const fn of listeners) fn();
}

/** Listening runs while Fortnite is running and the recorder is on. */
export function setFortniteAudioRunning(on: boolean): void {
  if (on === status.on) return;
  status.on = on;
  if (on) {
    void fsp
      .readdir(shotsDir())
      .then((names) => {
        for (const k of Object.keys(CAPS) as ClipKind[]) status.clips[k] = names.filter((n) => n.startsWith(`${k}-`) && n.endsWith('.wav')).length;
      })
      .catch(() => undefined);
    win = createFortniteAudioWindow();
    const mine = win;
    // Started from here as a "user action", which listening to the PC's sound needs.
    mine.webContents.once('did-finish-load', () => void mine.webContents.executeJavaScript('new Promise((done) => { const t = setInterval(() => { if (window.__fnAudioStart) { clearInterval(t); window.__fnAudioStart(); done(true); } }, 100); })', true).catch(() => undefined));
    mine.on('closed', () => {
      if (win === mine) win = null;
    });
  } else {
    win?.destroy();
    win = null;
    pending.length = 0;
    status.level = 0;
  }
  for (const fn of listeners) fn();
}

export function initFortniteAudio(): void {
  if (ready) return;
  ready = true;
  // Only the hidden audio window may ask, and it only gets the sound (the picture track is dropped at once).
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    if (!win || request.frame?.top !== win.webContents.mainFrame) return callback({});
    desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } }).then(
      (sources) => callback(sources[0] ? { video: sources[0], audio: 'loopback' } : {}),
      () => callback({}),
    );
  });
  ipcMain.on(IPC.fortniteAudioChunk, (e, data: unknown) => {
    if (win && e.sender === win.webContents) onChunk(data);
  });
  ipcMain.on(IPC.fortniteAudioError, (e, message: unknown) => {
    if (!win || e.sender !== win.webContents) return;
    status.error = String(message).slice(0, 200);
    for (const fn of listeners) fn();
  });
}
