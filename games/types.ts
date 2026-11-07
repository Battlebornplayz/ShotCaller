/**
 * A game module: everything ShotCaller needs to know about one game.
 * Phase 2 only uses the identity fields; detection, overlay panels and achievement
 * sources are added in Phases 3 onward.
 */
export interface GameModule {
  /** Stable slug, also the folder name under games/. */
  id: string;
  name: string;
  /** Steam app id, if the game is on Steam. */
  steamAppId?: number;
  /** Short label for the game icon in the rail (two letters). */
  initials: string;
  /** Accent color for the game icon tile. */
  color: string;
}
