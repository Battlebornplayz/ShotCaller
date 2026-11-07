import type { GameModule } from '../types';

/**
 * Skillshot City (formerly Geneshift). Steam app 308600; ships as SkillshotCity.exe in
 * steamapps/common/SkillshotCity. Skill advisor, database and round tracker arrive in Phases 7-8;
 * Phase 3 draws a placeholder round panel driven by the hotkeys.
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
};
