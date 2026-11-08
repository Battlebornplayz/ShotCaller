PHASE HANDOFF — ShotCaller — Phase 6 Part 1 (in progress) → Phase 6 Part 1 (continue)

Use the `phased-project` skill. You are continuing Phase 6 Part 1 (Skillshot City: skills, synergies, live match tracking).
At the end of this phase, write a new handoff in this same format for the next phase
(and tell that chat to do the same), so every phase hands off to the next.

Project folder: D:\ShotCaller
Read first: PROJECT_PLAN.md (Phase 6 Part 1 "The user's flow" + deliverables, Part 2), DESIGN.md ("Phase 6 decisions" P6-Q1…Q48 and the notes after them), games/README.md

## Project in one paragraph
ShotCaller is a polished Electron desktop app: a cross-game achievement hub (Steam, Anker Games, emulator files, hand-added games; unlock popups, library, timeline) plus per-game overlay modules. First module: Skillshot City (Steam app 308600, installed at D:\SteamLibrary\steamapps\common\SkillshotCity). Public MIT repo Battlebornplayz/ShotCaller, installed from GitHub Releases with a self-updating launcher. For now it's for the user's own PC. Stack: Electron 45 + TypeScript + React 19 + electron-vite, electron-builder, electron-updater, uiohook-napi.

