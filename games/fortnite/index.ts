import type { GameModule } from '../types';

/**
 * Fortnite (Epic Games). Detected by its program name only: ShotCaller never touches the game's memory,
 * process or files (Easy Anti-Cheat + BattlEye). It reads the screen and, for match start/end and mode only,
 * Fortnite's own log. The overlay needs Windowed Fullscreen.
 */
export const fortnite: GameModule = {
  id: 'fortnite',
  name: 'Fortnite',
  exeNames: ['FortniteClient-Win64-Shipping.exe'],
  initials: 'FN',
  color: '#4f8cff',
  overlayPanels: [{ id: 'card', title: 'Fortnite card' }],
  autoOverlay: true,
  // The minimap and the top-right number stack take the top ~300 px at 1080p.
  overlayTopClearance: 300 / 1080,
};
