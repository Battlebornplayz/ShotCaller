PHASE HANDOFF — ShotCaller — Phase 6 Part 1 (in progress) → Phase 6 Part 1 (continue)

Use the `phased-project` skill. You are continuing Phase 6 Part 1 (Skillshot City: skills, synergies, live match tracking).
At the end of this phase, write a new handoff in this same format for the next phase
(and tell that chat to do the same), so every phase hands off to the next.

Project folder: D:\ShotCaller
Read first: PROJECT_PLAN.md (Phase 6 Part 1 "The user's flow" + deliverables, Part 2), DESIGN.md ("Phase 6 decisions" and "Phase 6 research findings"), reports/Skillshot City game knowledge.md (long: read the sections you need), games/README.md

## Project in one paragraph
ShotCaller is a polished Electron desktop app: a cross-game achievement hub (Steam, Anker Games, emulator files, hand-added games; unlock popups, library, timeline) plus per-game overlay modules. First module: Skillshot City (Steam app 308600, installed at D:\SteamLibrary\steamapps\common\SkillshotCity). Public MIT repo Battlebornplayz/ShotCaller, installed from GitHub Releases with a self-updating launcher. For now it's for the user's own PC. Stack: Electron + TypeScript + React 19 + electron-vite, electron-builder, electron-updater, uiohook-napi.

**The user is new to the game and wants ShotCaller to teach them.** Explain terms plainly, don't assume game knowledge, and don't ask them to judge balance from experience: bring evidence.

