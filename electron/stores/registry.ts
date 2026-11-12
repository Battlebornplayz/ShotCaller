import { execFile } from 'node:child_process';

/**
 * One read of the Windows registry for the smaller stores (Phase L2): the "Installed apps" list
 * plus the keys GOG, Ubisoft and Rockstar keep for their games. One PowerShell run per scan.
 * Read-only.
 */

export interface UninstallEntry {
  key: string;
  name: string;
  dir?: string;
  uninstall?: string;
  icon?: string;
  publisher?: string;
  /** EstimatedSize, in KB. */
  sizeKb?: number;
}

export interface RegistrySnapshot {
  apps: UninstallEntry[];
  gog: { id: string; name: string; path?: string; exe?: string; params?: string; workDir?: string; dependsOn?: string }[];
  galaxyClient?: string;
  ubisoft: { id: string; dir?: string }[];
  ubisoftLauncher?: string;
  rockstar: { key: string; dir?: string }[];
  rockstarLauncher?: string;
}

const SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
function Val($p, $n) { $v = (Get-ItemProperty -LiteralPath $p -Name $n).$n; if ($null -eq $v) { $null } else { [string]$v } }
$apps = @()
foreach ($root in 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall','HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall','HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall') {
  foreach ($k in Get-ChildItem -LiteralPath $root) {
    $p = Get-ItemProperty -LiteralPath $k.PSPath
    if (-not $p.DisplayName) { continue }
    $apps += [pscustomobject]@{ key = $k.PSChildName; name = [string]$p.DisplayName; dir = [string]$p.InstallLocation; uninstall = [string]$p.UninstallString; icon = [string]$p.DisplayIcon; publisher = [string]$p.Publisher; sizeKb = $p.EstimatedSize }
  }
}
$gog = @()
foreach ($k in Get-ChildItem -LiteralPath 'HKLM:\\SOFTWARE\\WOW6432Node\\GOG.com\\Games') {
  $p = Get-ItemProperty -LiteralPath $k.PSPath
  $gog += [pscustomobject]@{ id = [string]$p.gameID; name = [string]$p.gameName; path = [string]$p.path; exe = [string]$p.exe; params = [string]$p.launchParam; workDir = [string]$p.workingDir; dependsOn = [string]$p.dependsOn }
}
$galaxy = Val 'HKLM:\\SOFTWARE\\WOW6432Node\\GOG.com\\GalaxyClient\\paths' 'client'
$ubi = @()
foreach ($k in Get-ChildItem -LiteralPath 'HKLM:\\SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher\\Installs') {
  $ubi += [pscustomobject]@{ id = $k.PSChildName; dir = Val $k.PSPath 'InstallDir' }
}
$ubiDir = Val 'HKLM:\\SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher' 'InstallDir'
$rs = @()
foreach ($k in Get-ChildItem -LiteralPath 'HKLM:\\SOFTWARE\\WOW6432Node\\Rockstar Games') {
  $rs += [pscustomobject]@{ key = $k.PSChildName; dir = Val $k.PSPath 'InstallFolder' }
}
$out = [pscustomobject]@{ apps = $apps; gog = $gog; galaxyClient = $galaxy; ubisoft = $ubi; ubisoftLauncher = $ubiDir; rockstar = $rs }
[Console]::Out.Write((ConvertTo-Json -InputObject $out -Depth 4 -Compress))
`;

const EMPTY: RegistrySnapshot = { apps: [], gog: [], ubisoft: [], rockstar: [] };

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v : v && typeof v === 'object' ? [v as Record<string, unknown>] : []);

/** Strips quotes and a trailing ",0" icon index from a registry path. */
export function cleanRegPath(p: string | undefined): string | undefined {
  if (!p) return undefined;
  const v = p.replace(/,\s*-?\d+$/, '').replace(/^"+|"+$/g, '').trim();
  return v || undefined;
}

export function readRegistry(): Promise<RegistrySnapshot> {
  if (process.platform !== 'win32') return Promise.resolve(EMPTY);
  const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64');
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, timeout: 60000, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve(EMPTY);
        try {
          const v = JSON.parse(stdout || '{}') as Record<string, unknown>;
          const size = (x: unknown) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : undefined);
          resolve({
            apps: arr(v.apps)
              .map((a) => ({
                key: String(a.key ?? ''),
                name: String(a.name ?? ''),
                dir: cleanRegPath(str(a.dir)),
                uninstall: str(a.uninstall),
                icon: cleanRegPath(str(a.icon)),
                publisher: str(a.publisher),
                sizeKb: size(a.sizeKb),
              }))
              .filter((a) => a.name),
            gog: arr(v.gog)
              .map((g) => ({
                id: String(g.id ?? ''),
                name: String(g.name ?? ''),
                path: str(g.path),
                exe: str(g.exe),
                params: str(g.params),
                workDir: str(g.workDir),
                dependsOn: str(g.dependsOn),
              }))
              .filter((g) => g.id && g.name),
            galaxyClient: str(v.galaxyClient),
            ubisoft: arr(v.ubisoft)
              .map((u) => ({ id: String(u.id ?? ''), dir: cleanRegPath(str(u.dir)) }))
              .filter((u) => u.id),
            ubisoftLauncher: str(v.ubisoftLauncher),
            rockstar: arr(v.rockstar)
              .map((r) => ({ key: String(r.key ?? ''), dir: cleanRegPath(str(r.dir)) }))
              .filter((r) => r.key),
          });
        } catch {
          resolve(EMPTY);
        }
      },
    );
  });
}
