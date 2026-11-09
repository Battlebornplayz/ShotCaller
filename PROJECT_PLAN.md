# ShotCaller — Project Plan

One phase per chat, using the `phased-project` skill. Each phase ends with a handoff (`HANDOFF.md`) for the next.
Target: **v0.1** = everything below, released to friends via GitHub Releases. Decisions live in `DESIGN.md`.

Stack: Electron + TypeScript + React + Vite, electron-builder (NSIS .exe + AppImage), electron-updater (GitHub Releases, stable + beta channels), Firebase (Auth + Firestore, free Spark plan).

---

## Phase 1 — Design ✅
50 design questions answered. `DESIGN.md` written. This plan written.

## Phase 2 — Foundation, repo and auto-update ✅
Goal: an installable app shell that updates itself from GitHub.
Deliverables:
- `git init`, public repo `Battlebornplayz/ShotCaller` (MIT, README, .gitignore), push existing docs.
- Electron + TS + React + Vite scaffold; lint/format; folder layout with `games/` module slot.
- Launcher splash (gamer-launcher style): logo placeholder, patch notes from the GitHub release body, big Play button, "Update to latest version" button when a newer release exists, progress bar while downloading, restart to apply.
- Stable/beta channel setting (beta = GitHub pre-releases).
- Main window shell: Mobalytics-inspired dark navy theme (#4F8CFF accent), game-icon sidebar, empty section pages.
- GitHub Actions: build Windows NSIS + Linux AppImage on tag push, publish to Releases.
Done when:
- v0.0.1 installed from Releases; publishing v0.0.2 makes the splash show the update button, and clicking it updates and relaunches.

## Phase 3 — Games, detection, overlay framework ✅
Goal: ShotCaller knows what you're playing and can draw an overlay.
Deliverables:
- Game module system (`games/<id>/` manifest: name, exe names, Steam app id, art, optional overlay panels). Skillshot City module stub (Steam app 308600). Generic module for any other game.
- Game detection: running-process watcher, Steam library import (local `libraryfolders.vdf` / manifests), add game manually.
- Tray app; auto-open when a supported game launches.
- Overlay window: transparent, always-on-top, top-right default, draggable, 70% idle opacity, click-through until Alt held; three presence modes (always-on, hotkey popup, second-monitor window) chosen in settings.
- Global hotkeys (Alt+S/1/2/R/E/H), rebindable in settings.
- Settings page (overlay, hotkeys, startup, channel).
Done when: launching Skillshot City opens ShotCaller and shows a placeholder overlay panel over the game; hotkeys work; settings persist.

## Phase 4 — Accounts and cloud (Firebase) ⏸ Deferred
**Deferred by the user (2026-11-07).** The code is built and committed but dormant: no Firebase project is connected, so the app hides all account UI. Pick it back up before Phase 9 (Social), which needs accounts. Setup steps: `docs/FIREBASE.md`.
Goal: sign in and sync.
Deliverables:
- Firebase project, Firestore data model (profiles, usernames, games, achievements cache, unlocks, proofs, friends, xp), security rules.
- Sign-in: Google (loopback callback into Electron) and email/password. (Steam and Discord sign-in dropped when the backend changed to Firebase.)
- Steam Web API proxy: moved to Phase 5, once its host is chosen (Cloudflare Worker or Firebase Blaze).
- Profile sync; privacy settings (synced profile data only; opt-in crash reports).
Done when: user can sign in with each method on two PCs and see the same profile.

## Phase 5 — Steam achievement hub (core) ✅
Goal: the main reason to download it.
Deliverables:
- Local-first Steam data, no API key or proxy (decided at phase start, see DESIGN.md): SteamID from `loginusers.vdf`, achievement schema + unlocks from Steam's local stats cache, playtime from `localconfig.vdf`, global rarity from Steam's keyless endpoint.
- Library: toggle cover grid (completion rings) / banner list (progress bars).
- Game page: achievement list with progress bars, rarity %, completion %, secrets blurred until click, easiest-first sort, links to Steam guides/web; playtime + sessions.
- Real-time unlock detection by watching Steam's local stats cache; corner-card popup (icon, name, rarity) with sound that gets fancier with rarity.
- Unlock timeline.
- Achievements for non-Steam games (added by user request): link a hand-added game to a Steam game's public achievement list, or make your own; tick to unlock.
- Anker Games launcher: auto-import installed games from its library file, with their linked Steam achievement lists.
Done when: unlocking a real Steam achievement shows the popup within seconds and it appears in the timeline and game page; an Anker game shows up automatically with its achievement list.

## Phase 6 — Skillshot City helper and overlay (two parts)
Moved up by the user (2026-11-07). Split into two parts by the user in the Phase 6 setup interview (decisions P6-Q1…Q41 in DESIGN.md). Core idea: auto-detect everything possible from the game's own files (read-only): `data/translations/<lang>.csv` (skill names/text), `data/log.txt` (drafts, picks, rounds, standings), `data/profiles/<name>.guy`, texture sheets (icons).

### Phase 6 Part 1 — Skills, synergies, live match tracking
**The user's flow (2026-11-07), the target for Part 1:**
1. Open ShotCaller → Skillshot City. On first launch, and whenever it changes, ShotCaller auto-detects which skills your account owns and their rarity (new unlock / rarity up → a small notice).
2. Plan your build: the build you equip in the game is read automatically per class; ShotCaller's skill builder lets you set a goal build from the skills you own (class-aware, synergies shown).
3. In a match, at every level-up the 2 offered skills are detected and the engine shows the optimal pick for your build: goal, synergies, class, your rarities and your own win rates.

Deliverables:
- Skill collection: owned skills + rarity per class, auto-detected (log builds + profile: full owned list ✅; draft cards on screen: rarity of every skill you're offered, plus a rarity-up notice ✅ not yet run live; memory reader for all rarities and instant unlock / rarity changes), new-unlock notice.
- Skill builder overhauled (user, 2026-11-09, see DESIGN.md): you pick skills on a synergy map and a coach reacts; unlock hints. Checked in a preview only. The earlier planner stays as an optional starting point: playstyle card + sliders (aggression, range, survival, spice) + surprise me; owned skills only; top 3 builds with pros/cons; each with skills, what to max first, backups and reroll targets, and the in-game slots to equip; scored from synergy results, offer structure (most offers are random, see DESIGN.md research findings), tiers/notes, skill numbers, K/D per build. The chosen build becomes the goal the advisor follows; plans must allow for not being offered a skill. ✅
- Skill + synergy data extracted from the game files (names, descriptions, trees, synergies, real icons), plus tier/role/tags (from public ranked stats, adjusted by your stats). JSON in `games/skillshot-city/`; re-extract after game updates.
- Live log tailer: level-ups, offers, picks, build, BR round 1-3/final, match stats, final standings. Import past matches from old logs on first run.
- Screen reading of the 2 offered skills (icon match, offline; OCR not needed so far); manual icon grid/search + Alt+1/Alt+2 fallback. Built and tested on real screenshots; current rules not yet run live in a match. Rarity is read from the colour of the card's `Lvl x/y` text and saved to the collection (replayed on real strips, not yet run live).
- Advisor cards (tier + synergy + build + class + your history), reroll advice, soft sound cue, last-3-picks strip.
- Goal build suggested from early picks (lock/change), synergy glow + toast, synergy meter (goal % + active synergies), build panel with rarity borders/level pips/synergy links.
- Round panel: thin strip in fights, full on level-up/between rounds/Alt; live stats; Alt+N/Alt+E overrides.
- Recap (overlay card + app match history) with pick review; stats per skill/synergy/build/class with trends; win % + average place + top-3; session goals (suggested + your own); lobby view.
- Lookup page in the app + compact overlay search (filters, synergy map, your stats per skill). Text follows the game's language. ✅ (ShotCaller's own how-to text is English only)
- Learn to play page (added by the user, 2026-11-08: the user is new to the game and wants the app to teach them). ✅
- Overlay fixes: default top right below QUIT; Alt-click without stealing focus, restore the game if it minimizes. ✅ (restore not yet tried in-game)
- Release beta v0.0.4. First beta out as v0.0.4-beta.1 (2026-11-09, user's request, before Part 1 is finished); another at the end of Part 1.
Done when: the flow above works: owned skills + rarities detected without typing, a goal build set in the builder, and a full 3-round match tracked end-to-end automatically with the optimal pick shown at each level-up, the round/synergy panel and a saved recap.

### Phase 6 Part 2 — Weapons, items, counters, library, achievements
Deliverables:
- Weapons (`data/weapons.ini`), items and counters data; counter tips in the recap and live (if the log records who hit you).
- Build library: auto-saved match builds, favorites, import of in-game skill builds, share codes + image cards.
- 50+ ShotCaller achievements for Skillshot City (mastery, feats, helper), driven by recaps.
- Data packs from GitHub separate from app updates + CONTRIBUTING guide.
- Built-in "Ask" engine (user, 2026-11-07): a question box in the overlay and app that answers from ShotCaller's own data, fully offline and free (no AI service): "what should I pick?", "why this skill?", "what synergizes with X?", "how am I doing with Heavy?", "what's my best build?". Answers come from the advisor, synergy list, tiers, collection and match stats, with suggested questions as one-click chips. Works with no account and no Claude.
- ShotCaller MCP server (parked by the user 2026-11-09, partly built and off, see HANDOFF.md) (added by the user, 2026-11-07): Optional extra for people who use Claude; the Ask engine does not depend on it. a localhost-only MCP server in the app, off by default (Settings toggle), so Claude Desktop / Claude Code can assist players. Read tools: live match (round, level, build, offers, advice), skill collection, match history + stats, skill/synergy/tier lookup with the advisor's reasons. Write tools (set offers, lock goal build) behind a second toggle. Reads ShotCaller's own data only, never the game.
Done when: weapons/items/counters show in lookup and recaps, builds can be shared by code, Skillshot achievements unlock from real matches, and Claude can answer "what should I pick?" through the MCP during a real match.

## Phase 7 — Hub home, XP, profile, extra sources
Deliverables:
- Until accounts are live (Phase 4 deferred), XP, level and profile are stored locally on this PC; they sync once accounts go live.
- Home widgets: playing now, closest to unlock, recent unlocks, friends feed (placeholder until Phase 9), stats summary, weekly challenge.
- ShotCaller XP (scales with rarity) + levels; profile page (banner, level ring, 5-achievement showcase).
- Hunt list pinned to overlay.
- Bugged achievements: "mark as earned" with screenshot/clip proof (proof badge, ShotCaller-only) + community known-bugged list with workarounds.
- Manual checklists for games without an API; RetroAchievements integration.
- Any Skillshot data-pack / CONTRIBUTING work left over from Phase 6.
Done when: home screen is fully populated from real data and XP/level updates after an unlock.

## Phase 8 — Screen-reading auto-detect
Deliverables:
- Capture the game window region; template/OCR match the 2 offered skills; confidence threshold with manual fallback.
- Calibration screen for resolution/UI scale.
Done when: auto-detect picks the right two skills in most level-ups across a few matches at the user's resolution.

## Phase 9 — Social
Needs accounts: finish the deferred Phase 4 first (Firebase project, config values, rules deploy, two-PC sign-in test).
Deliverables:
- Friends list, friend activity feed, leaderboards, shared hunt lists, friends comparison, "friends who play it".
- Discord rich presence.
Done when: two accounts can friend each other and see each other's unlocks live.

## Phase 10 — Stream overlay, extra platforms, polish
Deliverables:
- OBS browser-source stream overlay (current build / recent unlock).
- Investigate + add Xbox (e.g. OpenXBL) if workable; document Epic limits.
- Final logo (megaphone mark), custom sound pack, animation polish, accessibility pass.
Done when: polish checklist complete and stream overlay works in OBS.

## Phase 11 — v0.1 release
Deliverables:
- QA pass on Windows + Linux, crash-report opt-in check, README with screenshots, install guide, privacy note.
- Tag v0.1.0 stable; send to friends.
Done when: friends install from GitHub and the update flow works for them.
