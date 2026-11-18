PHASE HANDOFF — ShotCaller — Phase L2 → Phase F4

Use the `phased-project` skill. You are starting Phase F4 (Fortnite: inventory, ranked, bests, achievements).
At the end of this phase, write a new handoff in this same format for Phase F5
(and tell that chat to do the same), so every phase hands off to the next.

Project folder: D:\ShotCaller
Read first: PROJECT_PLAN.md ("Phase F4", then "Phase F5"), DESIGN.md ("Fortnite mode" decisions, "Found while building L2" for beta naming), games/fortnite/ (module, readers, hub), electron/windows.ts (keepOutOfScreenCopies), shared/fortnite.ts.

## Project in one paragraph
ShotCaller is a polished Electron desktop app: a cross-game achievement hub plus per-game overlay modules (Skillshot City, paused; the Fortnite companion), and a Games tab that launches games from every store on the PC. Public MIT repo Battlebornplayz/ShotCaller, installed from GitHub Releases with a self-updating launcher (Stable/Beta). For the user and a friend. Stack: Electron + TypeScript + React 19 + electron-vite, electron-builder, electron-updater, uiohook-napi, koffi.

## Done so far
- Phases 1-3, 5 done; Phase 4 dormant; Skillshot paused. Phases F1-F3 done (beta.3-19); squad link pulled forward. Phase L1 (Games tab: Steam/Epic/Xbox, grid, Play) done in beta.20. Setup overhaul is Phase S (after Phase F).
- Phase L2 (just finished, v0.0.4-beta.21 titled "e21", branch `phaseF1/fortnite-foundation`, commits 561f75c + ecc5077): More section of the Games tab. Store readers in `electron/stores/` (gog, ea, ubisoft, battlenet, riot, rockstar, amazon, itch; shared `extra.ts` shape + `registry.ts` one PowerShell registry read; SQLite via `node:sqlite`), emulators in `stores/roms.ts` (RPCS3/Ryujinx/mGBA: pick program + game folders, one card per file), Epic free games in `stores/epicFree.ts` (Home card + More row), drag-drop add (exe, .lnk, .url, game files) via `addGameFromPath`, Anker launch profiles/playtime/Open in Anker. UI: `src/shell/games/MorePanel.tsx`, "Set up more" entry in the left list. Release workflow now takes the release title from the tag's first line. User checked it in the dev app: all good.

## Phase F4 goal
Inventory, ranked, bests, achievements (PROJECT_PLAN.md "Phase F4").
Deliverables:
- Hotbar reading: 5 slots with item + rarity, ammo in each gun, reserve ammo, materials, health and shield, medallions and mythics; live inventory panel on the second monitor.
- Loadout history: final loadout per match and "best loadouts" by placement.
- Ranked rank + progress bar read after Ranked matches, chart over time.
- 0-100 match score with the formula shown; personal bests and streaks (kills, chests, top-10 streak, win streak).
- Fortnite achievements in the hub with the unlock popup.
- Release a beta (next: v0.0.4-beta.22). **Before publishing, offer name options** (default "e22"; the version tag stays `-beta.N`, the tag's first line is "ShotCaller eN (v0.0.4-beta.N)") and **ask the user before publishing**.
Done when:
- Inventory and ranked read right in real matches, and the beta installs and updates.

## Decisions & constraints to respect
- **Never read Fortnite's memory, inject, hook or touch its process/files** beyond the log (match start/end). Screen reading, the log and fortnite-api.com only. Every feature has its own on/off switch; overlay parts are see-through. Tuned for 1920x1080, default HUD.
- Any new over-game window needs `keepOutOfScreenCopies` in `electron/windows.ts`.
- The fortnite-api.com and SteamGridDB keys are secrets (userData, encrypted; never in repo/settings/logs/chat).
- IPC pattern: channel in `shared/ipc.ts`, handler in `electron/ipc.ts`, bridge in `electron/preload.ts`, type in `shared/types.ts`.
- Publish each finished step as a beta (annotated tag, patch notes file, `-F`) only after it runs in the app and **only after the user says OK**, with name options first.
- Order: Phase F4, then F5, then Phase S.
- User is new: plain words, click-to-pick question widgets. Dev app: `npm.cmd run dev` (ask before quitting the installed app). Some files are CRLF (GamesPage.tsx, shared/ipc.ts, pages.tsx, PHASE_LOG.md), most LF: edit with small Python scripts written to a file (inline bash heredocs with backticks break) that keep each file's endings. `reports/`, `research_notes/` stay untracked.

## Loose ends / known issues
- L2 readers not tried on a real install: EA, Battle.net, Riot, Amazon, itch.io, RPCS3 (none on the user's PC). Rockstar native installs untested (only a Steam copy here).
- Not possible from local files: Steam owned-not-installed (needs sign-in), Game Pass tag, Xbox install size; Epic launch options.
- Fortnite: dot accuracy 81-94% on recordings; squad link never tested between two PCs (F5); team-mode placement empty; M layer on 125%/150% screens unchecked; world→map fit is per season.
- `phaseF1/fortnite-foundation` isn't merged to main; ask before merging.

## How to start
1. Read the files above.
2. Confirm the Phase F4 goal with the user in 1-2 lines.
3. Begin.
