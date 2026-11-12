import path from 'node:path';
import { cleanTitle, exists, readSqlite, type ExtraStoreResult } from './extra';

/** Amazon Games: installed games from the app's own install list (SQLite, read-only). */
export function readAmazon(): ExtraStoreResult {
  const local = process.env.LOCALAPPDATA ?? '';
  const dataDir = path.join(local, 'Amazon Games', 'Data');
  const db = path.join(dataDir, 'Games', 'Sql', 'GameInstallInfo.sqlite');
  const appExe = path.join(local, 'Amazon Games', 'App', 'Amazon Games.exe');
  const rows = readSqlite<{ Id: string; InstallDirectory: string; ProductTitle: string }>(
    db,
    'SELECT Id, InstallDirectory, ProductTitle FROM DbSet WHERE Installed = 1',
  );
  const games = (rows ?? [])
    .filter((r) => r.Id && r.ProductTitle && exists(r.InstallDirectory))
    .map((r) => ({
      store: 'amazon' as const,
      id: String(r.Id),
      name: cleanTitle(String(r.ProductTitle)),
      installDir: String(r.InstallDirectory),
      exeNames: [],
      launch: { target: `amazon-games://play/${encodeURIComponent(String(r.Id))}` },
    }));
  const hasApp = exists(appExe);
  const found = hasApp || exists(db);
  return { found, path: found ? (hasApp ? path.dirname(appExe) : dataDir) : undefined, games, openTarget: hasApp ? { exe: appExe } : undefined };
}
