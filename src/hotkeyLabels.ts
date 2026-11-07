import type { HotkeyAction } from '../shared/types';

export const HOTKEY_LABELS: Record<HotkeyAction, { title: string; description: string }> = {
  popup: { title: 'Show / hide overlay', description: 'Toggles the overlay (in popup mode, the only way to open it).' },
  pick1: { title: 'Pick skill 1', description: 'Takes the left skill offer.' },
  pick2: { title: 'Pick skill 2', description: 'Takes the right skill offer.' },
  nextRound: { title: 'Next round', description: 'Moves the round tracker to the next round.' },
  endMatch: { title: 'End match', description: 'Ends the match and opens the recap.' },
  huntList: { title: 'Hunt list', description: 'Shows or hides your pinned achievement hunt list.' },
};

/** "Alt+S" → ["Alt", "S"] for keycap rendering. */
export function acceleratorParts(accel: string): string[] {
  return accel ? accel.split('+').map((p) => (p === 'CommandOrControl' || p === 'Control' ? 'Ctrl' : p)) : [];
}
