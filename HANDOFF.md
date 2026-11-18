PHASE HANDOFF — ShotCaller — Phase D design → Phase D1

Use the `phased-project` skill. You are starting Phase D1 (Dead by Daylight: foundation, catch-up and build manager).
At the end of this phase, write a new handoff in this same format for Phase D2
(and tell that chat to do the same), so every phase hands off to the next.

Project folder: D:\ShotCaller
Read first: PROJECT_PLAN.md ("Phase D", then "Phase D1" and "Phase D2"), DESIGN.md ("Dead by Daylight mode — design interview", D-Q1 to D-Q51 and "Ask AI"), games/README.md, games/fortnite/ (the model module to copy: manifest, hub, panels), electron/library.ts (Steam data), docs/handoff-fortnite-F4.md (the paused Fortnite handoff).

## Project in one paragraph
ShotCaller is a polished Electron desktop app: a cross-game achievement hub plus per-game overlay modules (Skillshot City, paused; the Fortnite companion; now Dead by Daylight), and a Games tab that launches games from every store on the PC. Public MIT repo Battlebornplayz/ShotCaller, installed from GitHub Releases with a self-updating launcher (Stable/Beta). For the user and a friend. Stack: Electron + TypeScript + React 19 + electron-vite, electron-builder, electron-updater, uiohook-napi, koffi.

## Done so far
- Phases 1-3, 5 done; Phase 4 dormant; Skillshot paused. Fortnite F1-F3 done, F5 squad link mostly shipped early; Games tab L1 + L2 done (beta.21 "e21").
- Fortnite F4 built 2026-11-12 (commit af39f8b + later 3cdec44, 789ceb2, 86fd468); its real-match check and beta.22 are **paused** by the user. Its handoff is saved as docs/handoff-fortnite-F4.md.
- Phase D design (just finished, 2026-11-17): Dead by Daylight design interview, 51 answers in DESIGN.md; Phase D planned in six parts in PROJECT_PLAN.md (D1 foundation/catch-up/builds, D2 Ask AI, D3 hooks/timers, D4 killers/maps, D5 stats, D6 squad). The user picked DbD after ShotCaller's library showed it installed; they have ~600 h (both sides) but haven't played in months.

## Phase D1 goal
The DbD module, its hub, the catch-up and the build manager: useful before any screen reading.
Deliverables:
- `games/dbd/` module (Steam app 381210, exe names, rail icon), listed in games/index.ts. Hub: Home (recap, session, what's new) + tabs Builds, Killers, Maps, Stats, Catch-up, with a survivor/killer switch on each (Killers/Maps/Stats can be placeholders until D4/D5).
- Data source for killers, survivors, perks, add-ons, items, offerings, maps (with icons), patch changes and current popular builds. Pick sources at the start; cache in userData; refresh after DbD updates.
- Short DbD setup: screen found, DbD's UI scale and HUD scale, second monitor.
- Match start/end from DbD's log file (only that).
- Catch-up from Steam's last-played date for DbD (with Change): new killers/survivors/perks/maps, big reworks/buffs/nerfs, what's strong now. Grouped page + "new" tags on perks and killers. "What changed this patch" once after each DbD update; full catch-up after a 2+ week break.
- Build manager: perk icon grid with search and tag filters (chase, gens, aura, healing...), one-line summaries that expand to the full text, saved builds per side (perks, add-ons/item, offering), popular builds to copy and tweak, share codes for a friend.
- Release a beta (next: v0.0.4-beta.22, unless F4's beta goes first). **Offer name options first** (default "e22"; tag `-beta.N`, tag's first line "ShotCaller eN (v0.0.4-beta.N)") and **ask before publishing**.
Done when:
- DbD shows as a module, the catch-up is right for the user's real gap, builds save, load and share by code, and the beta installs and updates.

## Decisions & constraints to respect
- **Never read DbD's memory or touch its process** (EasyAntiCheat). Screen reading, its log file (match start/end only), Steam's own files, public data sites, and (D5) the user's own signed-in official stats pages. Never show what the game hides.
- Veteran player: no beginner content; tips are quick reminders. Plain words in the UI and in chat (the user is not technical).
- Every feature has its own on/off switch; overlay parts are see-through; ShotCaller look (navy/blue) with red only for danger and timers. Any new over-game window needs `keepOutOfScreenCopies` in electron/windows.ts.
- **Ask AI (D2) must stay free, no API keys (user):** MCP server for Claude Desktop/Code and Gemini CLI, and an in-app chat that runs the signed-in Claude Code / Gemini CLI. Don't add any API-key path. D1 can shape build/catch-up data so D2 tools can read and save it.
- Secrets (fortnite-api.com, SteamGridDB, later the Steam Web API key) live encrypted in userData; never in repo/settings/logs/chat.
- IPC pattern: channel in shared/ipc.ts, handler in electron/ipc.ts, bridge in electron/preload.ts, type in shared/types.ts.
- Some files are CRLF (GamesPage.tsx, shared/ipc.ts, pages.tsx, PHASE_LOG.md), most LF: edit with small Python scripts written to a file that keep each file's endings. `reports/`, `research_notes/` stay untracked.
- Click-to-pick question widgets with a Send button for any batch of questions; recommended option preselected.
- Dev app: `npm.cmd run dev` (ask before quitting the installed app).

## Loose ends / known issues
- **Uncommitted work on `phaseF1/fortnite-foundation`** at handoff time: Fortnite changes (electron/fortnite/screenReader.ts, audio.ts, src/fnaudio/, FortniteHub.tsx, shared/*, main/preload/windows) plus this design work (DESIGN.md, PROJECT_PLAN.md, HANDOFF.md, PHASE_LOG.md, docs/handoff-fortnite-F4.md). **Before starting D1, ask the user** how to save it (e.g. commit the Fortnite work and the design docs separately on this branch, then start D1 on a new branch `phaseD1/dbd-foundation`). Never commit or push without the user's OK.
- `phaseF1/fortnite-foundation` isn't merged to main; ask before merging.
- Fortnite F4 real-match check and beta.22 still to do later (see docs/handoff-fortnite-F4.md).
- The user's friend may not play DbD: D6 squad link waits for a second tester.
- Unchecked: whether DbD's log file shows match start/end clearly; whether stats.deadbydaylight.com's pages can be read once signed in (D5); data sources for map pictures and popular builds.

## How to start
1. Read the files above.
2. Confirm the Phase D1 goal with the user in 1-2 lines, and ask how to save the uncommitted work first.
3. Begin.
