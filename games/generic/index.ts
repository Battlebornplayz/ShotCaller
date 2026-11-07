import type { GameModule } from '../types';

/**
 * Fallback module for any game without its own module (Steam library imports and games added
 * by hand). It gets the achievement hub and a small "now playing" overlay panel, but the overlay
 * only opens for it when "Show the overlay for every game" is on in Settings.
 */
export const genericModule: GameModule = {
  id: 'generic',
  name: 'Any game',
  exeNames: [],
  initials: '',
  color: '#2a2d55',
  overlayPanels: [{ id: 'session', title: 'Now playing' }],
  autoOverlay: false,
};
