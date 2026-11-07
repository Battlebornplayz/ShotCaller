import { genericModule } from './generic';
import { skillshotCity } from './skillshot-city';
import type { GameModule } from './types';

/**
 * Registry of game modules with dedicated support, shown at the top of the game-icon rail.
 * Add a new game by creating games/<id>/index.ts and listing it here.
 */
export const games: GameModule[] = [skillshotCity];

export { genericModule };

export function moduleById(id: string | undefined): GameModule {
  return games.find((g) => g.id === id) ?? genericModule;
}

/** The dedicated module for a Steam app id, if there is one. */
export function moduleForSteamApp(appId: number): GameModule | undefined {
  return games.find((g) => g.steamAppId === appId);
}
