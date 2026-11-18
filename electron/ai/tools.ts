import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * A group of MCP tools for one game (or, from Phase M1, one AI-made module). The shared server asks every set that
 * is available to register its tools on each request, so a set can come and go (a game installed, a switch
 * flipped) without restarting anything.
 */
export interface ToolSet {
  /** Short id; tool names in the set start with it ("dbd_", "skillshot_"). */
  id: string;
  /** A paragraph for the server's instructions to the AI. */
  instructions: string;
  /** False hides the whole set (e.g. the game isn't installed). */
  available(): boolean;
  register(mcp: McpServer, ctx: ToolContext): void;
}

export interface ToolContext {
  /** "Let the AI change things" is on: register the tools that change ShotCaller's data. */
  allowActions: boolean;
  /** Who's calling: an outside AI app, or ShotCaller's own chat. */
  caller: 'outside' | 'chat';
}

/** Clients give up on a call after about a minute, so a long wait comes back and is called again. */
export const MAX_WAIT_SECONDS = 55;

export const json = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 1) }],
});
export const fail = (message: string) => ({
  isError: true,
  content: [{ type: 'text' as const, text: message }],
});
