import { app, nativeImage } from 'electron';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseHeldLabel } from '../../shared/fortniteInventory';
import { parsePlacement, parseRank } from '../../shared/fortniteScore';
import { debugCount, FRAME_H, FRAME_W, readFrame, type Field, type FrameRead } from './readers';
import textCases from './text-cases.json';

/**
 * The Fortnite test kit: runs every screen reader over saved screenshots and checks each read against the
 * answer written down for it (tests/fortnite/answers.json), then the text readers against text-cases.json.
 * Prints a score per reader against the saved baseline (tests/fortnite/baseline.json). Exit code 1 when a
 * screen reader scores lower than its baseline, or any text case misses.
 *
 *   npm run test:fortnite                       check everything
 *   npm run test:fortnite -- --verbose          also list every miss
 *   npm run test:fortnite -- --save-baseline    after making a reader better: keep the new scores
 *   npm run test:fortnite -- --record           add answers for new screenshots from what the readers see now
 *                                               (marked "checked": false until a person looks at them)
 *   npm run test:fortnite -- --frames=DIR use another screenshot folder
 *   npm run test:fortnite -- --only=chest only screenshots whose name starts with "chest"
 *   npm run test:fortnite -- --slot=elim-01.jpg:1:0   show how one slot's count is read (file:slot:held)
 *
 * Runs inside Electron (`electron out/fn-test/run.cjs`) only for nativeImage, which opens the JPEGs exactly
 * like the app does. The screenshots themselves stay out of the repo (48 MB, the user's own matches).
 */

interface Answer {
  /** True once a person has looked at the picture and agrees with every value below. */
  checked: boolean;
  note?: string;
  want: Partial<FrameRead>;
}
interface AnswerFile {
  _about: string;
  frames: Record<string, Answer>;
}

const ROOT = process.cwd();
const ANSWERS = path.join(ROOT, 'tests/fortnite/answers.json');
const args = process.argv.slice(2);
const arg = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const BASELINE = path.join(ROOT, 'tests/fortnite/baseline.json');
const RECORD = args.includes('--record');
const SAVE_BASELINE = args.includes('--save-baseline');
const VERBOSE = args.includes('--verbose');
const FRAMES = path.resolve(ROOT, arg('frames') ?? 'research_notes/fortnite/frames');
const ONLY = arg('only');

/** Small slack for numbers that come from measuring a length (bars), none for counted things. */
const SLACK: Partial<Record<Field, number>> = { 'bars.health': 2, 'bars.shield': 2 };

const out: string[] = [];
const say = (s = '') => {
  out.push(s);
  console.log(s);
};

function same(field: Field, want: unknown, got: unknown): boolean {
  if (typeof want === 'number' && typeof got === 'number') return Math.abs(want - got) <= (SLACK[field] ?? 0);
  return JSON.stringify(want) === JSON.stringify(got);
}

type Tally = Map<string, { right: number; total: number }>;

/** "rare:30" -> { empty, rarity, count }. */
function slot(s: string | undefined): { empty: boolean; rarity: string | null; count: number | null } {
  if (!s || s === '-') return { empty: true, rarity: null, count: null };
  const [r, c] = s.split(':');
  return { empty: false, rarity: r === '?' ? null : r, count: c === undefined ? null : Number(c) };
}

/**
 * The hotbar is scored per slot, in three parts, so a score says which part goes wrong:
 * hotbar.empty (empty vs filled), hotbar.rarity (filled slots), hotbar.count (slots that show a number).
 */
function checkSlots(file: string, want: string, got: string, tally: Tally, misses: string[]): void {
  const w = want.split(' | ');
  const g = got ? got.split(' | ') : [];
  const add = (name: string, ok: boolean, k: number, a: unknown, b: unknown) => {
    const t = tally.get(name) ?? { right: 0, total: 0 };
    t.total++;
    if (ok) t.right++;
    else misses.push(`  ${file.padEnd(18)} ${name.padEnd(14)} slot ${k}: want ${JSON.stringify(a)}, got ${JSON.stringify(b)}`);
    tally.set(name, t);
  };
  for (let k = 0; k < 5; k++) {
    const a = slot(w[k]);
    const b = slot(g[k]);
    add('hotbar.empty', a.empty === b.empty, k + 1, a.empty ? 'empty' : 'item', b.empty ? 'empty' : 'item');
    if (a.empty) continue;
    add('hotbar.rarity', a.rarity === b.rarity, k + 1, a.rarity, b.rarity);
    if (a.count !== null) add('hotbar.count', a.count === b.count, k + 1, a.count, b.count);
  }
}

function loadFrame(file: string): Uint8Array | null {
  const img = nativeImage.createFromPath(file);
  const { width, height } = img.getSize();
  if (!width) return null;
  const fit = width === FRAME_W && height === FRAME_H ? img : img.resize({ width: FRAME_W, height: FRAME_H, quality: 'best' });
  return new Uint8Array(fit.toBitmap());
}

