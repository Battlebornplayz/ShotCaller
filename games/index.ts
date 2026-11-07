import type { GameModule } from './types';
import { skillshotCity } from './skillshot-city';

/**
 * Registry of installed game modules, shown in the game-icon rail.
 * Add a new game by creating games/<id>/index.ts and listing it here.
 */
export const games: GameModule[] = [skillshotCity];
