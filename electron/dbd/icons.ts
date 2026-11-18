import { app, net, protocol } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { USER_AGENT, WIKI } from './wiki';

/**
 * DbD icons (perks, add-ons, portraits...) are kept on this PC: the hub asks for scdbd://icon/<file>, and the
 * first time a file is wanted it's downloaded from the wiki (two at a time, so the wiki isn't hammered) and saved
 * in userData/dbd/icons. After that it loads from disk, offline too.
 */

export const DBD_SCHEME = 'scdbd';
const PREFIX = `${WIKI}/images/`;
const iconDir = () => path.join(app.getPath('userData'), 'dbd', 'icons');

/**
 * Must run before the app is ready. Electron takes one list of special schemes, so AI modules' pictures (scmod:,
 * Phase M1) are registered here too.
 */
export function registerDbdScheme(): void {
  const privileges = { standard: true, secure: true, supportFetchAPI: true, stream: true };
  protocol.registerSchemesAsPrivileged([
    { scheme: DBD_SCHEME, privileges },
    { scheme: 'scmod', privileges },
  ]);
}

const missing = new Set<string>();
const waiting = new Map<string, Promise<Buffer | null>>();
const queue: (() => void)[] = [];
let active = 0;
let saved = -1;

function slot<T>(job: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      active++;
      job()
        .then(resolve, reject)
        .finally(() => {
          active--;
          queue.shift()?.();
        });
    };
    if (active < 2) run();
    else queue.push(run);
  });
}

/** Only plain file names (letters, digits, _ - . %). */
const safeName = (f: string) => /^[\w.%()'!-]{1,160}$/.test(f) && !f.includes('..');

async function download(file: string): Promise<Buffer | null> {
  const res = await net.fetch(PREFIX + encodeURIComponent(decodeURIComponent(file)), { headers: { 'User-Agent': USER_AGENT } });
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.startsWith('image/')) {
    if (res.status === 404) missing.add(file);
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.promises.mkdir(iconDir(), { recursive: true });
  await fs.promises.writeFile(path.join(iconDir(), file), buf);
  if (saved >= 0) saved++;
  return buf;
}

function typeOf(file: string): string {
  return /\.jpe?g$/i.test(file) ? 'image/jpeg' : /\.webp$/i.test(file) ? 'image/webp' : 'image/png';
}

export function initDbdIcons(): void {
  protocol.handle(DBD_SCHEME, async (req) => {
    const url = new URL(req.url);
    const file = url.pathname.replace(/^\/+/, '');
    if (url.hostname !== 'icon' || !safeName(file) || missing.has(file)) return new Response(null, { status: 404 });
    const local = path.join(iconDir(), file);
    try {
      return new Response(new Uint8Array(await fs.promises.readFile(local)), { headers: { 'Content-Type': typeOf(file), 'Cache-Control': 'max-age=31536000' } });
    } catch {
      // Not saved yet.
    }
    let p = waiting.get(file);
    if (!p) {
      p = slot(() => download(file)).catch(() => null);
      waiting.set(file, p);
      void p.finally(() => waiting.delete(file));
    }
    const buf = await p;
    return buf ? new Response(new Uint8Array(buf), { headers: { 'Content-Type': typeOf(file) } }) : new Response(null, { status: 404 });
  });
}

/** How many icons are saved on this PC. */
export function savedIconCount(): number {
  if (saved < 0) {
    try {
      saved = fs.readdirSync(iconDir()).length;
    } catch {
      saved = 0;
    }
  }
  return saved;
}

/** The hub's address for a wiki image address (null stays null). */
export function localIcon(wikiUrl: string | null): string | null {
  if (!wikiUrl?.startsWith(PREFIX)) return null;
  return `${DBD_SCHEME}://icon/${wikiUrl.slice(PREFIX.length)}`;
}