function checkFrames(): number {
  const answers: AnswerFile = existsSync(ANSWERS) ? JSON.parse(readFileSync(ANSWERS, 'utf8')) : { _about: '', frames: {} };
  if (!existsSync(FRAMES)) {
    say(`Screenshots folder not found: ${FRAMES}`);
    say('The screenshots stay on your PC (not in the repo). Point at them with --frames=DIR.');
    return 0;
  }
  const files = readdirSync(FRAMES)
    .filter((f) => /\.(jpe?g|png)$/i.test(f))
    .filter((f) => !ONLY || f.startsWith(ONLY))
    .sort();
  const tally: Tally = new Map();
  const misses: string[] = [];
  let added = 0;
  let unchecked = 0;
  const started = Date.now();

  for (const f of files) {
    const px = loadFrame(path.join(FRAMES, f));
    if (!px) continue;
    const got = readFrame(px);
    const ans = answers.frames[f];
    if (!ans) {
      if (RECORD) {
        answers.frames[f] = { checked: false, want: got };
        added++;
      }
      continue;
    }
    if (!ans.checked) unchecked++;
    for (const [field, want] of Object.entries(ans.want) as [Field, unknown][]) {
      if (field === 'hotbar.slots' && typeof want === 'string' && want) {
        checkSlots(f, want, got['hotbar.slots'], tally, misses);
        continue;
      }
      const t = tally.get(field) ?? { right: 0, total: 0 };
      t.total++;
      if (same(field, want, got[field])) t.right++;
      else misses.push(`  ${f.padEnd(18)} ${field.padEnd(14)} want ${JSON.stringify(want)}, got ${JSON.stringify(got[field])}`);
      tally.set(field, t);
    }
  }
  if (RECORD && added) writeFileSync(ANSWERS, JSON.stringify(answers, null, 2) + '\n');

  const base: Record<string, number> = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).right : {};
  let worse = 0;
  say(`Screen readers: ${files.length} screenshots in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  say(`  ${'reader'.padEnd(14)} ${'right'.padStart(11)}        baseline`);
  for (const [field, t] of [...tally.entries()].sort()) {
    const pct = Math.round((100 * t.right) / t.total);
    const was = base[field];
    const diff = was === undefined ? 'new' : t.right > was ? `better (was ${was})` : t.right < was ? `WORSE (was ${was})` : 'same';
    if (was !== undefined && t.right < was) worse++;
    say(`  ${field.padEnd(14)} ${String(t.right).padStart(4)} / ${String(t.total).padEnd(4)} ${String(pct).padStart(3)}%  ${diff}`);
  }
  if (misses.length && (VERBOSE || worse)) {
    say(`Misses (${misses.length}):`);
    misses.forEach((m) => say(m));
  } else if (misses.length) say(`${misses.length} misses (list: --verbose, or out/fn-test/last-run.txt).`);
  if (SAVE_BASELINE) {
    writeFileSync(BASELINE, JSON.stringify({ _about: 'Scores the screen readers had when last saved (--save-baseline). A run fails when one drops.', right: Object.fromEntries([...tally.entries()].sort().map(([k, t]) => [k, t.right])) }, null, 2) + '\n');
    say('Baseline saved.');
  }
  out.push('', 'All misses:', ...misses);
  if (added) say(`Added answers for ${added} new screenshots (look at them, then set "checked": true).`);
  if (unchecked) say(`${unchecked} screenshots still have answers nobody has checked by eye.`);
  const noAnswer = files.filter((f) => !answers.frames[f]).length;
  if (noAnswer) say(`${noAnswer} screenshots have no answers yet (run with --record).`);
  return worse;
}

function checkText(): number {
  const cases = textCases as unknown as Record<string, { text: string; want: unknown }[]>;
  const readers: Record<string, (t: string) => unknown> = { placement: parsePlacement, rank: parseRank, held: parseHeldLabel };
  let missed = 0;
  say('Text readers:');
  for (const [name, read] of Object.entries(readers)) {
    const list = cases[name] ?? [];
    let right = 0;
    const bad: string[] = [];
    for (const c of list) {
      const got = read(c.text);
      if (JSON.stringify(got) === JSON.stringify(c.want)) right++;
      else bad.push(`    "${c.text}": want ${JSON.stringify(c.want)}, got ${JSON.stringify(got)}`);
    }
    say(`  ${name.padEnd(14)} ${String(right).padStart(4)} / ${String(list.length).padEnd(4)}${bad.length ? '  <-' : ''}`);
    bad.forEach((b) => say(b));
    missed += bad.length;
  }
  return missed;
}

/** --slot=FILE:N:HELD prints the count reader's pieces for one slot (FN_DEBUG_COUNT logging), for tuning. */
function debugSlot(spec: string): void {
  const [f, k, held] = spec.split(':');
  const px = loadFrame(path.join(FRAMES, f));
  if (!px) return say(`no picture ${f}`);
  (globalThis as { fnDebugCount?: (...a: unknown[]) => void }).fnDebugCount = (...a) => say(a.join(' '));
  say(`== ${spec}: ${JSON.stringify(debugCount(px, Number(k), held === '1'))}`);
}

void app.whenReady().then(() => {
  const slotArg = arg('slot');
  if (slotArg) {
    slotArg.split(',').forEach(debugSlot);
    return app.exit(0);
  }
  let missed = 0;
  try {
    missed += checkFrames();
    say();
    missed += checkText();
    say();
    say(missed ? 'FAILED: a score dropped or a text case missed.' : 'Passed: no score dropped.');
    writeFileSync(path.join(ROOT, 'out/fn-test/last-run.txt'), out.join('\n') + '\n');
  } catch (e) {
    console.error(e);
    missed = 1;
  }
  app.exit(missed ? 1 : 0);
});