## Done so far
- Phases 1-3: design, app shell + auto-update + CI releases, games/detection/overlay/tray/hotkeys (v0.0.3). Phase 4 (Firebase accounts) built but dormant. Phase 5: achievement hub.
- Phase 6 setup interview + Part 1 core (earlier chat): game-data extractor, log parser + match tracker, advisor core, IPC.
- This chat (commits 07d5655 … 05cd9b7, all local, not pushed):
  - Skill collection reader (`shared/skillshotCollection.ts`): equipped build per class with rarity from `Build Slot` log lines; class auto-detected from your standing's classID (1 Assault, 2 Marksman, 3 Heavy, 4 Caster, 5 Scavenger, 6 Criminal, 7 Scientist, 8 Assassin — only 1 confirmed); unlocked-skill count from `Draft Impressions … Enabled: n` (26 on the user's account); profile `::IMPS` = draft history (not ownership). Saved to userData/skillshot/collection.json, pushed on `skillshot:collection-changed`. Rarity colors: Common #b8bcd9, Rare #4f8cff, Epic #b26bff, Legendary #f5c451.
  - `games/skillshot-city/tiers.json`: draft tier/tree/role/tags/notes for all 54 skills (no community tier list exists). `playstyles.json`: 17 presets built on the game's official synergy pairs.
  - Advisor uses your rarity; goal suggestion fills with strong pool skills; descriptions fixed (DESC_02 / plural keys).
  - Overlay panel `games/skillshot-city/overlay.tsx`: advice cards (Take this, tier, reason, synergy glow), reroll banner, sound cue, last picks, synergy meter, build panel (rarity borders, level pips, synergy links), goal lock, manual offer grid (tree filters; search types only in the monitor window), lobby = recap card (advice followed, best/weakest pick, today's goals); thin strip in fights, full on offer / level-up / Alt; second-monitor two-column layout. Default corner position clears the QUIT button (`overlayTopClearance` in the module manifest).
  - Stats `shared/skillshotStats.ts` (match review via the advisor, stats by skill/synergy/build/class, trend, session goals) + Skillshot section on the game page `games/skillshot-city/SkillshotHub.tsx` (Your skills / Matches / Stats).
  - Settings: `skillshot: { offerSound, memoryReader }`.

## Phase 6 Part 1 goal (remaining)
The user's flow (PROJECT_PLAN): auto-detect owned skills + rarity → plan a build in ShotCaller's builder → in a match, the optimal pick at every level-up.
Deliverables left, in order:
- Lookup page in the app + compact overlay search (filters by tree/tag/tier, synergy map, your stats per skill). Text follows the game's language.
- Real skill icons: crop from `data/textures/menuTextures.png` (2048², white icon grid in the lower half, ~64 px cells, no atlas file — UV table is in the exe, or match against an in-game screenshot). Replace the monogram in `SkillIcon` (games/skillshot-city/ui.tsx).
- Advanced builder page (P6-Q42–48): playstyle card + sliders (aggression, range, survival, spice) + "surprise me"; owned skills only; top 3 builds with pros/cons; each with skills, what to max first, backups + reroll targets, and the in-game slots to equip; scored from synergy results, offer odds (offers come from your equipped 8 slots + top legendary section), tiers/notes, skill numbers (if found), K/D per build. The chosen build becomes the advisor's goal.
- Overlay fix: restore the game if it minimizes (needs Win32: add `koffi`, also used by the memory reader).
- Memory reader (read-only, own player only, behind the setting with a risk warning; Cheat-Engine-style scanner): level, XP, health + shield numbers, offers, round, timer, and the full skill collection + instant unlock / rarity-change notices. Screen reading of the 2 offers (icon match + OCR, offline) as the non-memory live source.
- Release beta v0.0.4 at the end of Part 1.
Done when: owned skills + rarities detected without typing, a goal build set in the builder, and a full 3-round match tracked end-to-end automatically with the optimal pick shown at each level-up, the round/synergy panel and a saved recap.

## Decisions & constraints to respect
- Auto-detect everything possible (user rule). Game files are read-only. The log is written in batches (up to ~2.5 min late); every line has its own unix time.
- Flask unlocks are NOT written to disk (verified: profile only changed Kill Coins 730→30); full collection is server-side over HTTPS. Network interception rejected (HTTPS needs root cert/proxy; no injection). Memory reader is the route.
- Memory reading: user accepted the ban risk. Read-only, own player only, switchable off. No packet sniffing.
- Push, not pull: main process pushes state to windows. Renderer only talks through `window.shotcaller`; IPC names in `shared/ipc.ts`, types in `shared/types.ts` / `shared/skillshot*.ts`, settings in `electron/settings.ts` (keep `sanitize()` strict).
- Part 2 (not now): weapons/items/counters, build library + share codes, 50+ achievements, data packs, built-in offline "Ask" engine (main assistant, free) + optional Claude MCP server (localhost, off by default).
- Look: navy (#0F1023 / #1A1C3A / #090A18), #4F8CFF accent, lavender #8F93C9; reuse classes in `src/styles/global.css` (`.ss-*` for Skillshot).
- Some files have CRLF line endings: normalize before scripted patches.
- Question widgets: clickable buttons + "Send answers" (see memory).
- The user does GUI testing themselves and may skip it ("I trust it works"): give short checklists, don't block on them. Quit the installed ShotCaller (tray) before dev runs. On this PC PowerShell blocks `npm.ps1`: use `npm.cmd run dev`. An old dev Electron can linger and steal the single-instance lock — check processes.
- Preview harness for the overlay (mock bridge + real data) lives in the scratchpad only; recreate if needed (vite build with React aliased to the project's node_modules).

## Loose ends / known issues
- Nothing pushed to GitHub since v0.0.3; Phase 5 + Phase 6 commits are local only.
- The new overlay/recap/stats were checked in a mock preview only; the user chose not to test in-game.
- Only 1 match saved so far (older logs rotated before the tracker ran); stats fill in with play.
- Class-number mapping beyond 1 (Assault) unverified; Assassinate / Teleportation have no description text in the game files.
- Tracker's own `skillStats()` duplicates `skillWinStats()` in skillshotStats.ts — can be merged.
- Older Phase 5 loose ends (Prettier drift, untested tray/second-monitor/Linux) still open.

## How to start
(Shortcut: in a new chat in D:\ShotCaller, type `/handoff` — it reads this file.)
1. Read the files above.
2. Confirm the goal with the user in 1-2 lines.
3. Begin with the lookup page (then icons, builder).
