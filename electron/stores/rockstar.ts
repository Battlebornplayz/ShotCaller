import path from 'node:path';
import { exists, type ExtraStoreResult } from './extra';
import type { RegistrySnapshot } from './registry';

/** Keys under "Rockstar Games" that aren't games. */
const NOT_GAMES = /^(launcher|rockstar games social club|social club|steam|epic|rockstar games launcher)$/i;

/**
 * Rockstar Games Launcher: games installed through it. Copies bought on Steam or Epic only record
 * a Steam/Epic folder and are left to those stores. Play asks the launcher to start the game.
 */
export function readRockstar(reg: RegistrySnapshot): ExtraStoreResult {
  const launcherDir = reg.rockstar.find((r) => /^launcher$/i.test(r.key))?.dir;
  const launcherExe = launcherDir ? path.join(launcherDir, 'Launcher.exe') : undefined;
  const exe = exists(launcherExe) ? launcherExe : undefined;
  const games = reg.rockstar
    .filter((r) => !NOT_GAMES.test(r.key) && exists(r.dir))
    .map((r) => ({
      store: 'rockstar' as const,
      id: r.key,
      name: r.key,
      installDir: r.dir!,
      exeNames: [],
      launch: exe ? { exe, args: ['-launchTitleInFolder', r.dir!] } : {},
    }));
  return { found: !!exe, path: exe ? path.dirname(exe) : undefined, games, openTarget: exe ? { exe } : undefined };
}
