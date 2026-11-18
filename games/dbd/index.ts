import type { GameModule } from '../types';

/**
 * Dead by Daylight (Behaviour Interactive). Detected by Steam's running-app signal and its program names.
 * ShotCaller never touches DbD's memory or process (EasyAntiCheat): game data comes from the DbD wiki, patch
 * notes from Steam, the scales from DbD's own settings file, and (Phase D3) the screen.
 */
export const dbd: GameModule = {
  id: 'dbd',
  name: 'Dead by Daylight',
  steamAppId: 381210,
  exeNames: ['DeadByDaylight-Win64-Shipping.exe', 'DeadByDaylight-EGS-Shipping.exe', 'DeadByDaylight-WinGDK-Shipping.exe'],
  initials: 'DB',
  color: '#7a2531',
  // No overlay yet: hooks and timers come with screen reading (Phase D3).
  overlayPanels: [],
  autoOverlay: false,
};
