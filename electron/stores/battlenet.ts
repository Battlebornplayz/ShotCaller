import path from 'node:path';
import { cleanTitle, exists, type ExtraStoreResult } from './extra';
import type { RegistrySnapshot } from './registry';

/** Battle.net product codes, matched by the start of the game's name. */
const CODES: [RegExp, string][] = [
  [/^world of warcraft/i, 'WoW'],
  [/^overwatch/i, 'Pro'],
  [/^diablo iv|^diablo 4/i, 'Fen'],
  [/^diablo ii(:| resurrected)/i, 'OSI'],
  [/^diablo iii|^diablo 3/i, 'D3'],
  [/^diablo immortal/i, 'ANBS'],
  [/^hearthstone/i, 'WTCG'],
  [/^heroes of the storm/i, 'Hero'],
  [/^starcraft ii|^starcraft 2/i, 'S2'],
  [/^starcraft/i, 'S1'],
  [/^warcraft iii|^warcraft 3/i, 'W3'],
  [/^warcraft rumble/i, 'GRY'],
  [/^crash bandicoot/i, 'WLBY'],
];

/** Battle.net: games from Windows' installed-apps list; Play asks Battle.net to launch the product. */
export function readBattleNet(reg: RegistrySnapshot): ExtraStoreResult {
  const pf86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
  const dir = reg.apps.find((a) => /^battle\.net$/i.test(a.name))?.dir ?? path.join(pf86, 'Battle.net');
  const exe = [path.join(dir, 'Battle.net.exe'), path.join(dir, 'Battle.net Launcher.exe')].find((p) => exists(p));
  const games = reg.apps
    .filter((a) => a.uninstall && /Battle\.net/i.test(a.uninstall) && !/^battle\.net/i.test(a.name) && exists(a.dir))
    .map((a) => {
      const code = CODES.find(([re]) => re.test(a.name))?.[1];
      return {
        store: 'battlenet' as const,
        id: code ?? a.key,
        name: cleanTitle(a.name),
        installDir: a.dir!,
        exeNames: [],
        launch: exe ? { exe, args: code ? [`--exec=launch ${code}`] : [] } : {},
        sizeBytes: a.sizeKb ? a.sizeKb * 1024 : undefined,
      };
    });
  return { found: !!exe, path: exe ? path.dirname(exe) : undefined, games, openTarget: exe ? { exe } : undefined };
}
