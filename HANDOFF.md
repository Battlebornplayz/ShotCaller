PHASE HANDOFF — ShotCaller — Phase M1 → Phase M2

Use the `phased-project` skill. You are starting Phase M2 (AI module maker: code, screen reading and live tools).
At the end of this phase, write a new handoff in this same format for Phase M3 (and tell that chat to do the same),
so every phase hands off to the next. After M1-M3 comes Phase D3.

Project folder: D:\ShotCaller
Read first: PROJECT_PLAN.md ("Phase M2" and "Phase M3"), DESIGN.md ("AI module maker" rounds 1-3, M-Q1 to M-Q50, and "Phase M1 findings"), shared/modules.ts (format, kit, checker, edits, diff), electron/modules/ (store.ts, preview.ts, ipc.ts), electron/ai/moduleTools.ts, src/modules/ (blocks.tsx, ModuleView.tsx, ModulesPage.tsx, Placements.tsx, PreviewApp.tsx), electron/ai/mcpServer.ts.

## Project in one paragraph
ShotCaller is a polished Electron desktop app: a cross-game achievement hub plus per-game overlay modules (Skillshot City, paused; the Fortnite companion; Dead by Daylight), a Games tab that launches games from every store on the PC, Ask AI (local MCP server + in-app chat through the signed-in Claude Code / Antigravity CLIs), and now AI-made modules. Public MIT repo Battlebornplayz/ShotCaller, installed from GitHub Releases with a self-updating launcher (Stable/Beta). For the user and a friend. Stack: Electron + TypeScript + React 19 + electron-vite, electron-builder, electron-updater, uiohook-napi, koffi, @modelcontextprotocol/sdk, zod.

## Done so far
- Phases 1-3, 5 done; Phase 4 dormant; Skillshot paused. Fortnite F1-F3 done, F4 built but its real-match check is paused (docs/handoff-fortnite-F4.md). Games tab L1 + L2 done. DbD D1 (beta.23) and D2 Ask AI (beta.24) done.
- Phase M1 (just finished, 2026-11-18, on branch `phaseD1/dbd-foundation`, NOT committed or released yet): data/kit AI modules. One JSON doc per module in userData/modules/<id>/ with versions, storage, assets and an error log. The AI only makes waiting changes (proposals): the player looks at them side by side and clicks Apply. Mistake checker, offscreen preview with a picture, saved tests, 32 kit blocks, options page, tour, templates, permissions per module, share code/file with a look-first import (updates keep the friend's data; locked shares), backup/restore, safe mode, AI log, "Ask AI to fix" for broken modules. Shows on the Modules page (menu), the game page, as add-ons under built-in hubs, as Home cards and in a second-monitor window. MCP tool set `modules_` (behind "Let AI make modules"). Tests: `npm.cmd run test:modules` (12). Checked end to end with Claude Code and Antigravity (Palworld module: made, edited, applied, rolled back, shared to a second install).

## Phase M2 goal
Code modules and live tools (see PROJECT_PLAN.md "Phase M2").
Deliverables:
- Code modules behind their own switch, in a sealed box with only approved ShotCaller tools; AI-made blocks other AI modules can reuse; outside libraries from an approved list.
- Live tools: hotkeys (clash-checked, rebindable), sounds, corner popups (per-module mute), full timer tool, events (game start/close, match start/end, achievement, hotkey, screen result), run while its game runs or on an allowed schedule; open when its game starts, reset/timed reminders, Windows notifications.
- Screen tools: new screen areas; read text, numbers, find a picture, check a colour; record clips for testing; preview over a game screenshot. Read-only files in the game's folder. Never memory or the game process; never show what a game hides.
- Over-game panels in ShotCaller's overlay frame; read access to library, playtime, builds, matches and built-in data (never secrets); shared storage between AI modules; custom goals/achievements; stats pages; squad-link sending (user sees what is sent); run-time AI through the free signed-in CLI with a usage cap; internet with the honest ShotCaller name; "Move to project" through Claude Code.
Done when:
- The AI builds a working over-game module with a hotkey, a timer and a screen reader for a real game, it runs in a real match, and a broken version turns itself off and gets fixed by "Ask AI to fix".
- Release a beta at the end (offer 3-4 name options first; tag's first line "ShotCaller eN (v0.0.4-beta.N)", annotated tag message = patch notes; ask before publishing).

## Decisions & constraints to respect
- Build on M1's format: add new block types / a code section to ModuleDoc rather than a second format; keep "nothing changes until Apply", versions and the mistake checker for every change, including code.
- **Ask AI stays free, no API keys.** Only the signed-in Claude Code / Antigravity CLIs and outside apps the user already has. In the chat, the AI's built-in tools stay off.
- **Never read a game's memory or touch its process**; never show what a game hides; per-game rules (EasyAntiCheat) apply. Requests identify honestly as ShotCaller; never get around bot blocks.
- Every feature has its own on/off switch; ShotCaller navy/blue look, red only for danger/timers. Any over-game window needs `keepOutOfScreenCopies` in electron/windows.ts. New special URL schemes must be added to the one `registerSchemesAsPrivileged` call in electron/dbd/icons.ts.
- Secrets encrypted in userData (safeStorage); never in repo/settings/logs/chat. Modules never see secrets.
- IPC pattern: channel in shared/ipc.ts, handler (modules: electron/modules/ipc.ts), bridge in electron/preload.ts, types (modules: `ModulesApi` in shared/modules.ts). Files are LF.
- Plain words in the UI and chat (user is not technical). Click-to-pick question widgets for any batch of questions. Never commit or push without the user's OK. Dev app: `npm.cmd run dev`; only one ShotCaller runs at a time (a second launch shows the first one's window). A second test copy can run with `--user-data-dir=<folder>`.

## Loose ends / known issues
- **M1 isn't committed or released yet.** Ask the user to commit, then offer beta name options for M1's beta (or roll it into M2's beta if they prefer).
- Test data in the user's own ShotCaller: module `palworld-base-guide` (version 3) and the "Let AI make modules" switch turned on. Ask whether to keep them.
- A module belongs to one library entry (Palworld on Steam and on Anker are separate entries). Maybe match by game name too.
- Import preview of a new module can't show its pictures until installed.
- From D2: Claude Desktop setup ("Set it up for me" / bridge) still untested end to end; check the v0.0.4-beta.24 release finished building and the installed app updates to it.
- The DbD hub's own add-on lines may show the wiki's flavour text instead of the effect (check in D4).
- Branches `phaseF1/fortnite-foundation` and `phaseD1/dbd-foundation` are pushed but not merged to main; ask before merging.
- Fortnite F4 real-match check still paused (docs/handoff-fortnite-F4.md). D6 squad link waits for a second tester.

## How to start
1. Read the files above.
2. Confirm the Phase M2 goal with the user in 1-2 lines.
3. Begin.
