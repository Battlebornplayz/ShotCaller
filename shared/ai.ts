/**
 * Ask AI (Phase D2): ShotCaller's local MCP server and the in-app chat.
 *
 * The chat runs an AI command-line tool the user already has installed and signed in on this PC (Claude Code, or
 * Google's Antigravity CLI), so it costs nothing extra and needs no API key. Both are connected to ShotCaller's own
 * MCP server, which only this PC can reach.
 */

/** Which AI the in-app chat runs. Gemini CLI was replaced by Antigravity CLI for free Google accounts (June 2026). */
export type AiProvider = 'claude' | 'antigravity';

export const AI_PROVIDER_NAMES: Record<AiProvider, string> = { claude: 'Claude Code', antigravity: 'Antigravity (Google)' };

/** The apps the setup instructions cover. */
export type AiClient = 'claude-code' | 'claude-desktop' | 'antigravity';

export interface AiClientSetup {
  client: AiClient;
  name: string;
  /** Found on this PC. */
  installed: boolean;
  /** ShotCaller already appears in its MCP settings (best guess from its config file). */
  connected: boolean;
  /** What to paste: a terminal command, or a JSON block for a config file. Holds the secret token. */
  snippet: string;
  snippetKind: 'command' | 'json';
  /** Where the JSON goes, for config files. */
  file: string | null;
  /** One or two plain sentences. */
  steps: string;
}

export interface McpInfo {
  running: boolean;
  url: string;
  /** Why it isn't running, when it should be. */
  error: string | null;
  /** Set-up for each AI app. Empty while the outside connection is off (the snippets hold the token). */
  clients: AiClientSetup[];
}

/** One installed AI command-line tool, as found on this PC. */
export interface AiCliInfo {
  provider: AiProvider;
  installed: boolean;
  path: string | null;
  version: string | null;
  /** Null = not known until the first message. */
  signedIn: boolean | null;
}

export interface AiToolCall {
  id: string;
  /** ShotCaller's tool name, without the client's prefix (e.g. "dbd_save_build"). */
  name: string;
  /** A short plain line of what it did, e.g. "Looked up Hex: Pentimento". */
  label: string;
  done: boolean;
  error: boolean;
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'notice';
  text: string;
  at: number;
  /** Assistant messages: ShotCaller tools it used while answering. */
  tools?: AiToolCall[];
  provider?: AiProvider;
}

export interface AiChatState {
  provider: AiProvider;
  messages: AiChatMessage[];
  busy: boolean;
  /** Plain words for the last problem, e.g. "Claude Code isn't signed in". */
  error: string | null;
  /** What to do about the error, if there's a fix. */
  fix: 'install' | 'sign-in' | 'turn-on' | null;
  /** Builds changed by the AI in this chat (ids), so the hub can point at them. */
  changedBuilds: string[];
}

export const EMPTY_AI_CHAT: AiChatState = { provider: 'claude', messages: [], busy: false, error: null, fix: null, changedBuilds: [] };

/** Install and sign-in help shown when a CLI is missing. */
export const AI_INSTALL_HELP: Record<AiProvider, { install: string; signIn: string; page: string }> = {
  claude: {
    install: 'irm https://claude.ai/install.ps1 | iex',
    signIn: 'Then type claude in a terminal and sign in with your Claude account (Pro or Max plan).',
    page: 'https://code.claude.com/docs/en/setup',
  },
  antigravity: {
    install: 'irm https://antigravity.google/cli/install.ps1 | iex',
    signIn: 'Then type agy in a terminal and sign in with your Google account (free).',
    page: 'https://antigravity.google/docs',
  },
};
