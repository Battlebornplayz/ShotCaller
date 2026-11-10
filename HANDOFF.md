PHASE HANDOFF — ShotCaller — Phase F1 → Phase F2

Use the `phased-project` skill. You are starting Phase F2 (Fortnite: online stats, second monitor, season map, live dots).
First finish the two F1 loose ends below (placement, real-match check).
At the end of this phase, write a new handoff in this same format for Phase F3
(and tell that chat to do the same), so every phase hands off to the next.

Project folder: D:\ShotCaller
Read first: PROJECT_PLAN.md ("Phase F", F1-F5), DESIGN.md ("Fortnite mode" incl. "Phase F1 findings": HUD layout, chest popup, live eliminations, time alive, minimap test, squad link), games/README.md.

## Project in one paragraph
ShotCaller is a polished Electron desktop app: a cross-game achievement hub (Steam, Anker Games, emulator files, hand-added games; unlock popups, library, timeline) plus per-game overlay modules. Modules: Skillshot City (Phase 6 Part 1, paused) and the Fortnite companion ("the best Fortnite companion", TRN-style tracking). Public MIT repo Battlebornplayz/ShotCaller, installed from GitHub Releases with a self-updating launcher (Stable/Beta). For the user and a friend. Stack: Electron + TypeScript + React 19 + electron-vite, electron-builder, electron-updater, uiohook-napi, koffi.

## Done so far
- Phases 1-3, 5 done; Phase 4 (Firebase accounts) built but dormant. Skillshot Phase 6 Part 1 paused (handoff in `docs/handoff-skillshot-part1.md`).
- Phase F design interview (47 questions) done.
- Phase F1 (this chat, nearly done), branch `phaseF1/fortnite-foundation` (pushed), released as **v0.0.4-beta.3**:
  - Fortnite module `games/fortnite/` (exe `FortniteClient-Win64-Shipping.exe`), log parser `shared/fortniteLog.ts` (75/75 real matches with mode), tracker `electron/fortnite/tracker.ts` (matches in `userData/fortnite/matches.json`).
  - Screen reader `electron/fortnite/screenReader.ts` + `shared/fortniteVision.ts`: chest counter (shape of the word CHEST under "+XP", any "... CHEST" counts as one; 8/8 on a real recording), live eliminations from the number next to the skull (digit templates `games/fortnite/hudGlyphs.json`), time alive (skull row = alive, players-left icon on top = down; reboots handled), opt-in capped screenshot recorder.
  - Overlay card (`games/fortnite/overlay.tsx`, 60% see-through, size slider, switch per part) and hub `games/fortnite/FortniteHub.tsx` (Matches with chest trend + mode/team filters, Screen check, Options). Settings group `fortnite`.
  - Minimap feasibility test: feasible (north-up, ~240 px of the 2048 map, 35/38 in-match + 10/10 storm frames). Details in DESIGN.md.
  - Test footage: `Videos\Captures\Fortnite   2026-11-10 12-56-32.mp4`; frames, the season map and test scripts' outputs in `research_notes/fortnite/` (untracked). ffmpeg installed by winget (path: `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_*\ffmpeg-*\bin\`).

## Phase F2 goal
Online stats, the second-monitor window, the season map, and live dots.
Deliverables:
- fortnite-api.com key in Settings (local only, never in the repo/logs; ask the user to paste it); stats page: wins, K/D, win rate per mode, season vs lifetime, battle pass level.
- Second-monitor window: fills the chosen monitor (remembered), opens and closes with Fortnite. Map on the left, panels stacked on the right (session, inventory placeholder, chests).
- Season map (`https://fortnite-api.com/images/map.png`, place names from `/v1/map`) with the A-J / 1-10 grid; new season map downloaded by itself, old pins archived.
- **Live dots (user moved them into F2):** your dot from matching the minimap (x 1636-1888, y 32-284 at 1080p) against the season map with brightness-normalised grey matching (search near the last spot; whole map at landing; "not sure" over open water or when the minimap is covered; reject jumps), and teammates' dots copied from your minimap in squad colours.
- Live session panel (matches, wins, kills, K/D, chests since launch, arrows vs your usual); goals ("50 chests today") with progress on the card.
- Lobby view: last recap, session panel, goals, map with drop stats; recap on the second monitor after each match.
- Item shop + wishlist alert.
Done when:
- The second monitor shows the map with your dot and teammates' dots in the right places during real play, the session panel is live, and the stats page matches the user's numbers.

## Decisions & constraints to respect
- **Never read Fortnite's memory, inject, hook or touch its process/files** (EAC + BattlEye). Only screen capture, the log (match start/end/mode only) and fortnite-api.com. Don't read the Quests tab for chests.
- **One chest count:** any XP label that says CHEST is a chest (user).
- XP text glows purple, **gold when supercharged**: match shapes, never colour.
- TRN is the model for ideas only: never scrape it, use its data, or copy its look.
- Every feature has its own switch; overlay parts are see-through. Hide-all-overlays = the existing show/hide hotkey (Alt+S).
- User's setup: 1920x1080, default HUD, Windowed Fullscreen, mouse and keyboard.
- fortnite-api.com key is a secret: userData settings only, never in the repo, DESIGN.md, the build or logs. Don't repeat it in chat.
- **Publish each finished dev step as a beta** (user): commit, push the branch, annotated tag `v0.0.4-beta.N` (next: beta.4) with plain patch notes; write messages to a file and use `-F` (PowerShell mangles stdin).
- Squad link (join code, sharing inventory, chests + live eliminations, map dot) is Phase F5; friends list later in Phase 9. Not in F2.
- Look: navy (#0F1023 / #1A1C3A / #090A18), #4F8CFF accent, lavender #8F93C9, Fortnite rarity colours (`--fn-*` in global.css). The user is new to things: plain explanations; question widgets with click-to-pick buttons.
- The user tests by recording matches (Win+Alt+R) and gives timestamps; pull frames with ffmpeg. They may also run the beta instead of dev. Quit the installed ShotCaller before dev runs; `npm.cmd run dev`.
- Some files have CRLF line endings. `reports/` and `research_notes/` stay untracked.

## Loose ends / known issues
- **F1 not finished, do first:** (1) placement isn't read (shows "—"): needs a recording that runs to the end-of-match screen; players left is already read (`readHud().playersLeft`) and may help; (2) a real-match check of the whole F1 build (card, chests, elims, time alive, history). The user was asked to record one match through to the lobby with ShotCaller running.
- Chests: two chests opened within ~1 s may count as one. Rare/sprite chest labels not yet seen on screen (they should match, since they contain the word CHEST).
- Eliminations pause while you're down (the skull row hides). Players left flickered once (41/42).
- Minimap: not tested on open water far from land, in vehicles, or on the bus/skydive (different zoom). Edge-only matching scored worse than grey on this art.
- Other resolutions / HUD scales unchecked; Screen check shows a warning off 1080p.
- `phaseF1/fortnite-foundation` isn't merged to main (main is at v0.0.4-beta.2); ask before merging. The Skillshot builder commit (b0fcc11) rides on this branch.

## How to start
1. Read the files above.
2. Confirm the phase goal with the user in 1-2 lines.
3. Begin.
