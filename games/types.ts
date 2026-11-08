/**
 * A game module: everything ShotCaller needs to know about one game.
 *
 * Manifests are plain data so both the main process (detection) and the renderer (UI) can import
 * them. Overlay panel *components* live in the renderer registry (`games/panels.tsx`), keyed by
 * module id and panel id, so the main bundle never pulls in React.
 */
export interface GameModule {
  /** Stable slug, also the folder name under games/. */
  id: string;
  name: string;
  /** Steam app id, if the game is on Steam. */
  steamAppId?: number;
  /**
   * Executable file names that mean "this game is running" (case-insensitive, no path).
   * Steam games are also detected by Steam's RunningAppID and by their install folder.
   */
  exeNames: string[];
  /** Short label for the game icon in the rail (two letters). */
  initials: string;
  /** Accent color for the game icon tile. */
  color: string;
  /** Wide header art. Defaults to Steam's header image when `steamAppId` is set. */
  headerArt?: string;
  /** Overlay panels this module draws. Rendered by `games/panels.tsx`. */
  overlayPanels: OverlayPanelDef[];
  /** Whether the overlay opens automatically when this game launches. */
  autoOverlay: boolean;
  /**
   * Keep the default corner overlay clear of the game's own top-right UI: pixels to leave free at
   * the top, as a fraction of the screen height (so it scales from 1080p).
   */
  overlayTopClearance?: number;
}

export interface OverlayPanelDef {
  id: string;
  title: string;
}

/** Steam's CDN header image (460x215) for any Steam app. */
export function steamHeaderArt(appId: number): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;
}

/** Steam's square-ish library capsule (600x900) for any Steam app. */
export function steamCapsuleArt(appId: number): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`;
}
