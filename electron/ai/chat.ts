import { app } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  AI_PROVIDER_NAMES,
  EMPTY_AI_CHAT,
  type AiChatMessage,
  type AiChatState,
  type AiProvider,
  type AiToolCall,
} from '../../shared/ai';
import { getSettings } from '../settings';
import { findCli, needsShell, noteSignIn } from './clis';
import { onAiSavedBuild } from './dbdTools';
import { getChatToken, mcpUrl, mcpServerError } from './mcpServer';

/**
 * The in-app Ask AI chat (Phase D2). Free, no API key: each message runs the AI command-line tool the user already
 * has signed in on this PC, in its one-shot ("print") mode, connected to ShotCaller's MCP server with the chat's
 * own token. Its built-in tools (commands, files, web) are turned off, so the only things it can use are
 * ShotCaller's tools. The conversation continues through the tool's own conversation id.
 *
 * Claude Code: claude -p, stream-json, --tools "" (no built-ins), --strict-mcp-config with only ShotCaller,
 *   --allowedTools mcp__shotcaller, --setting-sources "" (the user's own settings and hooks don't run).
 * Antigravity: agy -p with stream-json in and out, --settings that deny commands/files/web and allow ShotCaller's
 *   MCP tools; the MCP server is listed in the chat folder's .agents/mcp_config.json.
 */

/** A line of a CLI's JSON output: its shape is the CLI's, and changes between versions. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ev = Record<string, any>;

const RUN_LIMIT_MS = 5 * 60_000;
const MAX_MESSAGES = 200;

const CHAT_PROMPT = `You are Ask AI inside ShotCaller, a game companion app on the player's PC (game library, achievements, and helpers for Dead by Daylight, Fortnite and Skillshot City). Each message starts with the ShotCaller page the player is on, in brackets: use it as context, not as something to answer.
- Use ShotCaller's tools to check facts (games_ for the library and achievements, dbd_, fortnite_, skillshot_ for each game) and to save things. You have no other tools: you can't run commands, read files or browse.
- Replies show in a small chat panel: keep them short (a few lines or a short list), plain words, basic Markdown only (bold, lists). No tables, no headings.
- When asked for a Dead by Daylight build: look the perks up, save it with dbd_save_build and give one line per perk on why. If a tool that changes things isn't available, give the answer in chat and say they can turn on "Let the AI change things" in ShotCaller's Settings → Ask AI.`;

let state: AiChatState = { ...EMPTY_AI_CHAT, provider: getProviderSafe() };
let child: ChildProcess | null = null;
let stopTimer: NodeJS.Timeout | null = null;
/** Conversation ids, per AI, so the chat continues where it was. */
const conversation: Partial<Record<AiProvider, string>> = {};
const listeners = new Set<(s: AiChatState) => void>();

function getProviderSafe(): AiProvider {
  try {
    return getSettings().mcp.provider;
  } catch {
    return 'claude';
  }
}

export function getAiChat(): AiChatState {
  return state;
}

