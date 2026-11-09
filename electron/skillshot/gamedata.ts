import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import { app, nativeImage } from 'electron';
import { getLibrary } from '../library';
import iconMap from '../../games/skillshot-city/icons.json';
import type {
  SkillshotClass,
  SkillshotData,
  SkillshotSkill,
  SkillshotSynergy,
} from '../../shared/skillshot';

/**
 * Reads Skillshot City's own data files, read-only:
 * - data/translations/<lang>.csv: skill/class names, descriptions, synergy tips.
 * - data/log*.txt: the game logs its synergy challenge list ("Prerequs For Synergy Challenge: : A + B")
 *   at startup, in index order; the list is cached because logs rotate.
 * - data/config.ini: game version and the chosen language.
 */

const STEAM_APP_ID = 308600;

/** Skill keys in the CSV that are categories, not skills. */
const NOT_SKILLS = new Set(['PHYSICALBIG', 'PHYSICALSMALL', 'MENTALBIG', 'MENTALSMALL', 'CYBERNETICBIG', 'CYBERNETICSMALL']);

/** Skills whose text sits under a different key than their name (including the game's own typo). */
const TEXT_KEY_ALIASES: Record<string, string[]> = {
  ASSASSINATE: ['ASSASSIN'],
  CHARGEDSHOT: ['ARCANEPOWER'],
  TELEPORTATION: ['TELEPORATION'],
};

/**
 * Tidies the game's text for display: `{{%cyan:word%}}` keeps the word, and number placeholders
 * (filled in by the game at runtime, absent from the CSV) become "X".
 */
export function cleanGameText(text: string): string {
  let out = text;
  // Colour tags can wrap a placeholder, so unwrap from the inside out.
  for (let i = 0; i < 3; i++) out = out.replace(/\{\{%[a-z]+:((?:(?!\{\{%|%\}\}).|\{\{%\d+%\}\})*)%\}\}/g, '$1');
  return out.replace(/\{\{%\d+%\}\}/g, 'X').replace(/\s+/g, ' ').trim();
}

/** config.ini language name → translation file. */
const LANGUAGE_FILES: Record<string, string> = {
  English: 'en',
  German: 'de',
  Deutsch: 'de',
  Spanish: 'es',
  'Español': 'es',
  French: 'fr',
  'Français': 'fr',
  Portuguese: 'pt_BR',
  'Português': 'pt_BR',
  Russian: 'ru',
  'Русский': 'ru',
  Chinese: 'zh_Hans',
  '中文': 'zh_Hans',
};

export function findInstallDir(): string | null {
  const game = getLibrary().games.find((g) => g.steamAppId === STEAM_APP_ID && g.installDir);
  if (game?.installDir && existsSync(path.join(game.installDir, 'data'))) return game.installDir;
  return null;
}

/** Parses the game's CSV: every field is double-quoted, `""` escapes a quote. Returns rows of fields. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

interface TextTable {
  /** key (without the XLnnnn_ prefix) → [english, translated] */
  get(key: string): { en: string; text: string } | undefined;
  keys(): IterableIterator<string>;
}

async function loadText(dataDir: string, lang: string): Promise<TextTable> {
  let file = path.join(dataDir, 'translations', `${lang}.csv`);
  if (!existsSync(file)) file = path.join(dataDir, 'translations', 'en.csv');
  const rows = parseCsv(await fs.readFile(file, 'utf8'));
  const map = new Map<string, { en: string; text: string }>();
  for (const [loc, source, target] of rows) {
    const m = /^XL\d+_(.+)$/.exec(loc ?? '');
    if (!m) continue;
    // Later XL versions override earlier ones for the same key.
    map.set(m[1], { en: source ?? '', text: target || source || '' });
  }
  return { get: (k) => map.get(k), keys: () => map.keys() };
}

async function readConfig(dataDir: string): Promise<{ version: string | null; language: string }> {
  try {
    const ini = await fs.readFile(path.join(dataDir, 'config.ini'), 'utf8');
    const version = /::VERSION,(\d+)/.exec(ini)?.[1] ?? null;
    const opts = /::OPTIONS\s*\r?\n([^\r\n]*)/.exec(ini)?.[1] ?? '';
    const name = opts.split(',').find((v) => v in LANGUAGE_FILES);
    return { version, language: name ? LANGUAGE_FILES[name] : 'en' };
  } catch {
    return { version: null, language: 'en' };
  }
}

const PREREQ_RE = /Prerequs For Synergy Challenge: : (.+?) \+ (.+?)\s*$/;

