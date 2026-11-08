PHASE HANDOFF — ShotCaller — Phase 4 → Phase 5

Use the `phased-project` skill. You are starting Phase 5.
At the end of this phase, write a new handoff in this same format for Phase 6
(and tell that chat to do the same), so every phase hands off to the next.

Project folder: D:\ShotCaller
Read first: PROJECT_PLAN.md, DESIGN.md, README.md (dev + release process), games/README.md

## Project in one paragraph
ShotCaller is a polished, official-looking Electron desktop app: a cross-game achievement hub (Steam first, real-time unlock popups, XP, profiles, friends) plus per-game overlay modules. The first game module is Skillshot City (free-to-play roguelite battle royale, Steam app 308600, SkillshotCity.exe). Public MIT repo https://github.com/Battlebornplayz/ShotCaller, installed from GitHub Releases, with a launcher splash that offers updates. Stack: Electron 45 + TypeScript + React 19 + Vite 8 (electron-vite), electron-builder, electron-updater, uiohook-napi; Firebase JS SDK v12 (dormant, see Phase 4).

## Done so far
- Phase 1: design interview → DESIGN.md + 12-phase PROJECT_PLAN.md.
- Phase 2: app shell, launcher splash, stable/beta channels, CI + tag-triggered NSIS/AppImage releases; v0.0.1 → v0.0.2 update verified.
- Phase 3: games, detection, overlay, tray, hotkeys; released as v0.0.3.
- Phase 4 (just finished, DEFERRED by the user): accounts are built but not switched on.
  - Backend switched Supabase → Firebase (Auth + Firestore, free Spark plan). Steam and Discord sign-in dropped; Google (PKCE, loopback 127.0.0.1:47615-47617) + email/password remain.
  - Main process: `electron/cloudConfig.ts` (empty Firebase config + Google desktop client; `cloudConfigured()`), `auth.ts` (Firebase in main, safeStorage-encrypted `FilePersistence`, profile + username transaction, live profile listener, link/unlink), `loopback.ts`, `crashReports.ts` (opt-in, to Firestore). Renderer: `src/shell/AccountPage.tsx` (Profile page, Settings Account + Privacy cards). `firestore.rules`, `firebase.json`, `docs/FIREBASE.md` (setup steps).
  - Because the config is empty, the Settings Account and Privacy cards are hidden and the Profile page says "Accounts are coming later". Nothing has run against a real Firebase project.

## Phase 5 goal
The main reason to download it: the Steam achievement hub.
Deliverables:
- Steam Web API proxy (key server-side; host decided at phase start). SteamID from local `loginusers.vdf`.
- Pull owned games, achievements, global rarity for any Steam game (via proxy).
- Library: toggle cover grid (completion rings) / banner list (progress bars).
- Game page: achievement list with progress bars, rarity %, completion %, secrets blurred until click, easiest-first sort, links to Steam guides/web; playtime + sessions.
- Real-time unlock detection by watching Steam's local stats cache; corner-card popup (icon, name, rarity) with sound that gets fancier with rarity.
- Unlock timeline.
Done when:
- Unlocking a real Steam achievement shows the popup within seconds and it appears in the timeline and game page.

## Decisions & constraints to respect
- No memory reading / injection, ever. The Steam Web API key never ships in the app: Steam API calls go through a server-side proxy. Decide its host first: Cloudflare Worker (free, no card) or Firebase Cloud Functions (Blaze plan, card required). The user sets secrets and runs CLI logins themselves.
- No accounts this phase: store achievement data, unlock timeline and sessions locally (userData), shaped so it can sync to Firestore later (`users/{uid}/unlocks`).
- Privacy: no usage analytics; crash reports opt-in (and only once accounts are live).
- Renderer talks to main only through `window.shotcaller` (contextIsolation + sandbox on). Add IPC names to `shared/ipc.ts`, types to `shared/types.ts`, settings fields to `electron/settings.ts` (keep `sanitize()` strict). Existing Steam parsing lives in `electron/steam.ts` (VDF parser).
- Look: Mobalytics-inspired navy (#0F1023 / #1A1C3A / #090A18), #4F8CFF accent, lavender #8F93C9; reuse classes in `src/styles/global.css` (card, pill, btn, toggle, row, section-label).
- Releasing: push an annotated tag (`git tag -a vX.Y.Z -m "notes"`); CI sets the version. Tag message = launcher patch notes.
- The user wants to save usage: they're happy to do manual GUI testing themselves, so give them short checklists instead of driving the desktop at length.

## Loose ends / known issues
- Accounts (Phase 4) deferred: to finish later (before Phase 10 Social), the user creates the Firebase project and Google Desktop OAuth client per `docs/FIREBASE.md`, sends the public config values for `electron/cloudConfig.ts`, deploys rules (`npx firebase deploy --only firestore`), then tests sign-in with Google and email on two PCs. Unverified assumptions: custom auth persistence and Firestore in the Electron main process, Google ID token from the desktop client accepted by `signInWithCredential`.
- Commits for Phase 4 are local, not pushed yet.
- v0.0.3 checks still open: tray icon, "Start with your computer", no "Alt-key listener couldn't start" warning. v0.0.4 will be the first real test that updates install silently in place.
- Not tested yet: second-monitor mode, hotkey-popup mode, tray menu and close-to-tray, the "Add a game" file picker, onGameLaunch = "open ShotCaller".
- Skillshot City minimizes when another window takes focus; the default overlay position covers its QUIT button (revisit in Phase 8).
- Linux: AppImage, `/proc` detection, Proton argv matching and the uiohook X11 hook are untested on real Linux.
- Unsigned builds → SmartScreen warning (documented). Renderer bundle is one chunk (the Firebase SDK is main-process only).

## How to start
(Shortcut: in a new chat in D:\ShotCaller, type `/handoff` — it reads this file.)
1. Read the files above.
2. Confirm the phase goal with the user in 1-2 lines.
3. Begin.
