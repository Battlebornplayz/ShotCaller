PHASE HANDOFF — ShotCaller — Phase L1 → Phase L2

Use the `phased-project` skill. You are starting Phase L2 (Games tab: More section, other stores, emulators, extras).
At the end of this phase, write a new handoff in this same format for Phase F4
(and tell that chat to do the same), so every phase hands off to the next.

Project folder: D:\ShotCaller
Read first: PROJECT_PLAN.md ("Phase L2", then "Phase F4"), DESIGN.md ("Games tab (launcher)" L-Q1-67 and "Found while building L1"), electron/library.ts, electron/stores/*.ts, electron/launcher.ts, electron/anker.ts, src/shell/games/GamesPage.tsx.

## Project in one paragraph
ShotCaller is a polished Electron desktop app: a cross-game achievement hub plus per-game overlay modules (Skillshot City, paused; the Fortnite companion), and now a Games tab that launches games from every store on the PC. Public MIT repo Battlebornplayz/ShotCaller, installed from GitHub Releases with a self-updating launcher (Stable/Beta). For the user and a friend. Stack: Electron + TypeScript + React 19 + electron-vite, electron-builder, electron-updater, uiohook-napi, koffi.

## Done so far
- Phases 1-3, 5 done; Phase 4 dormant; Skillshot paused. Phases F1-F3 done (beta.3-19); squad link pulled forward. Setup overhaul is Phase S (after Phase F).
- Phase L1 (just finished, v0.0.4-beta.20, branch `phaseF1/fortnite-foundation`, commit 9fc4ebe): the Library page became the **Games** tab. Store readers in `electron/stores/` (`epic.ts`: .item manifests + catcache.bin art; `xbox.ts`: one PowerShell Get-AppxPackage run, packages with MicrosoftGame.config; `steamGrid.ts`: optional encrypted SteamGridDB key). `electron/library.ts` merges everything into one card per game (`normName`; key priority steam > module > epic > xbox, `copies`/`extraDirs`), fills owned/genres/Steam name matches/art in the background, watches store folders (4 s debounce), records firstSeen for Recently added / "Added X" toast. `electron/launcher.ts`: Play/Install/Uninstall through the store (steam://, Epic launcher URI, `shell:AppsFolder\PFN!App`), exe for Anker/hand-added, desktop shortcuts. UI in `src/shell/games/` (GamesPage left list + grid + filters, GameHero, gameMenu right-click, CommandPalette Ctrl+K, common.tsx toasts/menus/modals), Settings › Game stores, tray recent games, Home Continue playing strip. On the user's PC: 32 Steam installed (+played), Fortnite (Epic, merged into the module card), Minecraft Dungeons II + Minecraft Launcher (Xbox). User checked it in the dev app: all good.

## Phase L2 goal
The More section of the Games tab: extra sources beyond Steam/Epic/Xbox (see PROJECT_PLAN.md "Phase L2").
Deliverables:
- More section of the left list where extra sources are set up: Anker Games (already listed under More and played from its exe in L1; add achievements and Open in Anker), GOG, EA, Ubisoft, Battle.net, Riot, Rockstar, Amazon, itch.io; emulators RPCS3, Ryujinx, mGBA (pick game folders once, each file becomes a card that opens in the right emulator); games added by hand (browse or drag-drop an exe or shortcut). Everything also shows in the main grid.
- Epic free games of the week: card on Home and a row in More.
- New store readers go in `electron/stores/<store>.ts`, merge through `build()` in library.ts (add the source to GameSource, SOURCE_LABEL/BADGE in common.tsx, launchTarget in launcher.ts, watchers).
- Release a beta (next: **beta.21**), **ask the user before publishing**.
Done when:
- Anker games and the other stores installed on the user's PC show and start, and the beta installs and updates.

## After Phase L: Phase F4 goal
Inventory, ranked, bests, achievements (see PROJECT_PLAN.md "Phase F4"): hotbar reading (5 slots, rarity, ammo, mats, health/shield, medallions), loadout history, ranked progress chart, 0-100 match score, personal bests/streaks, Fortnite achievements with unlock popups. Done when inventory and ranked read right in real matches and the beta installs and updates.

## Decisions & constraints to respect
- Read-only on other launchers' files; never store passwords; no store sign-in in L2 (later, optional). Play always goes through the game's own store/launcher when it has one.
- The SteamGridDB key and the fortnite-api.com key are secrets (userData, encrypted; never in repo/settings/logs/chat).
- **Never read Fortnite's memory, inject, hook or touch its process/files.**
- Any new over-game window needs `keepOutOfScreenCopies` in `electron/windows.ts`.
- IPC pattern: channel in `shared/ipc.ts`, handler in `electron/ipc.ts`, bridge in `electron/preload.ts`, type in `shared/types.ts`. `getLibrary` is cached 15 s; call `refreshLibrary` after changes.
- Store badges are coloured letters, not the stores' logos. CSP img-src in `src/index.html` must allow any new art host.
- Publish each finished step as a beta (annotated tag `v0.0.4-beta.N`, patch notes in a file, `-F`) only after it runs in the app and **only after the user says OK**.
- Order: Phase L2, then F4, F5, then Phase S.
- User is new: plain words, click-to-pick question widgets. `npm.cmd run dev` (ask before quitting the installed app). Some files are CRLF, most LF: edit with small Python scripts that keep each file's endings. `reports/`, `research_notes/` stay untracked.

## Loose ends / known issues
- Not possible from local files (DESIGN.md "Found while building L1"): Steam owned-not-installed (Steam's games list now needs sign-in), Game Pass tag, Xbox install size; Epic launch options unsupported. A Steam sign-in option would bring the owned list back.
- Fortnite loose ends unchanged: dot accuracy 81-94% on recordings; squad link never tested between two PCs (F5); team-mode placement empty; M layer on 125%/150% screens unchecked; world→map fit is per season.
- `phaseF1/fortnite-foundation` isn't merged to main; ask before merging.

## How to start
1. Read the files above.
2. Confirm the Phase L2 goal with the user in 1-2 lines.
3. Begin.
