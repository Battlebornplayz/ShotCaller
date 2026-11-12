import fs from 'node:fs';
import path from 'node:path';
import { exists, type ExtraGame, type ExtraStoreResult } from './extra';

const NAMES: Record<string, string> = {
  valorant: 'VALORANT',
  league_of_legends: 'League of Legends',
  bacon: 'Legends of Runeterra',
  lion: '2XKO',
};

/** Riot Client: games from its product settings files; Play asks the Riot Client to launch the product. */
export function readRiot(): ExtraStoreResult {
  const root = path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'Riot Games');
  let client: string | undefined;
  try {
    const j = JSON.parse(fs.readFileSync(path.join(root, 'RiotClientInstalls.json'), 'utf8')) as Record<string, unknown>;
    client = [j.rc_default, j.rc_live].find((p): p is string => typeof p === 'string' && exists(p));
  } catch {
    // no Riot Client
  }
  const games: ExtraGame[] = [];
  let folders: string[] = [];
  try {
    folders = fs.readdirSync(path.join(root, 'Metadata'));
  } catch {
    // none
  }
  for (const f of folders) {
    const m = f.match(/^([a-z0-9_]+)\.([a-z0-9_]+)$/i);
    if (!m || m[1] === 'riot_client') continue;
    const [, product, patchline] = m;
    let yaml: string;
    try {
      yaml = fs.readFileSync(path.join(root, 'Metadata', f, `${f}.product_settings.yaml`), 'utf8');
    } catch {
      continue;
    }
    const dir = yaml.match(/product_install_full_path:\s*"?([^"\r\n]+)"?/)?.[1]?.trim();
    if (!dir || !exists(dir)) continue;
    games.push({
      store: 'riot',
      id: `${product}.${patchline}`,
      name: NAMES[product] ?? product.replace(/_/g, ' '),
      installDir: path.normalize(dir),
      exeNames: [],
      launch: client ? { exe: client, args: [`--launch-product=${product}`, `--launch-patchline=${patchline}`] } : {},
    });
  }
  return { found: !!client, path: client ? path.dirname(client) : undefined, games, openTarget: client ? { exe: client } : undefined };
}
