import { app } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { promises as fsp } from 'node:fs';
import path from 'node:path';

/**
 * Windows' own built-in text reader (Windows.Media.Ocr), run in one hidden PowerShell that stays open, so a
 * read costs ~50-100 ms instead of a process start. Offline; pictures are written to a temp file in userData
 * and deleted after reading. Used for big, clear HUD text (the held item's name, the rank screen); small
 * digits are read by ShotCaller's own shape matching instead (Windows' reader misses single digits).
 */

export interface OcrWord {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrLine {
  text: string;
  words: OcrWord[];
}

const SCRIPT = `
$ErrorActionPreference = 'Stop'
$parent = ${process.pid}
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics,ContentType=WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(); $task.Result }
$eng = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
[Console]::Out.WriteLine('{"ready":' + $(if ($eng) { 'true' } else { 'false' }) + '}')
[Console]::Out.Flush()
while ($true) {
  $path = [Console]::In.ReadLine()
  if ($path -eq $null) { exit }
  try {
    $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($path)) ([Windows.Storage.StorageFile])
    $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $dec = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bmp = Await ($dec.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $res = Await ($eng.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])
    $stream.Dispose()
    $lines = @($res.Lines | ForEach-Object { @{ t = $_.Text; w = @($_.Words | ForEach-Object { @{ t = $_.Text; x = [int]$_.BoundingRect.X; y = [int]$_.BoundingRect.Y; w = [int]$_.BoundingRect.Width; h = [int]$_.BoundingRect.Height } }) } })
    [Console]::Out.WriteLine((@{ ok = $true; lines = $lines } | ConvertTo-Json -Compress -Depth 6))
  } catch {
    [Console]::Out.WriteLine('{"ok":false}')
  }
  [Console]::Out.Flush()
}
`;

let child: ChildProcess | null = null;
let ready: Promise<boolean> | null = null;
let buffer = '';
let waiting: ((line: string | null) => void)[] = [];
let busy: Promise<unknown> = Promise.resolve();
let seq = 0;

function start(): Promise<boolean> {
  if (ready) return ready;
  ready = new Promise<boolean>((resolve) => {
    const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64');
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    child = ps;
    let first = true;
    ps.stdout?.setEncoding('utf8');
    ps.stdout?.on('data', (chunk: string) => {
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        if (first) {
          first = false;
          resolve(line.includes('true'));
          continue;
        }
        waiting.shift()?.(line);
      }
    });
    const down = () => {
      child = null;
      ready = null;
      buffer = '';
      for (const w of waiting) w(null);
      waiting = [];
      if (first) resolve(false);
    };
    ps.on('error', down);
    ps.on('exit', down);
  });
  return ready;
}

/** Reads the text in a PNG. Null when Windows' reader isn't available or the read failed/timed out. */
export function readText(png: Buffer, timeoutMs = 3000): Promise<OcrLine[] | null> {
  if (process.platform !== 'win32') return Promise.resolve(null);
  const run = async (): Promise<OcrLine[] | null> => {
    if (!(await start()) || !child?.stdin) return null;
    const file = path.join(app.getPath('userData'), 'ocr', `read-${process.pid}-${seq++ % 4}.png`);
    try {
      await fsp.mkdir(path.dirname(file), { recursive: true });
      await fsp.writeFile(file, png);
      const line = await new Promise<string | null>((resolve) => {
        const timer = setTimeout(() => {
          const i = waiting.indexOf(done);
          if (i >= 0) waiting.splice(i, 1);
          // A stuck read: restart the reader so the next one starts clean.
          child?.kill();
          resolve(null);
        }, timeoutMs);
        const done = (l: string | null) => {
          clearTimeout(timer);
          resolve(l);
        };
        waiting.push(done);
        child!.stdin!.write(`${file}\n`);
      });
      if (!line) return null;
      type RawWord = { t: string; x: number; y: number; w: number; h: number };
      const data = JSON.parse(line) as { ok: boolean; lines?: { t: string; w: RawWord[] | RawWord }[] | { t: string; w: RawWord[] | RawWord } };
      if (!data.ok) return null;
      // PowerShell's JSON turns a one-item list into the item itself.
      const list = <T,>(v: T[] | T | undefined): T[] => (Array.isArray(v) ? v : v ? [v] : []);
      return list(data.lines).map((l) => ({
        text: String(l.t ?? ''),
        words: list(l.w).map((w) => ({ text: String(w.t ?? ''), x: w.x, y: w.y, width: w.w, height: w.h })),
      }));
    } catch {
      return null;
    } finally {
      void fsp.rm(file, { force: true }).catch(() => undefined);
    }
  };
  // One read at a time: the reader answers in order.
  const p = busy.then(run, run);
  busy = p.catch(() => undefined);
  return p;
}

export function disposeOcr(): void {
  child?.stdin?.end();
  child?.kill();
  child = null;
  ready = null;
}
