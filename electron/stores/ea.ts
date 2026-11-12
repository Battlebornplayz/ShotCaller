import fs from 'node:fs';
import path from 'node:path';
import { cleanTitle, exists, type ExtraStoreResult } from './extra';
import type { RegistrySnapshot } from './registry';

/** EA app (and old Origin installs): games from Windows' installed-apps list that EA's installer wrote. */
export function readEa(reg: RegistrySnapshot): ExtraStoreResult {
  const pf = process.env.ProgramFiles ?? 'C:\\Program Files';
  const appDir = reg.apps.find((a) => /^ea app$/i.test(a.name))?.dir ?? path.join(pf, 'Electronic Arts', 'EA Desktop', 'EA Desktop');
  const appExe = [path.join(appDir, 'EADesktop.exe'), path.join(appDir, 'EA Desktop', 'EADesktop.exe')].find((p) => exists(p));
  const games = reg.apps
    .filter((a) => a.uninstall && /EAInstaller|__Installer|Origin/i.test(a.uninstall) && !/^(ea app|origin)$/i.test(a.name) && exists(a.dir))
    .map((a) => {
      let contentId: string | undefined;
      try {
        const xml = fs.readFileSync(path.join(a.dir!, '__Installer', 'installerdata.xml'), 'utf8');
        contentId = xml.match(/<contentID>\s*([^<\s]+)\s*<\/contentID>/i)?.[1];
      } catch {
        // no installer data
      }
      return {
        store: 'ea' as const,
        id: contentId ?? a.key,
        name: cleanTitle(a.name),
        installDir: a.dir!,
        exeNames: [],
        launch: contentId
          ? { target: `origin2://game/launch?offerIds=${encodeURIComponent(contentId)}&autoDownload=1` }
          : appExe
            ? { exe: appExe }
            : {},
        sizeBytes: a.sizeKb ? a.sizeKb * 1024 : undefined,
      };
    });
  return { found: !!appExe || games.length > 0, path: appExe ? path.dirname(appExe) : undefined, games, openTarget: appExe ? { exe: appExe } : undefined };
}
