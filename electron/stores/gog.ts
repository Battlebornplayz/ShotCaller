import path from 'node:path';
import { cleanTitle, exists, splitArgs, type ExtraStoreResult } from './extra';
import type { RegistrySnapshot } from './registry';

/** GOG: games from GOG's own registry keys; Play goes through GOG Galaxy when it's installed. */
export function readGog(reg: RegistrySnapshot): ExtraStoreResult {
  const galaxy = reg.galaxyClient ? path.join(reg.galaxyClient, 'GalaxyClient.exe') : undefined;
  const galaxyExe = exists(galaxy) ? galaxy : undefined;
  const games = reg.gog
    .filter((g) => !g.dependsOn && exists(g.path))
    .map((g) => {
      const exe = exists(g.exe) ? g.exe : undefined;
      const launch = galaxyExe
        ? { exe: galaxyExe, args: ['/command=runGame', `/gameId=${g.id}`, `/path=${g.path}`] }
        : exe
          ? { exe, args: splitArgs(g.params) }
          : {};
      return {
        store: 'gog' as const,
        id: g.id,
        name: cleanTitle(g.name),
        installDir: g.path!,
        exeNames: exe ? [path.basename(exe)] : [],
        launch,
      };
    });
  return {
    found: !!galaxyExe || games.length > 0,
    path: galaxyExe ? path.dirname(galaxyExe) : undefined,
    games,
    openTarget: galaxyExe ? { exe: galaxyExe } : undefined,
    note: !galaxyExe && games.length ? 'GOG Galaxy isn’t installed, so games start from their own file.' : undefined,
  };
}
