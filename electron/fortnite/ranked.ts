import { nativeImage } from 'electron';
import type { FnMatchRecord } from '../../shared/fortnite';
import { earnedFnAchievements } from '../../shared/fortniteAchievements';
import { parseRank } from '../../shared/fortniteScore';
import { grantModuleAchievements } from '../achievements';
import { readText } from '../ocr';
import { captureScreen, type WindowArea } from '../skillshot/screenCapture';
import { getFortniteMatches, onMatchSaved, onMatchesChanged, setMatchRank } from './tracker';

/**
 * Ranked (Phase F4): after a Ranked match, Fortnite shows your rank and its progress bar. For a few minutes
 * after one ends, the whole game screen is read with Windows' text reader every 3 s while Fortnite is in
 * front, looking for a rank name ("GOLD II") and a percentage; the newest read is saved with the match.
 * Also: ShotCaller's own Fortnite achievements are checked whenever the history changes.
 */

const WATCH_MS = 4 * 60_000;
const EVERY_MS = 3000;

let watch: { matchId: string; zeroBuild: boolean; until: number } | null = null;
let lastAt = 0;
let busy = false;

export function initFortniteExtras(): void {
  onMatchSaved((m: FnMatchRecord) => {
    if (m.kind === 'ranked') watch = { matchId: m.id, zeroBuild: m.zeroBuild, until: Date.now() + WATCH_MS };
  });
  onMatchesChanged(() => checkAchievements(false));
  // Already earned from older matches: recorded quietly (no stack of popups at start-up). The hub may still
  // be loading the library, so try again a little later too.
  setTimeout(() => checkAchievements(true), 5000);
  setTimeout(() => checkAchievements(true), 30_000);
}

function checkAchievements(quiet: boolean): void {
  const matches = getFortniteMatches();
  const totalChests = matches.reduce((s, m) => s + m.chests, 0);
  grantModuleAchievements('fortnite', earnedFnAchievements({ matches, totalChests }), quiet);
}

/** Whether the rank screen is being looked for (shown on the Screen check page). */
export function rankWatchOn(): boolean {
  return !!watch && Date.now() < watch.until;
}

/** Called by the screen reader on each look outside a match, while Fortnite is in front. */
export function readRankScreen(area: WindowArea): void {
  if (!watch) return;
  const now = Date.now();
  if (now > watch.until) {
    watch = null;
    return;
  }
  if (busy || now - lastAt < EVERY_MS) return;
  lastAt = now;
  const pixels = captureScreen(area);
  if (!pixels) return;
  busy = true;
  const target = watch;
  const opaque = Buffer.from(pixels);
  for (let i = 3; i < opaque.length; i += 4) opaque[i] = 255;
  let img = nativeImage.createFromBitmap(opaque, { width: area.width, height: area.height });
  // Windows' reader is happiest around 1080p; bigger screens are brought down to it.
  if (area.height > 1200) img = img.resize({ width: Math.round((area.width * 1080) / area.height), height: 1080, quality: 'good' });
  void readText(img.toPNG(), 5000)
    .then((lines) => {
      if (!lines) return;
      // A rank name alone could be anything ("gold" bars): it must come with a division or a % on its line,
      // or be one of the top ranks, which have neither. A line with the % wins.
      const reads = lines.map((l) => parseRank(l.text)).filter((r): r is NonNullable<typeof r> => !!r && (r.progress !== null || r.division !== null || ['elite', 'champion', 'unreal'].includes(r.rank)));
      const found = reads.find((r) => r.progress !== null) ?? reads[0];
      if (found) setMatchRank(target.matchId, { ...found, at: Date.now(), matchId: target.matchId, zeroBuild: target.zeroBuild });
    })
    .finally(() => {
      busy = false;
    });
}
