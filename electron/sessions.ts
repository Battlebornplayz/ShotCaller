import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { RunningGame, Session } from '../shared/types';

/**
 * Play sessions, recorded from game detection (start → stop). Stored locally in sessions.json,
 * shaped to sync later (users/{uid}/sessions).
 */

const MIN_SESSION_MS = 60 * 1000;
const MAX_PER_GAME = 500;

let store: Record<string, Session[]> | null = null;
const open = new Map<string, number>();

function file(): string {
  return path.join(app.getPath('userData'), 'sessions.json');
}

function load(): Record<string, Session[]> {
  if (store) return store;
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8')) as Record<string, unknown>;
    store = {};
    for (const [k, v] of Object.entries(raw)) {
      if (!Array.isArray(v)) continue;
      store[k] = v.filter((s): s is Session => s && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end >= s.start);
    }
  } catch {
    store = {};
  }
  return store;
}

function save(): void {
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(load()), 'utf8');
  } catch (err) {
    console.error('Could not save sessions:', err);
  }
}

export function sessionStarted(rg: RunningGame): void {
  open.set(rg.key, rg.since);
}

export function sessionStopped(rg: RunningGame): void {
  const start = open.get(rg.key) ?? rg.since;
  open.delete(rg.key);
  const end = Date.now();
  if (end - start < MIN_SESSION_MS) return;
  const s = load();
  const list = (s[rg.key] ??= []);
  list.push({ start, end });
  if (list.length > MAX_PER_GAME) list.splice(0, list.length - MAX_PER_GAME);
  save();
}

/** Close any running sessions (app quitting). */
export function flushSessions(): void {
  const now = Date.now();
  const s = load();
  let changed = false;
  for (const [key, start] of open) {
    if (now - start >= MIN_SESSION_MS) {
      (s[key] ??= []).push({ start, end: now });
      changed = true;
    }
  }
  open.clear();
  if (changed) save();
}

/** Newest first, including the one in progress. */
export function getSessions(key: string): Session[] {
  const list = [...(load()[key] ?? [])];
  const running = open.get(key);
  if (running) list.push({ start: running, end: Date.now() });
  return list.sort((a, b) => b.start - a.start);
}

export function totalMinutes(key: string): number {
  return Math.round(getSessions(key).reduce((n, s) => n + (s.end - s.start), 0) / 60000);
}
