import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Xbox app / Microsoft Store games installed on this PC: Windows' own package list, keeping the
 * packages that ship a MicrosoftGame.config (that file is what marks a PC Game Pass / Store game).
 * Read-only: only the package list and the game's own config files are read.
 */

export interface XboxGame {
  /** Package family name, e.g. Microsoft.MinecraftDungeons2_8wekyb3d8bbwe. */
  pfn: string;
  appId: string;
  name: string;
  installDir: string;
  /** XboxGames\<name>\Content, where the game's files really run from (when found). */
  contentDir?: string;
  exeNames: string[];
  storeId?: string;
  /** Local art files inside the package. */
  logoFile?: string;
  splashFile?: string;
}

const SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$out = @(Get-AppxPackage | Where-Object { -not $_.IsFramework -and $_.InstallLocation -and (Test-Path -LiteralPath (Join-Path $_.InstallLocation 'MicrosoftGame.config')) } | ForEach-Object {
  [pscustomobject]@{
    pfn = $_.PackageFamilyName
    loc = $_.InstallLocation
    cfg = [string](Get-Content -LiteralPath (Join-Path $_.InstallLocation 'MicrosoftGame.config') -Raw)
    man = [string](Get-Content -LiteralPath (Join-Path $_.InstallLocation 'AppxManifest.xml') -Raw)
  }
})
[Console]::Out.Write((ConvertTo-Json -InputObject $out -Depth 3 -Compress))
`;

interface Raw {
  pfn: string;
  loc: string;
  cfg: string | null;
  man: string | null;
}

function runScript(): Promise<Raw[]> {
  if (process.platform !== 'win32') return Promise.resolve([]);
  const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64');
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, timeout: 60000, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve([]);
        try {
          const v = JSON.parse(stdout || '[]') as Raw[] | Raw;
          resolve(Array.isArray(v) ? v : [v]);
        } catch {
          resolve([]);
        }
      },
    );
  });
}

const stripComments = (xml: string) => xml.replace(/<!--[\s\S]*?-->/g, '');
const attr = (tag: string | undefined, name: string) => tag?.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

/** Finds the real file for a package asset ("Resources\\Logo.png" may exist only as Logo.scale-200.png). */
function assetFile(root: string, rel: string | undefined): string | undefined {
  if (!rel) return undefined;
  const full = path.join(root, rel);
  if (fs.existsSync(full)) return full;
  const dir = path.dirname(full);
  const base = path.basename(full, path.extname(full)).toLowerCase();
  try {
    const hits = fs
      .readdirSync(dir)
      .filter((f) => f.toLowerCase().startsWith(base + '.') && /\.(png|jpe?g)$/i.test(f))
      .sort((a, b) => scale(b) - scale(a));
    return hits[0] ? path.join(dir, hits[0]) : undefined;
  } catch {
    return undefined;
  }
}
const scale = (f: string) => Number(/scale-(\d+)/i.exec(f)?.[1] ?? 100);

/** XboxGames folders listed in each drive's .GamingRoot file. */
function gamingRoots(): string[] {
  const roots: string[] = [];
  for (let c = 67; c <= 90; c++) {
    const drive = `${String.fromCharCode(c)}:\\`;
    try {
      const buf = fs.readFileSync(path.join(drive, '.GamingRoot'));
      // "RGBX" header, a count, then UTF-16 folder names.
      const text = buf.subarray(8).toString('utf16le').replace(/\0+$/, '');
      for (const p of text.split('\0').filter(Boolean)) roots.push(path.join(drive, p));
    } catch {
      // no gaming root on this drive
    }
  }
  return roots;
}

export function xboxGamingRoots(): string[] {
  return gamingRoots().filter((r) => fs.existsSync(r));
}

export async function readXboxGames(): Promise<XboxGame[]> {
  const raws = await runScript();
  const roots = xboxGamingRoots();
  const out: XboxGame[] = [];
  for (const r of raws) {
    if (!r?.pfn || !r.loc || !r.cfg) continue;
    const cfg = stripComments(r.cfg);
    const man = stripComments(r.man ?? '');
    const visuals = cfg.match(/<ShellVisuals\b[^>]*>/)?.[0];
    const appId = attr(man.match(/<Application\b[^>]*>/)?.[0], 'Id');
    if (!appId) continue;
    let name = attr(visuals, 'DefaultDisplayName') ?? '';
    if (!name || name.startsWith('ms-resource:')) name = man.match(/<DisplayName>([^<]*)<\/DisplayName>/)?.[1] ?? '';
    if (!name || name.startsWith('ms-resource:')) name = r.pfn.split('_')[0].replace(/^Microsoft\./, '');
    name = name.replace(/&amp;/g, '&').replace(/[®™]/g, '').trim();
    const exeNames = [...cfg.matchAll(/<Executable\b[^>]*>/g)].map((m) => attr(m[0], 'Name')).filter((n): n is string => !!n).map((n) => path.basename(n));
    const contentDir = roots.map((root) => path.join(root, name, 'Content')).find((d) => fs.existsSync(d));
    out.push({
      pfn: r.pfn,
      appId,
      name,
      installDir: r.loc,
      contentDir,
      exeNames: [...new Set(exeNames)],
      storeId: cfg.match(/<StoreId>([^<]+)<\/StoreId>/)?.[1]?.trim(),
      logoFile: assetFile(r.loc, attr(visuals, 'Square480x480Logo') ?? attr(visuals, 'Square150x150Logo') ?? attr(visuals, 'StoreLogo')),
      splashFile: assetFile(r.loc, attr(visuals, 'SplashScreenImage')),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Small local images become data URLs (the app's page can't load files straight from disk). */
export function fileToDataUrl(file: string | undefined, maxBytes = 1_500_000): string | undefined {
  if (!file) return undefined;
  try {
    const buf = fs.readFileSync(file);
    if (buf.length > maxBytes) return undefined;
    const type = /\.jpe?g$/i.test(file) ? 'image/jpeg' : 'image/png';
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch {
    return undefined;
  }
}

/** Starts a Store / Xbox app game the way the Start menu does. */
export function xboxLaunchTarget(g: Pick<XboxGame, 'pfn' | 'appId'>): string {
  return `shell:AppsFolder\\${g.pfn}!${g.appId}`;
}
