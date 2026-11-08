PHASE HANDOFF — ShotCaller — Phase 5 → Phase 6

Use the `phased-project` skill. You are starting Phase 6.
At the end of this phase, write a new handoff in this same format for Phase 7
(and tell that chat to do the same), so every phase hands off to the next.

Project folder: D:\ShotCaller
Read first: PROJECT_PLAN.md, DESIGN.md (incl. "Phase 5 decisions"), README.md (dev + release process), games/README.md

## Project in one paragraph
ShotCaller is a polished, official-looking Electron desktop app: a cross-game achievement hub (Steam, Anker Games and local emulator files, plus hand-added games; real-time unlock popups, library, timeline) plus per-game overlay modules. The first game module is Skillshot City (Steam app 308600). Public MIT repo https://github.com/Battlebornplayz/ShotCaller, installed from GitHub Releases with a self-updating launcher splash. For now it's for the user's own PC. Stack: Electron 45 + TypeScript + React 19 + Vite 8 (electron-vite), electron-builder, electron-updater, uiohook-napi; Firebase JS SDK v12 (dormant).

## Done so far
- Phase 1: design interview → DESIGN.md + 12-phase PROJECT_PLAN.md.
- Phase 2: app shell, launcher splash, stable/beta channels, CI + tag-triggered NSIS/AppImage releases.
- Phase 3: games, detection, overlay, tray, hotkeys; released as v0.0.3.
- Phase 4: accounts (Firebase, Google + email) built but DEFERRED and dormant.
- Phase 5 (just finished, verified by the user in the dev build): achievement hub.
  - Local-first, no Steam API key or proxy. `electron/binkv.ts` (binary KeyValues), `steamLocal.ts` (SteamID from loginusers.vdf, schema `appcache/stats/UserGameStatsSchema_<appid>.bin`, unlocks + times `UserGameStats_<accountid>_<appid>.bin`, progress stats, playtime from `userdata/<id>/config/localconfig.vdf`), `steamPublic.ts` (keyless: global rarity, public achievement page parse, store search, app names; cached in userData/cache/steam).
  - User additions: `emulators.ts` (read-only GSE/Goldberg JSON, CODEX/RUNE and OnlineFix INI), `anker.ts` (Anker launcher `library.json` → games with install dir, exe, Steam app id). Hand-added/Anker games can link a Steam list or use custom achievements; non-Steam unlocks can be ticked.
  - `achievements.ts` (hub: builds lists, fs.watch + 10 s mtime poll, diffs unlocks → popup, timeline, ticks/custom in achievements.json, background rarity), `sessions.ts` (sessions.json from detection), `popup.ts` + `windows.ts#createPopupWindow` (click-through, always-on-top card window).
  - `library.ts` now also lists played-but-uninstalled Steam games, Anker games (`anker:<id>`), emulator-only games (`emu:<appid>`) and Steam links. `LibraryGame` gained `achievementAppId`, `poster`; sources `anker`, `emulator`.
  - Renderer: `src/shell/hub/` (LibraryPage cover grid with rings / list with bars, GamePage, TimelinePage, art fallbacks), `src/popup/` (PopupApp card with tier animations, `sounds.ts` Web Audio tiers), `src/components/achievements.tsx`, Settings → Unlock popups (toggle, sound, volume, corner, per-tier test). New "Timeline" nav section.

## Phase 6 goal
The actual Skillshot City helper and everything for its overlay. (The user moved this ahead of the hub home/XP phase, which is now Phase 7; the plan was renumbered, see PROJECT_PLAN.md.)
Deliverables, in priority order:
- Data: JSON schema for skills, items, weapons, synergies, counters in `games/skillshot-city/`. Research the game (wiki, Steam guides, community) to draft the data and icons; the user verifies in-game. Quick lookup page.
- Skill pick advisor in the overlay: side-by-side cards for the 2 offered skills, recommended one highlighted, short reason; manual pick via icon grid + type-to-search; Alt+1 / Alt+2 choose.
- Build target mode (pick a goal build; offers that fit light up) and synergy alerts.
- Round tracker panel: round X/3, build icons, synergy meter. Alt+N next round, Alt+E end match + recap.
- Post-match recap, build win-rate stats, session goals.
- Build library: saved builds, share codes, counter tips.
- ShotCaller custom achievements for Skillshot City, driven by recaps (plug into the existing custom-achievement system from Phase 5).
- Overlay fixes: default position must not cover Skillshot City's QUIT button; handle the game minimizing when it loses focus.
- If time allows (otherwise carry to Phase 7): data packs updated separately from app updates + CONTRIBUTING guide for community data PRs.
Done when:
- A full 3-round match can be tracked end-to-end in the overlay with skill advice, the round/synergy panel and a saved recap.

