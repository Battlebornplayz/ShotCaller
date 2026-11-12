import path from 'node:path';
import { cleanTitle, exists, readSqlite, type ExtraStoreResult } from './extra';

interface CaveRow {
  id: string;
  verdict: string | null;
  folder: string | null;
  size: number | null;
  title: string;
  cover: string | null;
  loc: string | null;
}

/** itch.io app: installed games ("caves") from its own database (SQLite, read-only). */
export function readItch(): ExtraStoreResult {
  const db = path.join(process.env.APPDATA ?? '', 'itch', 'db', 'butler.db');
  const appExe = path.join(process.env.LOCALAPPDATA ?? '', 'itch', 'itch.exe');
  const rows = readSqlite<CaveRow>(
    db,
    `SELECT c.id AS id, c.verdict AS verdict, c.install_folder_name AS folder, c.installed_size AS size,
            g.title AS title, g.cover_url AS cover, l.path AS loc
       FROM caves c JOIN games g ON g.id = c.game_id LEFT JOIN install_locations l ON l.id = c.install_location_id`,
  );
  const games = (rows ?? [])
    .map((r) => {
      let base: string | undefined;
      try {
        base = (JSON.parse(r.verdict ?? '{}') as { basePath?: string }).basePath;
      } catch {
        // no verdict
      }
      return { r, dir: base ?? (r.loc && r.folder ? path.join(r.loc, r.folder) : undefined) };
    })
    .filter(({ r, dir }) => r.id && r.title && exists(dir))
    .map(({ r, dir }) => ({
      store: 'itch' as const,
      id: String(r.id),
      name: cleanTitle(String(r.title)),
      installDir: dir!,
      exeNames: [],
      launch: { target: `itch://caves/${encodeURIComponent(String(r.id))}/launch` },
      cover: r.cover && r.cover.startsWith('https://') ? r.cover : undefined,
      sizeBytes: r.size && r.size > 0 ? Number(r.size) : undefined,
    }));
  const hasApp = exists(appExe);
  const found = hasApp || exists(db);
  return { found, path: found ? path.dirname(hasApp ? appExe : db) : undefined, games, openTarget: hasApp ? { exe: appExe } : undefined };
}
