PHASE HANDOFF — ShotCaller — Phase 6 Part 1 (in progress) → Phase 6 Part 1 (continue)

Use the `phased-project` skill. You are continuing Phase 6 Part 1 (Skillshot City: skills, synergies, live match tracking).
At the end of this phase, write a new handoff in this same format for the next phase
(and tell that chat to do the same), so every phase hands off to the next.

Project folder: D:\ShotCaller
Read first: PROJECT_PLAN.md (Phase 6 Part 1 / Part 2), DESIGN.md ("Phase 6 decisions" — P6-Q1…Q41 plus the notes after them), games/README.md

## Project in one paragraph
ShotCaller is a polished Electron desktop app: a cross-game achievement hub (Steam, Anker Games, emulator files, hand-added games; unlock popups, library, timeline) plus per-game overlay modules. First module: Skillshot City (Steam app 308600, installed at D:\SteamLibrary\steamapps\common\SkillshotCity). Public MIT repo Battlebornplayz/ShotCaller, installed from GitHub Releases with a self-updating launcher. For now it's for the user's own PC. Stack: Electron 45 + TypeScript + React 19 + electron-vite, electron-builder, electron-updater, uiohook-napi.

## Done so far
- Phases 1-3: design, app shell + auto-update + CI releases, games/detection/overlay/tray/hotkeys (v0.0.3).
- Phase 4: Firebase accounts built but deferred/dormant.
- Phase 5: achievement hub (committed as f9d8782, not released yet).
- Phase 6 setup interview (this chat): 41 questions answered → DESIGN.md "Phase 6 decisions". Phase 6 split into Part 1 (skills/synergies/live tracking) and Part 2 (weapons/items/counters/library/achievements).
- Phase 6 Part 1 so far (commits d949bbf, 4d88649; not pushed):
  - `electron/skillshot/gamedata.ts`: reads the game's own files read-only — `data/translations/<lang>.csv` (54 skills: name, description, short, mutation; 8 classes), synergy list from the startup lines of `data/log*.txt` ("Prerequs For Synergy Challenge"; 80 synergies, tips from SYNERGYCHALLENGE_<i>_DESC), `config.ini` (version, language). Types in `shared/skillshot.ts`.
  - `shared/skillshotLog.ts`: pure log parser + match reducer (joined, self, levelUp, draftStart, poolSlot, draft offers/selected, br round, round win/loss, kills with weapon, syringes, wanted, winner, final standings with skills/round wins). Splits matches on draft #1 / round going back / Game Joined. Tested on the real logs: 12 matches, 4 with full standings.
  - `shared/skillshotAdvisor.ts`: scores offers (tier, official synergies with build + class, level-ups, goal build, your win rate per skill), reroll advice, active synergies, goal progress, suggested goal build.
  - `electron/skillshot/tracker.ts`: imports all 4 logs on start into userData/skillshot/matches.json (logs rotate every game launch, only 4 kept), watches log.txt with fs.watch (+5 s fallback), live MatchState, manual offers/picks (pending until the log confirms), goal + class prefs, pushes `SkillshotLiveState` on every change.
  - IPC wired: `shared/ipc.ts` skillshot:* channels, preload + `ShotCallerApi` (getSkillshot/onSkillshot/getSkillshotData/getSkillshotMatches/setSkillshotOffer/pickSkillshot/setSkillshotGoal/setSkillshotClass), main.ts init/dispose/broadcast, overlay.ts routes Alt+1/Alt+2/Alt+N/Alt+E to the tracker when the running game is skillshot-city. Typecheck clean. Not run in the app yet.
  - `games/skillshot-city/tiers.json` exists but is empty `{}`.