## Decisions & constraints to respect
- Skillshot City design decisions: DESIGN.md batches 2 and 5 (advice = side-by-side cards with reason; round HUD = full panel with synergy meter; full animations; overlay top right, 70% idle opacity, click-through until Alt). Overlay only works in borderless/windowed mode. Screen-reading auto-detect is Phase 8 — build the manual pick so auto-detect can plug in later.
- Data stays local (userData JSON), shaped to sync to Firestore later (`users/{uid}/unlocks`, unlock ids are "<gameKey>|<achievementId>"). `getTimeline()` / `getHubState()` in `electron/achievements.ts` are the hub's data source (Phase 7 Home/XP will use them); rarity tiers via `rarityTier()` in `shared/types.ts` (≤2 legendary, ≤10 epic, ≤25 rare, ≤50 uncommon).
- No memory reading / injection. Never download games or write to Steam/emulator files. Emulator files are read-only (user changed Q23 in Phase 5). No Steam API key ships in the app.
- Renderer talks to main only through `window.shotcaller` (contextIsolation + sandbox on). Add IPC names to `shared/ipc.ts`, types to `shared/types.ts`, settings fields to `electron/settings.ts` (keep `sanitize()` strict).
- Look: navy (#0F1023 / #1A1C3A / #090A18), #4F8CFF accent, lavender #8F93C9; tier colors in `src/components/achievements.tsx`; reuse classes in `src/styles/global.css` (card, pill, btn, toggle, row, section-label, segmented, progress).
- Image CSP allows `https://*.steamstatic.com` and `https://ankergames.net` (src/index.html).
- Releasing: push an annotated tag (`git tag -a vX.Y.Z -m "notes"`); CI sets the version. Tag message = launcher patch notes.
- The user does GUI testing themselves: give short checklists. The installed ShotCaller in the tray blocks `npm run dev` (single-instance lock); quit it first.
- Shell note: in this environment, inline Python/heredoc scripts with quotes can break; write scripts to the scratchpad and run them.

## Loose ends / known issues
- Phase 5 work is not released yet (no tag since v0.0.3). v0.0.4 would also be the first real test that updates install silently in place. Check whether Phase 5 was committed/pushed (`git status`).
- Steam games never launched through Steam on this PC have no local schema; their list loads from the public page when you open the game page, but they don't appear in the library unless installed.
- Emulator saves whose app id doesn't match an Anker/Steam entry show as separate `emu:<appid>` games (e.g. The Farmer Was Replaced: Anker says 2060160, GSE save is 1028310).
- Prettier reports style drift in ~44 files (mostly pre-existing); run `npm run format` in its own commit if wanted.
- Accounts (Phase 4) deferred: finish before Phase 9 (Social) per `docs/FIREBASE.md`.
- Still untested from earlier phases: tray icon/"Start with your computer" in v0.0.3, second-monitor and hotkey-popup overlay modes, close-to-tray, onGameLaunch = "open ShotCaller", Linux (AppImage, /proc detection, Proton, X11 hook).
- Skillshot City minimizes when another window takes focus; the default overlay position covers its QUIT button (fix in this phase).
- Unsigned builds → SmartScreen warning (documented).

## How to start
(Shortcut: in a new chat in D:\ShotCaller, type `/handoff` — it reads this file.)
1. Read the files above.
2. Confirm the phase goal with the user in 1-2 lines.
3. Begin.
