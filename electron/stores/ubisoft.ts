import path from 'node:path';
import { cleanTitle, exists, type ExtraStoreResult } from './extra';
import type { RegistrySnapshot } from './registry';

/** Ubisoft Connect: installed games from its registry keys; Play opens uplay://launch. */
export function readUbisoft(reg: RegistrySnapshot): ExtraStoreResult {
  const launcherDir = exists(reg.ubisoftLauncher) ? reg.ubisoftLauncher : undefined;
  const byKey = new Map(reg.apps.map((a) => [a.key.toLowerCase(), a]));
  const games = reg.ubisoft
    .filter((u) => exists(u.dir))
    .map((u) => {
      const app = byKey.get(`uplay install ${u.id}`);
      return {
        store: 'ubisoft' as const,
        id: u.id,
        name: cleanTitle(app?.name ?? path.basename(u.dir!.replace(/[\\/]+$/, ''))),
        installDir: u.dir!,
        exeNames: [],
        launch: { target: `uplay://launch/${u.id}/0` },
        sizeBytes: app?.sizeKb ? app.sizeKb * 1024 : undefined,
      };
    });
  return { found: !!launcherDir || games.length > 0, path: launcherDir, games, openTarget: { target: 'uplay://' } };
}