## Phase 6 Part 1 goal (remaining)
Deliverables, in order:
- Overlay UI (replace the placeholder `SkillshotRoundPanel` in `games/panels.tsx`): advice cards side by side (recommended highlighted, tier badge, one-line reason, synergy glow), reroll banner, soft sound cue on a new offer, last-3-picks strip; round strip during fights (R x/3, level, K/D, build chips) that expands to the full panel on level-up / between rounds / Alt held; build panel with rarity borders, level pips, synergy links; synergy meter (goal % + active count); goal build suggest/lock; class picker; lobby view = last match mini recap + session goals.
- Manual pick: icon grid + type-to-search to set the 2 offered skills; Alt+1 / Alt+2 pick.
- Second-monitor window: richer build-help layout (user request).
- Recap: overlay card at match end + match history page in the app with pick review; stats per skill/synergy/build/class with trends; win % (1st) + average place + top-3; session goals (suggested + own).
- Lookup page in the app + compact overlay search (filters by tree/tag/tier, synergy map, your stats per skill). Text follows the game's language.
- Real skill icons: crop from the game's texture sheets (`data/textures/menuTextures*.png`, skill wheel) — figure out the atlas.
- Tier list: research community guides to draft `tiers.json` (tier/role/tags per skill id), adjusted by the user's win rates.
- Overlay fixes: default position top right but BELOW the game's QUIT button (1920×1080; QUIT is the top-right corner); Alt-click must not steal focus, restore the game if it minimizes.
- Then (user's order: overlay first, memory next): read-only memory reader + Cheat-Engine-style scanner (own player only: level, XP, health + shield as numbers, offers, round, timer), behind a setting with a risk warning; screen reading of the 2 offers (icon match + OCR, offline) as the non-memory live source.
- Release beta v0.0.4 at the end of Part 1.
Done when:
- A full 3-round match is tracked end-to-end with skill advice at each level-up, the round/synergy panel and a saved recap.

## Decisions & constraints to respect
- Auto-detect everything possible (user rule). Game files are read-only. Log is written in BATCHES (up to ~2.5 min late) — verified live; every line carries its own unix time, so it's the confirming source; live comes from manual pick now, then memory / screen reading.
- Memory reading: user accepted the ban risk (no client anti-cheat in the install today). Read-only, own player's state only, never other players' hidden info, switchable off. No packet sniffing for now (Npcap can't be bundled without an OEM license; ENet protocol is custom/compressed).
- Push, not pull: main process pushes state to windows (user asked). Keep it that way.
- One advice mode for everyone (P6-Q9 A). Class can't be read reliably yet (standings classID mapping unverified) → user picks class; memory reader can fill it later.
- Renderer only talks through `window.shotcaller`; add IPC names to `shared/ipc.ts`, types to `shared/types.ts`/`shared/skillshot.ts`, settings to `electron/settings.ts` (keep `sanitize()` strict).
- Look: navy (#0F1023 / #1A1C3A / #090A18), #4F8CFF accent, lavender #8F93C9; reuse classes in `src/styles/global.css`.
- Some files have CRLF line endings: when patching with scripts, normalize line endings first.
- Question widgets for the user: clickable buttons + "Send answers" (see memory).
- The user does GUI testing themselves: give short checklists. Quit the installed ShotCaller (tray) before `npm run dev`.

## Loose ends / known issues
- Nothing pushed to GitHub since v0.0.3; Phase 5 + Phase 6 commits are local only.
- 5 skills have no `DESC_01` text (ASSASSINATE, CHARGEDSHOT, FORCEFIELD, SHOCKWAVE, SKILLSHOTS) — find their description key in en.csv.
- Some imported matches have no round lines or standings (left early or other mode); recap must handle `place: null`.
- Kill counts from "X killed Y" lines run slightly higher than the standings' kills; standings win when present.
- Older loose ends from Phase 5 (Prettier drift, untested tray/second-monitor/Linux) still open.

## How to start
(Shortcut: in a new chat in D:\ShotCaller, type `/handoff` — it reads this file.)
1. Read the files above.
2. Confirm the goal with the user in 1-2 lines.
3. Begin with the overlay UI.