## Done so far
- Phases 1-3: design, app shell + auto-update + CI releases, games/detection/overlay/tray/hotkeys (v0.0.3). Phase 4 (Firebase accounts) built but dormant. Phase 5: achievement hub.
- Phase 6 Part 1 earlier: game-data extractor, log parser + match tracker, advisor core, skill collection reader, overlay panel, match review, stats, SkillshotHub tabs.
- This chat:
  - Research round (5 tracks, report + notes, see Read first).
  - `games/skillshot-city/tiers.json` rebuilt: S/A/B/C for all 54 skills from skillshotcity.gg public ranked tables, with raw `stats`, plain-language `how` text and research `note`s. Generator was a one-off (rule in `_about`).
  - `electron/skillshot/gamedata.ts`: text aliases fix Assassinate, Charged Shot and Teleportation; `cleanGameText` removes `{{%..%}}` tags; class descriptions and the game's loading tips added to `SkillshotData`.
  - Advisor: plainer reasons, reroll advice only for truly weak pairs, `pool` documented as the equipped build rather than the offer pool. Overlay: rarity-based level pips, how-to line on wide cards.
  - New: `games/skillshot-city/SkillLookup.tsx` (Lookup tab + `CompactLookup` in the overlay), `LearnPage.tsx` + `learnData.ts` (Learn to play tab), `skillHistory()` in `shared/skillshotStats.ts`.
  - Real icons: `games/skillshot-city/icons.json` holds each skill's position in the game's `menuTextures.png` and its numeric id; `loadSkillIcons` in gamedata.ts crops them at startup (art isn't shipped). `SkillshotSkill.num` / `.icon`.
  - Owned skills: `toCollection` names draft-history numbers, so all 26 unlocked skills are detected from files. Rarity known for 8.
  - Builder: `shared/skillshotBuilder.ts` + `games/skillshot-city/BuilderPage.tsx` (Builder tab); "Make this my goal build" locks the advisor's goal.
  - `electron/gameFocus.ts` (koffi, restores the game if it minimizes while Alt is held) and `backupGameLog()` in the tracker (copies log.txt to userData/skillshot/logs after each session, keeps 100).

## Phase 6 Part 1 goal (remaining)
The user's flow (PROJECT_PLAN): auto-detect owned skills + rarity → plan a build in ShotCaller's builder → in a match, the optimal pick at every level-up.
Deliverables left, in order. Live offers are the big gap: today the overlay only gets offers by hand, so "the optimal pick at every level-up" doesn't happen on its own yet.
- Screen reading of the 2 offers: BUILT (DESIGN.md "Phase 6 screen reading"), tested on real screenshots, not yet run live. After a real match, the Screen check tab shows each read marked against the log's `SKILL DRAFT` lines (raw records: `userData/skillshot/vision/reads.jsonl`). Next: read rarity from the panel's `Lvl x/y` and the build row's disc colours (samples collect in the same folder).
- Memory reader (read-only, own player only, behind the setting with a risk warning; Cheat-Engine-style scanner, koffi is already installed): level, XP, health + shield numbers, offers, round, timer, rarities of all owned skills + instant unlock / rarity notices. The user was offered help asking the developer first and chose to keep building; their acceptance of the risk stands, but show the risk warning plainly. Needs the game running to find values, so plan a guided session with the user.
- Make the advisor aware of the draft step once level-to-step is measured (log backups now collect the data). Use backups from the chosen plan in the advisor.
- First beta is out as v0.0.4-beta.1, with Part 1 unfinished (koffi and the bundled libraries load in the packaged runtime). Release the next beta at the end of Part 1.
Done when: owned skills + rarities detected without typing, a goal build set in the builder, and a full 3-round match tracked end-to-end automatically with the optimal pick shown at each level-up, the round/synergy panel and a saved recap.

## Decisions & constraints to respect
- Auto-detect everything possible (user rule). Game files are read-only. The log is written in batches (up to ~2.5 min late); every line has its own unix time.
- Flask unlocks are NOT written to disk; full collection is server-side over HTTPS. Network interception rejected. Memory reader is the route.
- Memory reading: the user accepted the ban risk before the research. Read-only, own player only, switchable off. The developer's stance is unknown, not permissive (DESIGN.md research findings).
- skillshotcity.gg: public pages only. Its robots.txt disallows `/api/`; ask the operator before using the API. Credit it wherever its numbers show. Never describe ShotCaller as the "first" overlay.
- Facts in `learnData.ts` are version-stamped (game 1992). Balance moves almost weekly: don't add exact skill numbers without a version, and don't name default keys (they differ between sources).
- Push, not pull: main process pushes state to windows. Renderer only talks through `window.shotcaller`; IPC names in `shared/ipc.ts`, types in `shared/types.ts` / `shared/skillshot*.ts`, settings in `electron/settings.ts` (keep `sanitize()` strict).
- Part 2 (not now): weapons/items/counters, build library + share codes, 50+ achievements, data packs, built-in offline "Ask" engine + optional Claude MCP server.
- Look: navy (#0F1023 / #1A1C3A / #090A18), #4F8CFF accent, lavender #8F93C9; reuse classes in `src/styles/global.css` (`.ss-*` for Skillshot).
- Some files have CRLF line endings: normalize before scripted patches. Careful with backslashes in scripted patches run through a shell heredoc (a regex lost its backslashes this way).
- Question widgets: clickable buttons + "Send answers" (see memory).
- The user does GUI testing themselves and may skip it: give short checklists, don't block on them. Quit the installed ShotCaller (tray) before dev runs. On this PC PowerShell blocks `npm.ps1`: use `npm.cmd run dev`. An old dev Electron can linger and steal the single-instance lock.
- Preview harness (Vite dev server + real extracted data) lives in the scratchpad only; recreate if needed.

## Loose ends / known issues
- Questions for people, only the user can send these, and they chose not to for now: the developer (is live draft advice OK in ranked? memory reading?), Epiano7 (why was the Mod Menu's advisor retired?), the skillshotcity.gg operator (API use).
- Lookup, Learn, Builder and the compact lookup were checked in a browser preview with real game data and a mock match. The running app was probed and returned 54 icons and 26/26 skills, but nobody has looked at these pages in the app or played with them. Advisor changes, goal setting, game restore and log backup haven't been tried in-game.
- Research gaps: Discord, Reddit and the EULA couldn't be read. skillshotcity.gg's "win rate" is undefined, so tiers are provisional and low ranks have no data.
- To test in game: reroll per draft or per match, level-to-step map, whether the "weekly skill rotation" text is live, class numbers beyond 1. Skill numbers have no readable table (in-game hover could fill it).
- Beta v0.0.4-beta.1 released (2026-11-09) with Phase 5 and Phase 6 so far. `reports/` and `research_notes/` are deliberately NOT in the public repo: they stay untracked on this PC, so don't add them without asking. The Claude connection ships hidden (`SHOW_CLAUDE_CONNECTION` in SettingsPage.tsx).
- Claude MCP connection: PARKED by the user (2026-11-09), off and not connected to Claude. Code is in `electron/skillshot/mcpServer.ts` with its settings section, `CoachNote` on the overlay, and `@modelcontextprotocol/sdk` + `zod` installed. Tested so far: it listens on 127.0.0.1 only and refuses a missing or wrong token, a browser Origin, a look-alike Host, other paths and GET. Not yet tested: a POST with a `{}` body reset the connection (ECONNRESET, cause not looked into), and the test stopped there, so no tool has been called. Pick up there if the user asks.
- Only 1 match saved so far; stats fill in with play.
- Tracker's own `skillStats()` duplicates `skillWinStats()` in skillshotStats.ts. Older Phase 5 loose ends (Prettier drift, untested tray/second-monitor/Linux) still open.
- Rarity is known for only 8 of 26 owned skills until the memory reader lands or they're equipped, so the builder's top-slot advice is thin (no known Legendary yet).

## How to start
(Shortcut: in a new chat in D:\ShotCaller, type `/handoff` — it reads this file.)
1. Read the files above.
2. Confirm the goal with the user in 1-2 lines.
3. Begin with screen reading of the offers.
