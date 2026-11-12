import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { ExtraStoreId } from '../../shared/types';

/**
 * Shared shape for the smaller stores in the More section (Phase L2). Each store reader returns
 * its installed games with what starts them (a store link, or the store's own program with
 * arguments). Play always goes through the store when it has a launcher.
 */

export interface ExtraGame {
  store: ExtraStoreId;
  /** The store's own id for the game. */
  id: string;
  name: string;
  installDir: string;
  exeNames: string[];
  /** What Play opens: a link (target) or a program with arguments (exe). */
  launch: { target?: string; exe?: string; args?: string[] };
  cover?: string;
  sizeBytes?: number;
}

export interface ExtraStoreResult {
  found: boolean;
  /** The store's program or data folder. */
  path?: string;
  games: ExtraGame[];
  /** Opens the store app (Open in store). */
  openTarget?: { target?: string; exe?: string };
  note?: string;
}

export const exists = (p: string | undefined | null): p is string => {
  if (!p) return false;
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
};

/** Reads a small SQLite file without changing it; null when it can't. */
export function readSqlite<T>(file: string, sql: string): T[] | null {
  if (!exists(file)) return null;
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    return db.prepare(sql).all() as T[];
  } catch (err) {
    console.error('Could not read', file, err);
    return null;
  } finally {
    db?.close();
  }
}

export const cleanTitle = (s: string) => s.replace(/[®™©]/g, '').replace(/\s+/g, ' ').trim();

/** Splits launch options like a shell would (quotes keep spaces). */
export function splitArgs(s: string | undefined | null): string[] {
  if (!s) return [];
  return [...s.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);
}
