import { app } from 'electron';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AiClient, AiClientSetup } from '../../shared/ai';
import { findCli, needsShell } from './clis';

/**
 * Setup for outside AI apps: the copy-paste snippet for each, and a "Set it up for me" that runs the app's own
 * "mcp add" command (Claude Code, Antigravity) or adds ShotCaller to Claude Desktop's config file (a backup of the
 * file is kept). The snippets hold the outside token, so they're only made while that connection is on.
 */

const NAME = 'shotcaller';

// ---------------------------------------------------------------------------------------------
// Claude Desktop only starts MCP servers as programs it talks to over stdin/stdout. This small bridge, run by
// ShotCaller's own exe in Node mode (no Node install needed), passes each message to the local server.

const BRIDGE = `// ShotCaller's MCP bridge for Claude Desktop (written by ShotCaller; safe to delete, it's rewritten when needed).
// Passes MCP messages between Claude Desktop (stdin/stdout) and ShotCaller's server, which only this PC can reach.
const http = require('http');
const readline = require('readline');
const token = process.env.SHOTCALLER_MCP_TOKEN || '';
const url = process.env.SHOTCALLER_MCP_URL || 'http://127.0.0.1:47821/mcp';
const out = (v) => process.stdout.write(JSON.stringify(v) + '\\n');
const idsOf = (m) => (Array.isArray(m) ? m : [m]).filter((x) => x && x.id !== undefined).map((x) => x.id);
const failAll = (m, message) => idsOf(m).forEach((id) => out({ jsonrpc: '2.0', id, error: { code: -32000, message } }));
let pending = 0;
let closed = false;
const done = () => { if (closed && pending === 0) process.exit(0); };
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const body = Buffer.from(line);
  pending++;
  const req = http.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: 'Bearer ' + token, 'Content-Length': body.length } }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim();
      try {
        if (text) {
          const j = JSON.parse(text);
          if (j && j.error && j.id === null) failAll(msg, j.error.message); else out(j);
        }
      } catch { failAll(msg, 'ShotCaller sent something unreadable.'); }
      pending--; done();
    });
  });
  req.on('error', () => { failAll(msg, "ShotCaller isn't running, or Ask AI is turned off in its Settings."); pending--; done(); });
  req.end(body);
}).on('close', () => { closed = true; done(); });
`;

const bridgePath = () => path.join(app.getPath('userData'), 'mcp-bridge.cjs');

function writeBridge(): string {
  const p = bridgePath();
  try {
    if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== BRIDGE) fs.writeFileSync(p, BRIDGE);
  } catch (e) {
    console.warn('[mcp] could not write the bridge:', e);
  }
  return p;
}

function desktopConfigFile(): string | null {
  const roaming = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
  const normal = path.join(roaming, 'Claude');
  if (fs.existsSync(normal)) return path.join(normal, 'claude_desktop_config.json');
  // The Microsoft Store version keeps its folder inside its package.
  const local = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
  try {
    const pkg = fs.readdirSync(path.join(local, 'Packages')).find((d) => /^Claude_/i.test(d));
    if (pkg) {
      const dir = path.join(local, 'Packages', pkg, 'LocalCache', 'Roaming', 'Claude');
      if (fs.existsSync(dir)) return path.join(dir, 'claude_desktop_config.json');
    }
  } catch {
    /* no packages folder */
  }
  return null;
}

function desktopEntry(url: string, token: string) {
  // ShotCaller's exe in Node mode. Installed builds keep the same path across updates.
  return {
    command: process.execPath,
    args: [writeBridge()],
    env: { ELECTRON_RUN_AS_NODE: '1', SHOTCALLER_MCP_URL: url, SHOTCALLER_MCP_TOKEN: token },
  };
}

