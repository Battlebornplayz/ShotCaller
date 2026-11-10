/**
 * Reads Fortnite's own log (FortniteGame.log) for one thing only: when a match starts and ends, and which
 * mode it was. Pure code, shared by the main process and checks run against real logs.
 *
 * What a match looks like in the log (checked against 75 real matches, 2026-11-07 to 11-10, game 43.00):
 *   LogLoad: LoadMap: 3.101.168.3:9030/Delilah/Maps/Delilah_Terrain?...      the island loads: a match starts
 *   LogCsvProfiler: Display: Metadata set : playlistid="Playlist_NoBuildBR_Squad"   the mode
 *   LogBattleRoyaleGamePhaseLogic: HandleGamePhaseChanged. OldPhase = ... NewPhase = EAthenaGamePhase::Warmup
 *   ... NewPhase = EAthenaGamePhase::Aircraft      the bus
 *   ... NewPhase = EAthenaGamePhase::SafeZones     the bus has dropped everyone
 *   ... NewPhase = EAthenaGamePhase::EndGame       the match itself finished (only if you stayed to the end)
 *   LogLoad: LoadMap: /Game/Maps/Frontend?closed  back in the lobby: the match is over for you
 * Re-queueing straight from a match loads the next island without the lobby and without a new playlist line,
 * so the mode carries over from the last one seen. Line times are UTC.
 */

export type FnKind = 'br' | 'ranked' | 'reload' | 'other';
export type FnTeamSize = 'solo' | 'duo' | 'trio' | 'squad' | null;

export interface FnModeInfo {
  kind: FnKind;
  zeroBuild: boolean;
  teamSize: FnTeamSize;
}

/** Works out the mode from a playlist id such as "Playlist_NoBuildBR_Squad". Unknown ids are "other". */
export function modeOf(playlist: string | null): FnModeInfo {
  const p = (playlist ?? '').toLowerCase();
  const zeroBuild = p.includes('nobuild') || p.includes('zerobuild');
  const teamSize: FnTeamSize = /squad/.test(p) ? 'squad' : /trio/.test(p) ? 'trio' : /duo/.test(p) ? 'duo' : /solo/.test(p) ? 'solo' : null;
  let kind: FnKind = 'other';
  if (/showdown|ranked|habanero/.test(p)) kind = 'ranked';
  else if (/blastberry|punchberry|reload/.test(p)) kind = 'reload';
  else if (/nobuildbr|^playlist_default|^playlist_trios|^playlist_nobuild/.test(p)) kind = 'br';
  return { kind, zeroBuild, teamSize };
}

/** Plain-language mode name, e.g. "Zero Build · Squad". */
export function modeLabel(m: FnModeInfo): string {
  const kind = m.kind === 'ranked' ? 'Ranked' : m.kind === 'reload' ? 'Reload' : m.kind === 'br' ? '' : 'Other';
  const build = m.kind === 'other' ? '' : m.zeroBuild ? 'Zero Build' : 'Builds';
  const size = m.teamSize ? m.teamSize[0].toUpperCase() + m.teamSize.slice(1) : '';
  return [kind, build, size].filter(Boolean).join(' · ') || 'Unknown mode';
}

export type FnPhase = 'warmup' | 'bus' | 'zones' | 'endgame';

/** One match as the log sees it. Times are ms since 1970. */
export interface FnLogMatch {
  startedAt: number;
  map: string;
  playlist: string | null;
  /** When each phase began, if it did. */
  phases: Partial<Record<FnPhase, number>>;
  endedAt: number | null;
  /** lobby = went back to the lobby; next = loaded straight into another match; closed = the game was closed. */
  endReason: 'lobby' | 'next' | 'closed' | null;
}

export type FnLogEvent =
  | { type: 'start'; match: FnLogMatch }
  | { type: 'update'; match: FnLogMatch }
  | { type: 'end'; match: FnLogMatch };

const TIME = /^\[(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2}):(\d{3})\]/;
const LOADMAP = /LogLoad: LoadMap: (\S+)/;
const PLAYLIST = /Metadata set : playlistid="([^"]+)"/;
const PHASE = /HandleGamePhaseChanged\..*NewPhase = EAthenaGamePhase::(\w+)/;
const PHASES: Record<string, FnPhase> = { Warmup: 'warmup', Aircraft: 'bus', SafeZones: 'zones', EndGame: 'endgame' };

/** Log line time ("[2026.11.07-07.42.39:880]...", UTC) in ms, or null. */
export function lineTime(line: string): number | null {
  const m = TIME.exec(line);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, ms] = m.map(Number);
  return Date.UTC(y, mo - 1, d, h, mi, s, ms);
}

/** "3.101.168.3:9030/Delilah/Maps/Delilah_Terrain?x" -> "Delilah_Terrain"; the lobby is "Frontend". */
export function mapName(target: string): string {
  const pathPart = target.split('?')[0];
  return pathPart.split('/').pop() || pathPart;
}

/**
 * Feed it log lines in order; it reports when a match starts, changes (mode, phases) and ends.
 * Only map loads, the playlist line and phase changes are looked at.
 */
export class FnLogParser {
  current: FnLogMatch | null = null;
  lastPlaylist: string | null = null;
  lastTime = 0;

  feed(line: string): FnLogEvent[] {
    const t = lineTime(line);
    if (t !== null) this.lastTime = t;
    const at = t ?? this.lastTime;
    const out: FnLogEvent[] = [];

    const load = LOADMAP.exec(line);
    if (load) {
      const map = mapName(load[1]);
      if (this.current) out.push(this.finish(at, map === 'Frontend' ? 'lobby' : 'next'));
      if (map !== 'Frontend') {
        this.current = { startedAt: at, map, playlist: this.lastPlaylist, phases: {}, endedAt: null, endReason: null };
        out.push({ type: 'start', match: { ...this.current } });
      }
      return out;
    }

    const pl = PLAYLIST.exec(line);
    if (pl) {
      if (pl[1].toLowerCase() === 'playlist_frontend') return out;
      this.lastPlaylist = pl[1];
      if (this.current && this.current.playlist !== pl[1]) {
        this.current.playlist = pl[1];
        out.push({ type: 'update', match: { ...this.current } });
      }
      return out;
    }

    const ph = PHASE.exec(line);
    if (ph && this.current) {
      const phase = PHASES[ph[1]];
      if (phase && this.current.phases[phase] === undefined) {
        this.current.phases = { ...this.current.phases, [phase]: at };
        out.push({ type: 'update', match: { ...this.current } });
      }
    }
    return out;
  }

  /** The game closed (or the log ended) with a match still open. */
  close(at = this.lastTime): FnLogEvent[] {
    return this.current ? [this.finish(at, 'closed')] : [];
  }

  private finish(at: number, reason: NonNullable<FnLogMatch['endReason']>): FnLogEvent {
    const done = { ...this.current!, endedAt: at, endReason: reason };
    this.current = null;
    return { type: 'end', match: done };
  }
}

/** A match counts for stats only once the bus has flown (leaving during warm-up isn't a match). */
export function wasPlayed(m: FnLogMatch): boolean {
  return m.phases.bus !== undefined;
}
