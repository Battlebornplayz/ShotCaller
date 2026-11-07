PHASE HANDOFF — ShotCaller — Phase 2 → Phase 3

Use the `phased-project` skill. You are starting Phase 3.
At the end of this phase, write a new handoff in this same format for Phase 4
(and tell that chat to do the same), so every phase hands off to the next.

Project folder: D:\ShotCaller
Read first: PROJECT_PLAN.md, DESIGN.md, README.md (dev + release process), games/README.md

## Project in one paragraph
ShotCaller is a polished, official-looking Electron desktop app: a cross-game achievement hub (Steam first, real-time unlock popups, XP, profiles, friends) plus per-game overlay modules. The first game module is Skillshot City (free-to-play roguelite battle royale, Steam app 308600) with a skill-pick advisor, build tools and a round tracker. Public MIT repo https://github.com/Battlebornplayz/ShotCaller, installed from GitHub Releases, with a launcher splash that offers "Update to latest version" when a newer release exists. Stack: Electron 45 + TypeScript + React 19 + Vite 8 (electron-vite), electron-builder, electron-updater; Supabase from Phase 4.

## Done so far
- Phase 1: 50-question design interview → DESIGN.md + 12-phase PROJECT_PLAN.md.
- Phase 2 (just finished): app shell that updates itself from GitHub.
  - `electron/` main process: `main.ts` (single instance, splash → main), `windows.ts` (frameless splash + main, one renderer bundle chosen by `?window=splash|main`), `ipc.ts`, `settings.ts` (JSON in userData), `updater.ts` (electron-updater, autoDownload off, beta = allowPrerelease), `patchNotes.ts` (GitHub releases API). `electron/preload.ts` exposes `window.shotcaller` (typed in `shared/types.ts`; IPC names in `shared/ipc.ts`).
  - `src/` renderer: `splash/SplashApp.tsx` (logo placeholder, patch notes, Play, update / progress / restart), `shell/` (game-icon rail, section nav, placeholder pages, Settings with Stable/Beta channel), theme tokens in `src/styles/global.css`.
  - `games/`: `types.ts` (GameModule), `index.ts` registry, `skillshot-city/` stub.
  - CI (`.github/workflows/ci.yml`: typecheck, lint, build) and Release (`release.yml`: on `v*` tag → creates release from the annotated tag message, builds NSIS .exe + AppImage, uploads with latest.yml / latest-linux.yml; `-beta.N` tags → pre-release).
  - v0.0.1 and v0.0.2 published on GitHub Releases. Update flow verified end to end: v0.0.1 installed from Releases, the splash offered v0.0.2, and clicking Update → Restart installed and relaunched as v0.0.2.

## Phase 3 goal
ShotCaller knows what you're playing and can draw an overlay.
Deliverables:
- Game module system (`games/<id>/` manifest: name, exe names, Steam app id, art, optional overlay panels). Flesh out the Skillshot City module (Steam app 308600). Generic module for any other game.
- Game detection: running-process watcher, Steam library import (local `libraryfolders.vdf` / app manifests), add game manually.
- Tray app; auto-open when a supported game launches.
- Overlay window: transparent, always-on-top, top-right default, draggable, 70% idle opacity, click-through until Alt held; three presence modes (always-on, hotkey popup, second-monitor window) chosen in settings.
- Global hotkeys (Alt+S/1/2/R/E/H), rebindable in settings.
- Settings page (overlay, hotkeys, startup, channel) — extend the existing Settings page in `src/shell/pages.tsx`.
Done when:
- Launching Skillshot City opens ShotCaller and shows a placeholder overlay panel over the game; hotkeys work; settings persist.

## Decisions & constraints to respect
- No memory reading / injection, ever. Overlay is a separate always-on-top window; works over borderless/windowed only (document that exclusive fullscreen hides it).
- Multi-game from day one: Skillshot City is just the first module; extend `GameModule` in `games/types.ts` rather than special-casing it.
- Look: Mobalytics-inspired navy (#0F1023 page / #1A1C3A cards / #090A18 sidebar), #4F8CFF accent, lavender muted text #8F93C9, rounded cards, pill badges, full animations. Reuse the classes/tokens in `src/styles/global.css`.
- Settings live in `electron/settings.ts` (sanitized JSON in userData); add new fields there, keep `sanitize()` strict.
- Renderer talks to main only through `window.shotcaller` (contextIsolation + sandbox on). Add IPC names to `shared/ipc.ts` and types to `shared/types.ts`.
- Releasing: bump nothing by hand; push an annotated tag (`git tag -a vX.Y.Z -m "notes"`), CI sets the version from the tag. Tag message = launcher patch notes.
- Git commits use the noreply identity already set in the repo's local git config.

## Loose ends / known issues
- The v0.0.1 → v0.0.2 update ran the installer wizard (non-silent quitAndInstall) and the install moved from per-user (%LOCALAPPDATA%\Programs\ShotCaller) to per-machine (C:\Program Files\ShotCaller). Fixed on main after v0.0.2: updates now install silently in place (`quitAndInstall(true, true)` in electron/updater.ts). Not yet in a release; the next tag ships it, and only updates *from* that version use it. Worth one test update when Phase 3 releases.
- Linux AppImage builds and publishes but hasn't been run on a Linux machine yet.
- Local `package.json` says 0.0.2 (matches the latest tag); CI overrides it from the tag anyway.
- Default Electron icon on the installer/app until the logo phase (Phase 11); add `build/icon.ico` + `build/icon.png` then.
- Builds are unsigned → SmartScreen warning (documented in README).
- `gh` was installed this phase at C:\Program Files\GitHub CLI\gh.exe (logged in with repo + workflow scopes); new shells pick it up from PATH.
- Renderer bundle is ~600 kB in one chunk (fine for now).

## How to start
(Shortcut: in a new chat in D:\ShotCaller, type `/handoff` — it reads this file.)
1. Read the files above.
2. Confirm the phase goal with the user in 1-2 lines.
3. Begin.