const readJson = (file: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const hasServer = (file: string) => {
  const servers = readJson(file)?.mcpServers;
  return !!servers && typeof servers === 'object' && NAME in (servers as object);
};

// ---------------------------------------------------------------------------------------------

export function clientSetups(url: string, token: string): AiClientSetup[] {
  const home = os.homedir();
  const desktopFile = desktopConfigFile();
  const claude = findCli('claude');
  const agy = findCli('antigravity');
  return [
    {
      client: 'claude-desktop',
      name: 'Claude Desktop',
      installed: !!desktopFile,
      connected: !!desktopFile && hasServer(desktopFile),
      snippet: JSON.stringify({ mcpServers: { [NAME]: desktopEntry(url, token) } }, null, 2),
      snippetKind: 'json',
      file: desktopFile,
      steps:
        'Click "Set it up for me", then quit Claude Desktop from the tray and open it again. Or add this to Claude Desktop\'s config file (Settings → Developer → Edit Config).',
    },
    {
      client: 'claude-code',
      name: 'Claude Code',
      installed: !!claude,
      connected: hasServer(path.join(home, '.claude.json')),
      snippet: `claude mcp add --transport http --scope user ${NAME} ${url} --header "Authorization: Bearer ${token}"`,
      snippetKind: 'command',
      file: null,
      steps:
        'Click "Set it up for me", or run this once in a terminal. New Claude Code chats then have ShotCaller\'s tools.',
    },
    {
      client: 'antigravity',
      name: 'Antigravity (Google)',
      installed: !!agy,
      connected: hasServer(path.join(home, '.gemini', 'config', 'mcp_config.json')),
      snippet: `agy mcp add --header "Authorization: Bearer ${token}" ${NAME} ${url}`,
      snippetKind: 'command',
      file: null,
      steps:
        'Click "Set it up for me", or run this once in a terminal. New Antigravity chats then have ShotCaller\'s tools.',
    },
  ];
}

function run(exe: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    // A .cmd needs cmd.exe: quote each argument for it (the token and URL have no quotes or % in them).
    const shell = needsShell(exe);
    const a = shell ? args.map((x) => (/[\s"]/.test(x) ? `"${x}"` : x)) : args;
    execFile(
      shell ? `"${exe}"` : exe,
      a,
      { timeout: 30_000, windowsHide: true, shell },
      (err, stdout, stderr) => resolve({ ok: !err, out: `${stdout}${stderr}`.trim() }),
    );
  });
}

export async function connectClient(
  client: AiClient,
  url: string,
  token: string,
): Promise<{ ok: boolean; message: string }> {
  if (client === 'claude-desktop') {
    const file = desktopConfigFile();
    if (!file) return { ok: false, message: "Claude Desktop isn't installed on this PC." };
    const raw = fs.existsSync(file) ? readJson(file) : {};
    if (!raw)
      return {
        ok: false,
        message:
          "Claude Desktop's config file has a mistake in it, so ShotCaller left it alone. Use the copy button instead.",
      };
    try {
      if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.shotcaller-backup`);
      const servers =
        raw.mcpServers && typeof raw.mcpServers === 'object'
          ? (raw.mcpServers as Record<string, unknown>)
          : {};
      raw.mcpServers = { ...servers, [NAME]: desktopEntry(url, token) };
      fs.writeFileSync(file, JSON.stringify(raw, null, 2));
    } catch (e) {
      return {
        ok: false,
        message: `Couldn't change Claude Desktop's config: ${e instanceof Error ? e.message : e}`,
      };
    }
    return {
      ok: true,
      message: 'Added. Quit Claude Desktop (right-click its tray icon → Quit) and open it again.',
    };
  }
  if (client === 'claude-code') {
    const exe = findCli('claude');
    if (!exe) return { ok: false, message: "Claude Code isn't installed on this PC." };
    // Replaces an older ShotCaller entry (e.g. with an old token).
    await run(exe, ['mcp', 'remove', '--scope', 'user', NAME]);
    const r = await run(exe, [
      'mcp',
      'add',
      '--transport',
      'http',
      '--scope',
      'user',
      NAME,
      url,
      '--header',
      `Authorization: Bearer ${token}`,
    ]);
    return r.ok
      ? { ok: true, message: 'Added. Start a new Claude Code chat to use it.' }
      : { ok: false, message: `Claude Code said: ${r.out.slice(0, 300)}` };
  }
  const exe = findCli('antigravity');
  if (!exe) return { ok: false, message: "Antigravity isn't installed on this PC." };
  const r = await run(exe, ['mcp', 'add', '--header', `Authorization: Bearer ${token}`, NAME, url]);
  return r.ok
    ? { ok: true, message: 'Added. Start a new Antigravity chat to use it.' }
    : { ok: false, message: `Antigravity said: ${r.out.slice(0, 300)}` };
}
