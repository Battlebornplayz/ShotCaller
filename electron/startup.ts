import { app } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Command-line flag used by the login item: start hidden in the tray, no launcher. */
export const HIDDEN_FLAG = '--hidden';

export function startedHidden(): boolean {
  return process.argv.includes(HIDDEN_FLAG);
}

/**
 * Registers (or removes) "start with the OS". Only for installed builds: in development it would
 * register the bare Electron binary.
 * Windows uses the Run registry key via Electron; Linux writes an XDG autostart entry for the AppImage.
 */
export function applyLaunchAtLogin(enabled: boolean): void {
  if (!app.isPackaged) return;
  try {
    if (process.platform === 'win32' || process.platform === 'darwin') {
      app.setLoginItemSettings({ openAtLogin: enabled, args: [HIDDEN_FLAG] });
    } else if (process.platform === 'linux') {
      const dir = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'autostart');
      const file = path.join(dir, 'shotcaller.desktop');
      const exec = process.env.APPIMAGE || process.execPath;
      if (enabled) {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
          file,
          ['[Desktop Entry]', 'Type=Application', 'Name=ShotCaller', `Exec="${exec}" ${HIDDEN_FLAG}`, 'X-GNOME-Autostart-enabled=true', ''].join('\n'),
        );
      } else if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    }
  } catch (err) {
    console.error('Could not update launch-at-login:', err);
  }
}
