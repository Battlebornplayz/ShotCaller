import type { GameModule } from '../types';

/**
 * Skillshot City (formerly Geneshift). Steam app 308600; ships as SkillshotCity.exe in
 * steamapps/common/SkillshotCity. The overlay panel lives in ./overlay.tsx (advice, round, build).
 */
export const skillshotCity: GameModule = {
  id: 'skillshot-city',
  name: 'Skillshot City',
  steamAppId: 308600,
  exeNames: ['SkillshotCity.exe', 'SkillshotCity', 'Geneshift.exe'],
  initials: 'SC',
  color: '#ff7a59',
  overlayPanels: [{ id: 'round', title: 'Round tracker' }],
  autoOverlay: true,
  // The game's QUIT button sits in the top-right corner (~70 px tall at 1080p).
  overlayTopClearance: 84 / 1080,
};
