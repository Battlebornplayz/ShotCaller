PHASE HANDOFF — ShotCaller — Phase D2 → Phase M1

Use the `phased-project` skill. You are starting Phase M1 (AI module maker: kit, modules and the make/edit tools).
At the end of this phase, write a new handoff in this same format for Phase M2 (and tell that chat to do the same),
so every phase hands off to the next. After M1-M2 comes Phase D3.

Project folder: D:\ShotCaller
Read first: PROJECT_PLAN.md ("Phase M1" and "Phase M2"), DESIGN.md ("AI module maker" rounds 1-2, M-Q1 to M-Q40, and "Phase D2 findings: Ask AI"), electron/ai/ (mcpServer.ts, tools.ts, dbdTools.ts, hubTools.ts, chat.ts, setup.ts), src/components/AiChat.tsx, games/dbd/index.ts (how a built-in module is declared).

## Project in one paragraph
ShotCaller is a polished Electron desktop app: a cross-game achievement hub plus per-game overlay modules (Skillshot City, paused; the Fortnite companion; Dead by Daylight), a Games tab that launches games from every store on the PC, and now Ask AI. Public MIT repo Battlebornplayz/ShotCaller, installed from GitHub Releases with a self-updating launcher (Stable/Beta). For the user and a friend. Stack: Electron + TypeScript + React 19 + electron-vite, electron-builder, electron-updater, uiohook-napi, koffi, @modelcontextprotocol/sdk.

## Done so far
- Phases 1-3, 5 done; Phase 4 dormant; Skillshot paused. Fortnite F1-F3 done, F4 built but its real-match check is paused (docs/handoff-fortnite-F4.md). Games tab L1 + L2 done.
- Phase D1 (v0.0.4-beta.23 "e23"): DbD module with Home, Builds, Catch-up, Killers, Maps, Stats, Options; wiki.gg data, Steam patch notes, build manager with share codes.
- Phase D2 (just finished, 2026-11-17, commit 5678a3e on branch `phaseD1/dbd-foundation`, released as v0.0.4-beta.24 "Ask AI"): Ask AI. One shared localhost MCP server (electron/ai/mcpServer.ts, port 47821) with tool sets registered per request: `games_` (library, playtime, running, achievements), `dbd_` (search, perks, killers, survivors, lists, catch-up, patch notes, builds; save/delete behind "Let the AI change things"), `fortnite_` (matches, live, stats, shop), `skillshot_`. `addToolSet()` is the hook for M1's AI modules. Two tokens (outside apps: saved, encrypted; chat: fresh each run). Settings → Ask AI: chat switch, AI picker (Claude Code / Antigravity), second-monitor chat, change-things switch, "Let AI apps connect" with "Set it up for me" for Claude Desktop (stdio bridge via ShotCaller's exe in Node mode), Claude Code and Antigravity. In-app chat (electron/ai/chat.ts) runs the signed-in CLI headless with its built-in tools off; it's on every page (Ask AI menu page, button on game pages, DbD tab, pop-out window). AI-made builds are marked "Made by AI".

## Phase M1 goal
The AI makes and edits ShotCaller modules on this PC through the D2 MCP server (all four AI tools: Claude Desktop, Claude Code, Antigravity, in-app chat).
Deliverables:
- Module format for AI modules in userData (manifest, data, kit layout, assets, storage), loaded beside the built-ins; per-module on/off; AI add-ons layered on top of built-in modules without changing them.
- The building-block kit (cards, lists, tables, timers, charts, checklists, links, notes) in the ShotCaller look, with own colours allowed; options page drawn from the module's option list.
- MCP tools (a new tool set via addToolSet): make module, edit module, list/read modules, suggest a game from the Games tab (user confirms), preview (errors + picture).
- "Let AI make modules" switch; every change shown first with Apply; full version history with restore; broken modules turned off with "Ask AI to fix".
- Share as file/code; import shows what the module can do before installing. Hub page, Home cards and second-monitor placements.
Done when:
- Through Claude Code and Antigravity, the AI makes a data/kit module for a game in the library, the user applies it, edits it, rolls it back, and shares it to a second install.
- Release a beta at the end (offer 3-4 name options first; tag's first line "ShotCaller eN (v0.0.4-beta.N)", annotated tag message = patch notes; ask before publishing).

## Decisions & constraints to respect
- **Ask AI stays free, no API keys (user).** Only the signed-in Claude Code / Antigravity CLIs and outside apps the user already has. Gemini CLI is gone for free accounts: use Antigravity (`agy`).
- In the chat, the AI's built-in tools stay off (Claude: `--tools ""`; Antigravity: `permissions.deny` for command/read_file/write_file/read_url/execute_url). Only ShotCaller tools.
- Code modules are M2, not M1 (M-Q1, M-Q4). M1 is data/kit modules only.
- **Never read a game's memory or touch its process**; never show what a game hides. Requests identify honestly as ShotCaller; never get around bot blocks.
- Every feature has its own on/off switch; ShotCaller navy/blue look, red only for danger/timers. Any over-game window needs `keepOutOfScreenCopies` in electron/windows.ts.
- Secrets live encrypted in userData (safeStorage); never in repo/settings/logs/chat.
- IPC pattern: channel in shared/ipc.ts, handler in electron/ipc.ts, bridge in electron/preload.ts, type in shared/types.ts. These files are LF in the working tree now (git converts on commit).
- Plain words in the UI and chat (user is not technical). Click-to-pick question widgets for any batch of questions. Never commit or push without the user's OK. Dev app: `npm.cmd run dev`; only one ShotCaller runs at a time (single-instance lock), so stop an old dev copy first.

## Loose ends / known issues
- Check that the v0.0.4-beta.24 GitHub release finished building (Windows installer attached) and that the installed app updates to it.
- Claude Desktop setup ("Set it up for me" / bridge) is built but not tested end to end.
- Ask AI switches were turned on in the user's own settings for testing (chat on, AI picked: Antigravity; outside apps on; change things on). Claude Code and Antigravity on this PC now have a `shotcaller` MCP entry.
- The DbD hub's own add-on lines may show the wiki's flavour text instead of the effect (D1 data quirk; AI tools already fixed). Check in D4.
- Branches `phaseF1/fortnite-foundation` and `phaseD1/dbd-foundation` are pushed but not merged to main; ask before merging.
- Fortnite F4 real-match check still paused (docs/handoff-fortnite-F4.md). D6 squad link waits for a second tester.

## How to start
1. Read the files above.
2. Confirm the Phase M1 goal with the user in 1-2 lines.
3. Begin.
