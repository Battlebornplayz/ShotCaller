PHASE HANDOFF — ShotCaller — Phase F design interview → Phase F1

Use the `phased-project` skill. You are starting Phase F1 (Fortnite: foundation, match tracking, chest counter).
At the end of this phase, write a new handoff in this same format for Phase F2
(and tell that chat to do the same), so every phase hands off to the next.

Project folder: D:\ShotCaller
Read first: PROJECT_PLAN.md ("Phase F — Fortnite companion", F1-F4), DESIGN.md ("Fortnite mode — design interview", all Q1-Q47 + the minimap/storm notes), games/README.md, and DESIGN.md "Phase 6 screen reading" (the Skillshot screen reader is the pattern to reuse).

## Project in one paragraph
ShotCaller is a polished Electron desktop app: a cross-game achievement hub (Steam, Anker Games, emulator files, hand-added games; unlock popups, library, timeline) plus per-game overlay modules. First module: Skillshot City. Now adding a second module: a Fortnite companion ("the best Fortnite companion", TRN-style tracking). Public MIT repo Battlebornplayz/ShotCaller, installed from GitHub Releases with a self-updating launcher. For now it's for the user's own PC. Stack: Electron + TypeScript + React 19 + electron-vite, electron-builder, electron-updater, uiohook-napi, koffi.

## Done so far
- Phases 1-3: design, app shell + auto-update + CI releases, games/detection/overlay/tray/hotkeys. Phase 4 (Firebase accounts) built but dormant. Phase 5: achievement hub.
- Phase 6 Part 1 (Skillshot City): mostly built, PAUSED by the user on 2026-11-10 so Fortnite goes next. Its full handoff is saved in `docs/handoff-skillshot-part1.md`; resume from there after Phase F. Beta v0.0.4-beta.1 is out.
- Phase F design interview (just finished, this chat): 47 questions, all answers in DESIGN.md "Fortnite mode"; Phase F (F1-F4) added to PROJECT_PLAN.md. No Fortnite code exists yet.

## Phase F1 goal
Foundation, match tracking and the chest counter.
Deliverables:
- Detect Fortnite (game list + running process, likely `FortniteClient-Win64-Shipping.exe`: check) and note that overlays need Windowed Fullscreen.
- Fortnite log tailer (likely `%LOCALAPPDATA%\FortniteGame\Saved\Logs\FortniteGame.log`: check) used ONLY for match start/end and mode. Find which lines exist in a real log first.
- Screenshot recorder for building readers (opt-in switch, local only, capped) + a Screen check tab like Skillshot's.
- Chest counter from the "chest opened" XP popup: chests and rare chests apart; totals per match / session / today / all time.
- Placement + eliminations from the HUD and end screen; time alive.
- Overlay card: drag anywhere (saved), 60% opacity default, size slider, always visible, a hide-all-overlays hotkey, an on/off switch per part. ShotCaller navy + Fortnite rarity colours.
- Match store + Fortnite hub (tabs like Skillshot's): match history (trend charts on top, list below), filters by mode (Builds / Zero Build / Ranked / Reload; apart + combined) and team size; recap saved.
- Minimap feasibility test for F3: 20-30 saved minimap shots incl. water, inside the storm and the storm edge; shape-based matcher + storm-tinted map copy vs the season map (fortnite-api.com map image); measure hit rate; check north-up and zoom. Report before F3.
Done when:
- A real match is tracked by itself, with chests, placement and eliminations right, shown on the card and saved in history; and the minimap test result is reported.

## Decisions & constraints to respect
- **Never read Fortnite's memory, inject, hook or touch its process/files** (Easy Anti-Cheat + BattlEye: ban risk). Only: screen capture, the log file (match start/end/mode only), fortnite-api.com. The user unticked replay files.
- **TRN (Tracker Network) is the model for ideas only**: never scrape their site, use their data, or copy their look/branding. Don't promise "top X% of players".
- **Every feature the user agreed to has its own switch; overlay parts are see-through.** (user rule)
- **The storm must work** for minimap tracking: shape over colour as the main matcher + a storm-tinted copy of the map (DESIGN.md).
- Enemies only when the game itself reveals them. Never anything the game hides.
- The user's setup: 1920x1080, default HUD, mouse and keyboard. Tune for that; other setups unchecked.
- fortnite-api.com key: the user has one. It's a secret: stored in ShotCaller settings (userData) only, never in the repo, DESIGN.md, the build or logs. Ask the user to paste it into Settings once that field exists (needed from F2; not needed in F1 except the public map image). Don't repeat it in chat.
- Reuse Skillshot's patterns: `electron/skillshot/screenCapture.ts` (capture only while the game is the front window), the matching style in `shared/skillshotVision.ts`, push-not-pull IPC (`shared/ipc.ts`, types in `shared/types.ts`), strict `sanitize()` in `electron/settings.ts`, `.ss-*`-style classes in `src/styles/global.css` (make Fortnite ones, e.g. `.fn-*`). Game modules live in `games/<id>/` (see games/README.md).
- Look: navy (#0F1023 / #1A1C3A / #090A18), #4F8CFF accent, lavender #8F93C9.
- The user is new to things and wants plain explanations. Question widgets: clickable buttons + "Send answers" (memory).
- The user does GUI testing themselves and may skip it: give short checklists, don't block. Quit the installed ShotCaller (tray) before dev runs. Use `npm.cmd run dev` (PowerShell blocks npm.ps1). An old dev Electron can linger and steal the single-instance lock.
- Some files have CRLF line endings: normalize before scripted patches. Careful with backslashes in shell heredocs.
- `reports/` and `research_notes/` stay untracked (not in the public repo).

## Loose ends / known issues
- Git: current branch is `phase6/builder-overhaul-and-rarity`. Check whether it's merged to main; start Fortnite work on a new branch (e.g. `phaseF1/fortnite-foundation`) from the right base, and ask the user if unsure.
- Unverified Fortnite facts to check early: process name, log path and its match lines, whether the chest XP popup still shows (and its wording), minimap north-up and zoom behaviour, fortnite-api.com map image matches the minimap art.
- Skillshot Part 1 loose ends are all in `docs/handoff-skillshot-part1.md` (live screen-read checks, memory reader, MCP connection parked).
- This chat's DESIGN.md / PROJECT_PLAN.md / HANDOFF.md / PHASE_LOG.md edits and `docs/handoff-skillshot-part1.md` are not committed yet.

## How to start
1. Read the files above.
2. Confirm the phase goal with the user in 1-2 lines.
3. Begin.