/** Reads the synergy list from the newest log that has a complete one; falls back to the cache. */
async function readSynergyPrereqs(dataDir: string): Promise<[string, string][]> {
  const cacheFile = path.join(app.getPath('userData'), 'cache', 'skillshot-synergies.json');
  const logs = ['log.txt', 'logPrevious1.txt', 'logPrevious2.txt', 'logPrevious3.txt'];
  for (const name of logs) {
    try {
      const text = await fs.readFile(path.join(dataDir, name), 'utf8');
      const pairs: [string, string][] = [];
      for (const line of text.split('\n')) {
        const m = PREREQ_RE.exec(line);
        if (m) pairs.push([m[1].trim(), m[2].trim()]);
        else if (pairs.length && /ClearRound|Loading Background/.test(line)) break;
      }
      if (pairs.length >= 10) {
        await fs.mkdir(path.dirname(cacheFile), { recursive: true });
        await fs.writeFile(cacheFile, JSON.stringify(pairs));
        return pairs;
      }
    } catch {
      /* missing log */
    }
  }
  try {
    return JSON.parse(await fs.readFile(cacheFile, 'utf8')) as [string, string][];
  } catch {
    return [];
  }
}

/**
 * Crops each skill's icon out of the game's own sprite sheet, so the art is never shipped with the app.
 * A blank cell or unreadable sheet leaves the skill without an icon, and the UI falls back to a monogram.
 */
function loadSkillIcons(installDir: string, skills: SkillshotSkill[]): void {
  const map = iconMap as { sheet: string; cell: number; skills: Record<string, { num: number; x: number; y: number }> };
  const sheet = nativeImage.createFromPath(path.join(installDir, 'data', 'textures', map.sheet));
  const size = sheet.getSize();
  for (const s of skills) {
    const at = map.skills[s.id];
    if (!at) continue;
    s.num = at.num;
    if (at.x + map.cell > size.width || at.y + map.cell > size.height) continue;
    const icon = sheet.crop({ x: at.x, y: at.y, width: map.cell, height: map.cell });
    const pixels = icon.toBitmap();
    let drawn = 0;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 40) drawn++;
    if (drawn >= 40) s.icon = icon.toDataURL();
  }
}

export async function extractSkillshotData(installDir: string): Promise<SkillshotData> {
  const dataDir = path.join(installDir, 'data');
  const { version, language } = await readConfig(dataDir);
  const text = await loadText(dataDir, language);

  const skills: SkillshotSkill[] = [];
  const classes: SkillshotClass[] = [];
  for (const key of text.keys()) {
    const s = /^SKILL_([A-Z0-9]+)$/.exec(key);
    if (s && !NOT_SKILLS.has(s[1])) {
      const id = s[1];
      const t = text.get(key)!;
      // A few skills keep their text under DESC_02, a plural key (FORCEFIELD → FORCEFIELDS_DESC_01) or an alias.
      const desc = (suffix: string) =>
        cleanGameText([id, `${id}S`, ...(TEXT_KEY_ALIASES[id] ?? [])].map((k) => text.get(`SKILL_${k}_${suffix}`)?.text).find((v) => v) ?? '');
      skills.push({
        id,
        name: t.text,
        nameEn: t.en,
        description: desc('DESC_01') || desc('DESC_02'),
        short: desc('DESC_SHORT'),
        mutation: desc('DESC_MUTATION'),
      });
    }
    const c = /^CLASS_([A-Z]+)$/.exec(key);
    if (c && c[1] !== 'RANDOM') {
      const t = text.get(key)!;
      // Marksman's internal name is STRIKER, but its description is still filed under SNIPER.
      const about = text.get(`CLASS_${c[1] === 'STRIKER' ? 'SNIPER' : c[1]}_DESC`)?.text;
      classes.push({ id: c[1], name: t.text, nameEn: t.en, description: about ? cleanGameText(about) : undefined });
    }
  }

  const skillByName = new Map(skills.map((s) => [s.nameEn.toLowerCase(), s.id]));
  const classByName = new Map(classes.map((c) => [c.nameEn.toLowerCase(), c.id]));
  const resolve = (n: string): string | null => {
    const k = n.toLowerCase();
    if (classByName.has(k)) return `class:${classByName.get(k)}`;
    return skillByName.get(k) ?? null;
  };

  const synergies: SkillshotSynergy[] = [];
  (await readSynergyPrereqs(dataDir)).forEach(([a, b], index) => {
    const pa = resolve(a);
    const pb = resolve(b);
    if (!pa || !pb) return;
    synergies.push({
      index,
      parts: [pa, pb],
      kind: pa.startsWith('class:') || pb.startsWith('class:') ? 'class-skill' : 'skill-skill',
      tip: (text.get(`SYNERGYCHALLENGE_${index}_DESC`)?.text ?? '').replace(/^Tip:\s*/i, ''),
    });
  });

  loadSkillIcons(installDir, skills);

  const tips: string[] = [];
  for (const key of text.keys()) {
    if (/^LOADINGTIP_\d+$/.test(key)) tips.push(cleanGameText(text.get(key)!.text).replace(/^[^:]{1,12}:\s*/, ''));
  }

  skills.sort((a, b) => a.name.localeCompare(b.name));
  return { installDir, language, gameVersion: version, skills, classes, synergies, tips, extractedAt: Date.now() };
}
