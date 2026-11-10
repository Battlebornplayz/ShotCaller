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

**Paused (user, 2026-11-10):** Fortnite (Phase F) goes next. Part 1 resumes after Phase F from `docs/handoff-skillshot-part1.md`.

## Phase F — Fortnite companion (five parts)
Added by the user (2026-11-10), design interview Q1-Q47 in DESIGN.md "Fortnite mode". Goal: the best Fortnite companion, TRN-style tracking, with ideas taken from TRN but never their data. **Screen reading, the Fortnite log (match start/end only) and fortnite-api.com only. Never memory, never the game's files or process beyond the log** (Easy Anti-Cheat + BattlEye). Every feature has its own on/off switch; overlay parts are see-through. Tuned for 1920x1080, default HUD, mouse and keyboard. Module in `games/fortnite/`, hub with tabs like Skillshot's.

### Phase F1 — Foundation, match tracking, chest counter
Deliverables:
- Detect Fortnite (game list + running process), Windowed Fullscreen note for overlays.
- Fortnite log tailer, for match start/end and mode only (find which lines exist in a real log first).
- Screenshot recorder for building readers (opt-in switch, local only, capped), plus a Screen check tab like Skillshot's.
- Chest counter: read the "+XP / CHEST" popup; every label that says CHEST (rare, treasure, sprite…) counts as one chest; totals per match, session, today and all time.
- Placement and eliminations read from the HUD and the end screen; time alive.
- Overlay card: drag anywhere (saved), 60% opacity by default, size slider, always visible, a hotkey that hides every overlay, a switch per part. Navy style with Fortnite rarity colours.
- Minimap feasibility test (for F3, done early because it's the riskiest part): 20-30 saved minimap shots from varied places, including water, inside the storm and the storm edge. Run a shape-based matcher and a storm-tinted map copy against the season map, then measure the hit rate. Check whether the minimap is north-up and whether it zooms. Report the result before F3.
- Match store + Fortnite hub: match history (trend charts on top, list below), filters by mode (Builds / Zero Build / Ranked / Reload, apart and combined) and team size; recap saved in the hub.
Done when: a real match is tracked by itself, with chests, placement and eliminations right, shown on the card and saved in history.

### Phase F2 — Online stats, second monitor, season map
Deliverables:
- fortnite-api.com key in Settings (local only, never in the repo); stats page: wins, K/D, win rate per mode, season vs lifetime, battle pass level.
- Second-monitor window: fills the chosen monitor (remembered), opens and closes with Fortnite. Map on the left, panels stacked on the right (session, inventory placeholder, chests).
- Season map with place names and the A-J / 1-10 grid; new season map downloaded by itself, old pins archived.
- Live session panel (matches, wins, kills, K/D, chests since launch, arrows against your usual); goals ("50 chests today") with progress on the overlay card.
- Lobby view: last recap, session panel, goals, map with drop stats; recap on the second monitor after each match.
- Item shop + wishlist alert.
Done when: the second monitor shows the map and session during real play, and the stats page matches the user's numbers.

### Phase F3 — Live map from the minimap
Deliverables:
- Position from matching the minimap picture against the season map; checked and corrected from the full map (M) screen. Must work in the storm: shape-based matching plus a storm-tinted copy of the map (DESIGN.md).
- Path this match, distance travelled, landing spot and death pins across matches; drop stats (average placement per place); death heat map.
- Teammates in squad colours with their paths, pings and markers, and enemies only when the game reveals them.
Done when: across a few real matches, the dot stays on the right spot most of the time (accuracy measured against the full-map reads) and landing/death pins are right.

### Phase F4 — Inventory, ranked, bests, achievements, beta
Deliverables:
- Hotbar reading: 5 slots with item + rarity, ammo in each gun, reserve ammo, materials, health and shield, medallions and mythics; live inventory panel on the second monitor.
- Loadout history: final loadout per match and "best loadouts" by placement.
- Ranked rank + progress bar read after Ranked matches, chart over time.
- 0-100 match score with the formula shown; personal bests and streaks (kills, chests, top-10 streak, win streak).
- Fortnite achievements in the hub with the unlock popup.
- Release a beta.
Done when: inventory and ranked read right in real matches, and the beta installs and updates.

### Phase F5 — Squad link (join code)
Added by the user (2026-11-10). Deliverables:
- "Start squad" gives a short join code; a friend types it to link. Lasts until someone leaves. No accounts.
- A small online relay between the two apps (service picked at the start of the phase; nothing secret in the repo).
- Shared live from each friend's own screen reading: inventory (F4), chests + eliminations this match (F1) with squad totals, map dot + path (F3). Shown on the second monitor and in a squad panel. Each part has its own switch, and sharing is off until you join.
Done when: two PCs link with a code and each sees the other's inventory, chests, kills and dot during a real match.
Later (Phase 9): the same sharing through the friends list once accounts are on.

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