export function onAiChat(fn: (s: AiChatState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function set(patch: Partial<AiChatState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l(state);
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function push(msg: Omit<AiChatMessage, 'id' | 'at'>): AiChatMessage {
  const m: AiChatMessage = { id: newId(), at: Date.now(), ...msg };
  set({ messages: [...state.messages, m].slice(-MAX_MESSAGES) });
  return m;
}

function patchMessage(id: string, fn: (m: AiChatMessage) => AiChatMessage): void {
  set({ messages: state.messages.map((m) => (m.id === id ? fn(m) : m)) });
}

// The DbD tools tell the chat about builds it saved, so the panel can link to them.
onAiSavedBuild((id) => set({ changedBuilds: [...new Set([...state.changedBuilds, id])] }));

// ---------------------------------------------------------------------------------------------
// Plain labels for the tools the AI used

function toolLabel(name: string, a: Record<string, unknown>): string {
  const q = (k: string) => (typeof a[k] === 'string' ? (a[k] as string) : '');
  switch (name) {
    case 'dbd_search':
      return `Searched “${q('query')}”`;
    case 'dbd_get_perk':
      return `Read ${q('name')}`;
    case 'dbd_get_killer':
      return `Read killer ${q('name')}`;
    case 'dbd_get_survivor':
      return `Read survivor ${q('name')}`;
    case 'dbd_list_perks':
      return `Listed ${q('side')} perks${q('tag') ? ` (${q('tag')})` : ''}`;
    case 'dbd_list':
      return `Listed ${q('kind')}`;
    case 'dbd_catch_up':
      return 'Checked what changed since you played';
    case 'dbd_patch_notes':
      return 'Read patch notes';
    case 'dbd_list_builds':
      return 'Looked at your builds';
    case 'dbd_save_build':
      return `${q('id') ? 'Changed' : 'Saved'} build “${q('name')}”`;
    case 'dbd_delete_build':
      return 'Deleted a build';
    case 'dbd_status':
      return 'Checked your DbD info';
    case 'games_list':
      return 'Looked at your games';
    case 'games_now_playing':
      return 'Checked what’s running';
    case 'games_achievements':
      return `Read achievements: ${q('game')}`;
    case 'games_recent_unlocks':
      return 'Looked at recent unlocks';
    case 'fortnite_matches':
      return 'Read your Fortnite matches';
    case 'fortnite_live':
      return 'Checked the live match';
    case 'fortnite_stats':
      return 'Read your Fortnite stats';
    case 'fortnite_shop':
      return 'Read the item shop';
    default:
      return name.replace(/^skillshot_/, 'Skillshot: ').replace(/_/g, ' ');
  }
}

/** "mcp__shotcaller__dbd_search" / "mcp_shotcaller_dbd_search" → "dbd_search". */
const shortName = (n: string) => n.replace(/^mcp__shotcaller__/, '').replace(/^mcp_shotcaller_/, '');

// ---------------------------------------------------------------------------------------------
// Files in the chat folder (rewritten each run: the chat token changes every time ShotCaller starts)

const chatDir = () => path.join(app.getPath('userData'), 'ai-chat');

function writeChatFiles(): { claudeMcp: string; claudePrompt: string; agySettings: string } {
  const dir = chatDir();
  fs.mkdirSync(path.join(dir, '.agents'), { recursive: true });
  const headers = { Authorization: `Bearer ${getChatToken()}` };
  const claudeMcp = path.join(dir, 'claude-mcp.json');
  fs.writeFileSync(
    claudeMcp,
    JSON.stringify({ mcpServers: { shotcaller: { type: 'http', url: mcpUrl(), headers } } }),
  );
  const claudePrompt = path.join(dir, 'claude-prompt.txt');
  fs.writeFileSync(claudePrompt, CHAT_PROMPT);
  // Antigravity reads MCP servers from the workspace's .agents folder.
  fs.writeFileSync(
    path.join(dir, '.agents', 'mcp_config.json'),
    JSON.stringify({ mcpServers: { shotcaller: { serverUrl: mcpUrl(), headers } } }),
  );
  const agySettings = path.join(dir, 'agy-settings.json');
  fs.writeFileSync(
    agySettings,
    JSON.stringify({
      permissions: {
        allow: ['mcp(shotcaller/*)'],
        deny: ['command(*)', 'write_file(*)', 'read_file(*)', 'read_url(*)', 'execute_url(*)'],
      },
      trustedWorkspaces: [dir],
    }),
  );
  return { claudeMcp, claudePrompt, agySettings };
}

// ---------------------------------------------------------------------------------------------
// Running one turn

const SIGN_IN =
  /not logged in|please run \/login|\/login|log ?in again|authentication required|authenticat(e|ion) failed|invalid api key|oauth token|not eligible|eligibility check|verify your account/i;

function friendlyError(provider: AiProvider, raw: string): { error: string; fix: AiChatState['fix'] } {
  const name = AI_PROVIDER_NAMES[provider];
  if (SIGN_IN.test(raw)) {
    noteSignIn(provider, false);
    if (/eligib|verify your account/i.test(raw))
      return {
        error: `Google wants your account checked before ${name} works. Click Sign in, then follow the link it shows.`,
        fix: 'sign-in',
      };
    return { error: `${name} isn't signed in on this PC.`, fix: 'sign-in' };
  }
  if (/usage limit|rate limit|quota|limit reached|resets/i.test(raw))
    return { error: `${name} says you've hit your usage limit for now. ${raw.slice(0, 160)}`, fix: null };
  return { error: `${name} stopped with a problem: ${raw.slice(0, 300) || 'no details'}`, fix: null };
}

function finish(): void {
  if (stopTimer) clearTimeout(stopTimer);
  stopTimer = null;
  child = null;
  set({ busy: false });
}

function kill(p: ChildProcess | null): void {
  if (!p?.pid) return;
  if (process.platform === 'win32')
    spawn('taskkill', ['/pid', String(p.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
  else p.kill();
}

export function stopAiChat(): void {
  if (!child) return;
  kill(child);
  push({ role: 'notice', text: 'Stopped.' });
  finish();
}

export function resetAiChat(): void {
  stopAiChat();
  delete conversation.claude;
  delete conversation.antigravity;
  set({ messages: [], error: null, fix: null, changedBuilds: [] });
}

export async function sendAiChat(raw: string, page?: string): Promise<void> {
  const msg = raw.trim().slice(0, 4000);
  if (!msg || child) return;
  const s = getSettings().mcp;
  if (!s.chat) return set({ error: 'Ask AI chat is turned off.', fix: 'turn-on' });
  const provider = s.provider;
  if (state.provider !== provider) set({ provider });
  const exe = findCli(provider);
  if (!exe)
    return set({ error: `${AI_PROVIDER_NAMES[provider]} isn't installed on this PC.`, fix: 'install' });
  const serverErr = mcpServerError();
  if (serverErr) return set({ error: `ShotCaller's AI connection couldn't start: ${serverErr}`, fix: null });

  set({ error: null, fix: null, busy: true });
  push({ role: 'user', text: msg });
  const reply = push({ role: 'assistant', text: '', tools: [], provider });

  let files: ReturnType<typeof writeChatFiles>;
  try {
    files = writeChatFiles();
  } catch (e) {
    patchMessage(reply.id, (m) => ({ ...m, text: '' }));
    set({ error: `Couldn't prepare the chat folder: ${e instanceof Error ? e.message : e}` });
    return finish();
  }

  const conv = conversation[provider];
  // The page the player is on, as context for the AI (not shown in the chat).
  const where =
    (page ?? '')
      .replace(/[[\]\n]/g, ' ')
      .trim()
      .slice(0, 60) || 'Home';
  const toAi = `[Page: ${where}]\n${msg}`;
  const args =
    provider === 'claude'
      ? [
          '-p',
          '--output-format',
          'stream-json',
          '--verbose',
          '--include-partial-messages',
          '--tools',
          '',
          '--mcp-config',
          files.claudeMcp,
          '--strict-mcp-config',
          '--allowedTools',
          'mcp__shotcaller',
          '--setting-sources',
          '',
          '--append-system-prompt-file',
          files.claudePrompt,
          '--disable-slash-commands',
          ...(conv ? ['--resume', conv] : []),
        ]
      : [
          '--output-format',
          'stream-json',
          '--settings',
          files.agySettings,
          '--disable-slash-commands',
          ...(conv ? ['--conversation', conv] : []),
          // Joined to the flag so a message starting with "-" isn't read as an option. Antigravity has no
          // system-prompt option: the first message of a conversation carries the chat's ground rules.
          `--print=${conv ? toAi : `${CHAT_PROMPT}\n\n${toAi}`}`,
        ];

  // Claude Code reads the message from stdin; Antigravity has it in its arguments.
  const input = provider === 'claude' ? toAi : '';

  const shell = needsShell(exe);
  let p: ChildProcess;
  try {
    p = spawn(
      shell ? `"${exe}"` : exe,
      shell ? args.map((a) => (a === '' ? '""' : /[\s"]/.test(a) ? `"${a}"` : a)) : args,
      {
        cwd: chatDir(),
        windowsHide: true,
        shell,
        env: { ...process.env, NO_COLOR: '1' },
      },
    );
  } catch (e) {
    set({ error: `Couldn't start ${AI_PROVIDER_NAMES[provider]}: ${e instanceof Error ? e.message : e}` });
    return finish();
  }
  child = p;
  stopTimer = setTimeout(() => {
    if (child !== p) return;
    kill(p);
    push({ role: 'notice', text: 'That took more than 5 minutes, so ShotCaller stopped it.' });
    finish();
  }, RUN_LIMIT_MS);

  let text = '';
  let errText = '';
  let ok = false;
  const tools: AiToolCall[] = [];
  const show = () => patchMessage(reply.id, (m) => ({ ...m, text, tools: [...tools] }));
  const addText = (t: string, newBlock: boolean) => {
    if (newBlock && text && !text.endsWith('\n')) text += '\n\n';
    text += t;
    show();
  };
  const toolStart = (id: string, rawName: string, input: Record<string, unknown>) => {
    const name = shortName(rawName);
    const known = tools.find((t) => t.id === id);
    if (known) {
      // Antigravity sends a tool's arguments in a later update than its name.
      if (Object.keys(input).length && known.name === name) {
        known.label = toolLabel(name, input);
        show();
      }
      return;
    }
    // Only ShotCaller's own tools are shown (the AI's built-ins are turned off or denied anyway).
    if (!/^(games|dbd|fortnite|skillshot)_/.test(name)) return;
    tools.push({ id, name, label: toolLabel(name, input), done: false, error: false });
    show();
  };
  const toolEnd = (id: string, error: boolean) => {
    const t = tools.find((x) => x.id === id);
    if (t) {
      t.done = true;
      t.error = error;
      show();
    }
  };

  let sawDeltas = false;
  let blockIsText = false;
  const onClaude = (e: Ev) => {
    if (e.type === 'system' && e.subtype === 'init' && typeof e.session_id === 'string')
      conversation.claude = e.session_id;
    else if (e.type === 'stream_event') {
      const ev = e.event ?? {};
      if (ev.type === 'content_block_start') blockIsText = ev.content_block?.type === 'text';
      if (ev.type === 'content_block_start' && ev.content_block?.type === 'text' && text) addText('', true);
      if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && blockIsText) {
        sawDeltas = true;
        addText(ev.delta.text ?? '', false);
      }
    } else if (e.type === 'assistant') {
      for (const c of e.message?.content ?? []) {
        if (c.type === 'tool_use') toolStart(c.id, c.name, c.input ?? {});
        else if (c.type === 'text' && !sawDeltas && c.text) addText(c.text, true);
      }
    } else if (e.type === 'user') {
      for (const c of e.message?.content ?? [])
        if (c.type === 'tool_result') toolEnd(c.tool_use_id, !!c.is_error);
    } else if (e.type === 'result') {
      if (typeof e.session_id === 'string') conversation.claude = e.session_id;
      if (e.is_error || e.subtype !== 'success') errText = String(e.result ?? e.subtype ?? 'error');
      else {
        ok = true;
        if (!text && typeof e.result === 'string') addText(e.result, false);
      }
    }
  };

  const onAgy = (e: Ev) => {
    const id =
      e.conversation_id ??
      e.init?.conversation_id ??
      e.step_update?.conversation_id ??
      e.result?.conversation_id;
    if (typeof id === 'string' && id) conversation.antigravity = id;
    if (e.event === 'step_update') {
      const st = e.step_update ?? {};
      if (st.step_type === 'agent_response' && typeof st.text_delta === 'string')
        addText(st.text_delta, false);
      else if (st.step_type === 'tool') {
        const info = st.tool_info ?? {};
        const params = (info.parameters ?? {}) as Ev;
        // Lazy MCP tools go through call_mcp_tool { ServerName, ToolName, Arguments }.
        const name = params.ToolName ? String(params.ToolName) : String(st.tool_name ?? info.name ?? 'tool');
        let input = (params.Arguments ?? params) as Record<string, unknown>;
        if (typeof input === 'string')
          try {
            input = JSON.parse(input);
          } catch {
            input = {};
          }
        const key = `${st.step_index ?? name}`;
        toolStart(key, name, input ?? {});
        if (st.state === 'DONE' || st.state === 'ERROR') toolEnd(key, st.state === 'ERROR' || !!info.error);
      }
    } else if (e.event === 'result') {
      const r = e.result ?? {};
      if (r.status === 'SUCCESS') {
        ok = true;
        if (!text && typeof r.response === 'string') addText(r.response, false);
      } else errText = String(r.error ?? r.status ?? 'error');
    }
  };

  let buf = '';
  p.stdout?.setEncoding('utf8');
  p.stdout?.on('data', (chunk: string) => {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      if (!line.startsWith('{')) {
        errText += `${line}\n`;
        // Antigravity waits for a sign-in code when it isn't signed in: don't leave it hanging.
        if (SIGN_IN.test(line)) kill(p);
        continue;
      }
      try {
        const e = JSON.parse(line) as Ev;
        if (provider === 'claude') onClaude(e);
        else onAgy(e);
      } catch {
        /* a partial or odd line */
      }
    }
  });
  p.stderr?.setEncoding('utf8');
  p.stderr?.on('data', (chunk: string) => {
    errText += chunk;
    if (SIGN_IN.test(chunk)) kill(p);
  });
  p.on('error', (e) => {
    errText += e.message;
  });
  p.on('close', (code) => {
    if (child !== p) return; // Stopped or timed out: already handled.
    if (ok) noteSignIn(provider, true);
    else if (code !== 0 || errText) {
      const f = friendlyError(provider, errText.trim() || `exit code ${code}`);
      set({ error: f.error, fix: f.fix });
    }
    if (!text && !tools.length) set({ messages: state.messages.filter((m) => m.id !== reply.id) });
    finish();
  });

  p.stdin?.on('error', () => {
    /* it closed early */
  });
  p.stdin?.end(input);
}

/** The provider was changed in Settings: a fresh conversation with the new AI. */
export function aiProviderChanged(): void {
  stopAiChat();
  const provider = getSettings().mcp.provider;
  if (state.provider !== provider) {
    set({ provider, error: null, fix: null });
    if (state.messages.length)
      push({
        role: 'notice',
        text: `Switched to ${AI_PROVIDER_NAMES[provider]}. It starts a new conversation.`,
      });
  }
}
