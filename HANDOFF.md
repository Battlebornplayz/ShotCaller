PHASE HANDOFF — ShotCaller — Phase D1 → Phase D2

Use the `phased-project` skill. You are starting Phase D2 (Dead by Daylight: Ask AI — MCP server and in-app chat).
At the end of this phase, write a new handoff in this same format for Phase D3
(and tell that chat to do the same), so every phase hands off to the next.

Project folder: D:\ShotCaller
Read first: PROJECT_PLAN.md ("Phase D", then "Phase D2" and "Phase D3"), DESIGN.md ("Ask AI" and "Phase D1 findings: data sources"), electron/skillshot/mcpServer.ts (the parked MCP server to grow), electron/dbd/index.ts, shared/dbd.ts, shared/dbdCatchup.ts, games/dbd/ (the DbD hub).

## Project in one paragraph
ShotCaller is a polished Electron desktop app: a cross-game achievement hub plus per-game overlay modules (Skillshot City, paused; the Fortnite companion; now Dead by Daylight), and a Games tab that launches games from every store on the PC. Public MIT repo Battlebornplayz/ShotCaller, installed from GitHub Releases with a self-updating launcher (Stable/Beta). For the user and a friend. Stack: Electron + TypeScript + React 19 + electron-vite, electron-builder, electron-updater, uiohook-napi, koffi.

## Done so far
- Phases 1-3, 5 done; Phase 4 dormant; Skillshot paused (its overlay got a beta.22 "e22" update from another chat). Fortnite F1-F3 done, F4 built but its real-match check is paused (docs/handoff-fortnite-F4.md). Games tab L1 + L2 done.
- Phase D design (2026-11-17): 51 answers in DESIGN.md, Phase D in six parts.
- Phase D1 (just finished, 2026-11-17, commit 1055dad on branch `phaseD1/dbd-foundation`, released as v0.0.4-beta.23 "e23"): DbD module (games/dbd/: DbdHub, DbdBuilds, DbdCatchup, dbdShared, builds.json) with Home, Builds, Catch-up, Killers, Maps, Stats (placeholder), Options and a survivor/killer switch. Main process in electron/dbd/: wiki.gg data (Lua modules + API dumps → data.json in userData/dbd, refreshed every 3 days or when DbD's Steam build changes), Steam news patch notes, icons over the `scdbd://` scheme cached on disk, settings/builds JSON, Steam last-played from localconfig.vdf, scales from GameUserSettings.ini. Shared types and share codes (DBD1-…) in shared/dbd.ts; catch-up maths in shared/dbdCatchup.ts. IPC: getDbd, getDbdData, updateDbd, saveDbdBuild, deleteDbdBuild, refreshDbd, getDbdNews, getDbdPopular. User checked it in the dev app.

## Phase D2 goal
Ask AI: one shared localhost-only ShotCaller MCP server, plus an in-app chat that uses the Claude Code or Gemini CLI already signed in on the PC.
Deliverables:
- Grow electron/skillshot/mcpServer.ts into one shared ShotCaller MCP server with tools per game; Settings shows copy-paste setup for Claude Desktop, Claude Code and Gemini CLI. Off by default, own switch.
- DbD tools: perk/killer/survivor/map lookup, catch-up ("what changed since I left"), list builds; save/edit builds behind a second "let AI change things" switch. Reuse getDbdData / computeCatchup / saveDbdBuild directly.
- In-app chat panel in the DbD hub (and a small one on the second monitor), off by default: runs the installed Claude Code CLI or Gemini CLI headless, wired to ShotCaller's MCP tools. If neither is installed, explain how to install and sign in. Check at the start how each CLI runs headless and how tool permissions are granted.
- Release a beta: v0.0.4-beta.24 unless something else goes first. Offer 3-4 name options first (default "e24"; tag's first line "ShotCaller eN (v0.0.4-beta.N)", annotated tag message = patch notes) and ask before publishing.
Done when:
- Claude Desktop (or Claude Code) and Gemini CLI both answer "make me a build against <killer>" through the MCP server and the build appears in the build manager; the in-app chat does the same through Claude Code and through Gemini CLI, with no API key.

## Decisions & constraints to respect
- **Ask AI must stay free, no API keys (user).** No API-key path at all.
- **Never read DbD's memory or touch its process** (EasyAntiCheat). Never show what the game hides.
- Requests to sites identify honestly as ShotCaller (USER_AGENT in electron/dbd/wiki.ts); never spoof a browser or get around bot blocks (nightlight.gg blocks apps: not used).
- Veteran player, no beginner content. Plain words in the UI and in chat (user is not technical).
- Every feature has its own on/off switch; ShotCaller navy/blue look, red only for danger/timers. Any new over-game window needs `keepOutOfScreenCopies` in electron/windows.ts.
- Secrets live encrypted in userData; never in repo/settings/logs/chat.
- IPC pattern: channel in shared/ipc.ts, handler in electron/ipc.ts, bridge in electron/preload.ts, type in shared/types.ts.
- CRLF files (shared/ipc.ts, shared/types.ts, electron/preload.ts, electron/main.ts, PHASE_LOG.md, others): edit with small Python scripts that keep each file's endings. `reports/`, `research_notes/`, `.claude/` stay untracked.
- Click-to-pick question widgets for any batch of questions. Never commit or push without the user's OK. Dev app: `npm.cmd run dev` (ask before quitting the installed app).

## Loose ends / known issues
- Branches `phaseF1/fortnite-foundation` and `phaseD1/dbd-foundation` are pushed but not merged to main; ask before merging. Until games/dbd/builds.json is on main, the app uses its bundled copy of the popular builds (the online update reads main).
- Catch-up start date: Steam says DbD was last played Oct 11, 2026 (a 15-min session); the user can change it on the Catch-up tab.
- Not checked in a real match: nothing in D1 needs a match. Not tested end to end: share codes between two PCs.
- Popular builds were written by hand (perk names checked against the data, not their current strength); worth a review.
- Fortnite F4 real-match check is still paused (docs/handoff-fortnite-F4.md). D6 squad link waits for a second tester.

## How to start
1. Read the files above.
2. Confirm the Phase D2 goal with the user in 1-2 lines.
3. Begin.
