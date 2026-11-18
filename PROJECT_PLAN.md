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

## Phase L — Games tab: a launcher for all your stores (two parts)
Added by the user (2026-11-12), design interview in DESIGN.md "Games tab (launcher)". **Order (user): now, before Phase F4.** The Library page grows into a Games tab (after Home) that finds games from the stores on this PC by itself, plays them through their store, and keeps the achievement rings. Read-only on store files: no store passwords, no changes to other launchers' files. Each part ends in a beta the user OKs first.

### Phase L1 — Main stores, grid and Play
Deliverables:
- Steam, Epic Games and Xbox / Microsoft Store found from their files on this PC; installed games plus owned-not-installed (faded) where the PC files allow; rescans on start, on store file changes and with Refresh; store list in settings with Found / Not found and Pick folder.
- GOG Galaxy-style layout: left list (All games, Installed, each store with a count, collections, Tools, Hidden) that folds to icons; cover grid on the right with a size slider; first open shows a scan summary ("Found 84 games in 3 stores").
- Owned-not-installed: Steam from the public profile when it is public; Epic and Xbox installed only (sign-in later). Installed Game Pass games tagged.
- One card per game across stores (store picker on the Play arrow); Tools section for non-games; Hide with a Hidden list.
- Cover grid with store icon, achievement ring, playtime and install size; art from the store, then SteamGridDB (optional key), then a title card; hover lifts the card and shows Play. Game page: wide art fading into the app colour, Play, achievements, playtime, store, folder, "..." menu (Uninstall via the store, launch options, desktop shortcut). Epic/Xbox games borrow the Steam version's achievement list when there is one.
- Play through the store, minimise to tray, overlay on for module games; Install hands off to the store; Update badge where readable.
- Sort (recently played default), filters (store, installed, achievements, overlay, genre), favourites and collections, top rows (Continue playing, Favourites, Recently added), genres from Steam store info (editable), search bar and Ctrl+K (games, pages, settings), tray menu with the last 5 games, "Added [game]" toast, Continue playing strip on Home.
- Playtime from the store, else ShotCaller's own tracking from game detection. Achievement corner card and unlock popups for every game started from the tab.
Done when: on the user's PC every installed Steam, Epic and Xbox game shows with art, starts from Play through its store, and the existing Library data (pins, hand-added games, achievement links) carries over.
**Status (2026-11-12): done, beta.20.** User checked it in the dev app. Not possible from local files: Steam owned-not-installed (Steam now needs sign-in), Game Pass tag, Xbox install size (see DESIGN.md "Found while building L1").

### Phase L2 — More tab: Anker, other stores, emulators, extras ✅ (beta.21, "e21")
Deliverables:
- More section of the left list where extra sources are set up: Anker Games (list, play the exe directly, achievements, Open in Anker), GOG, EA, Ubisoft, Battle.net, Riot, Rockstar, Amazon, itch.io, emulators (RPCS3, Ryujinx, mGBA: pick your game folders once, each file becomes a card that opens in the right emulator), games added by hand (browse or drag-drop an exe or shortcut). Everything also shows in the main grid.
- Epic free games of the week: card on Home and a row in More.
Done when: Anker games and at least the other stores installed on the user's PC show and start, and the beta installs and updates.
Later: controller navigation; optional store sign-in for full owned lists.
Built (2026-11-12): readers in `electron/stores/` (gog, ea, ubisoft, battlenet, riot, rockstar, amazon, itch; one registry read in registry.ts; SQLite via node:sqlite), emulators in `stores/roms.ts`, Epic free games in `stores/epicFree.ts`, More panel in `src/shell/games/MorePanel.tsx`. Tried on the user's PC: GOG (Inscryption via Galaxy), Ubisoft and Rockstar found (no games of their own), Anker, mGBA, Ryujinx ROM scan. EA, Battle.net, Riot, Amazon, itch.io and RPCS3 not installed there, so untested.

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
- **Live dots (moved here from F3 by the user, 2026-11-10):** your dot from matching the minimap against the season map (north-up, fixed zoom on foot; search near the last spot, whole map at landing; say "not sure" over open water or when the minimap is covered), and your teammates' dots copied from where they show on your minimap, in squad colours.
- **Location log + chest pins (user, 2026-11-10):** log your dot about once a second during a match (saved with the match); each counted chest drops a pin where your dot is, coloured by kind (chest / rare / sprite). No pin when the dot is "not sure". Your route this match is drawn live from the log and kept with the match (user). F3 adds distance, drop stats and the heat map from this log.
- **Chest kinds + manual +1 (user, 2026-11-10):** normal, rare and sprite chests counted on their own (merged popups "RARE CHEST X2" / extra lines read); a changeable hotkey adds +1 for chests you break (breaking one shows no XP popup).
- Live session panel (matches, wins, kills, K/D, chests since launch, arrows against your usual); goals ("50 chests today") with progress on the overlay card.
- Lobby view: last recap, session panel, goals, map with drop stats; recap on the second monitor after each match.
- Item shop + wishlist alert.
Done when: the second monitor shows the map with your dot and your teammates' dots in the right places during real play, the session panel is live, and the stats page matches the user's numbers.

### Phase F3 — Map history, pins and dot accuracy ✅ (beta.17)
Deliverables:
- Accuracy for the live dot (built in F2): checked and corrected from the full map (M) screen; vehicles, open water and the bus/skydive zoom. Must keep working in the storm (DESIGN.md).
- Path this match, distance travelled, landing spot and death pins across matches; drop stats (average placement per place); death heat map.
- Teammates' paths, pings and markers, and enemies only when the game reveals them.
- **Added by the user (2026-11-11):** ShotCaller's map drawn over Fortnite's own full map (M), lined up with it at any zoom/pan, with the same info as the squad-link map and a switch per layer. While M is open, read what Fortnite shows (your arrow, teammates, markers, the storm) and use it to put ShotCaller's info right. Teammates in their real squad colours, read from the HUD. Works on your friend's 16:10 laptop too.
- **Reading change (user, 2026-11-11):** one copy of the whole game window per look, every reader cuts its part from it (measured ~2x faster than separate copies); must not make the minimap dot slower or worse.
Done when: across a few real matches, the dot stays on the right spot most of the time (accuracy measured against the full-map reads) and landing/death pins are right.

### Phase F4 — Inventory, ranked, bests, achievements, beta (built 2026-11-12; real-match check and beta.22 pending)
Deliverables:
- (Already shipped early, beta.7: the hotbar is shared as a cropped picture over squad link. F4 adds the real reading.)
- Hotbar reading: 5 slots with item + rarity, ammo in each gun, reserve ammo, materials, health and shield, medallions and mythics; live inventory panel on the second monitor.
- Loadout history: final loadout per match and "best loadouts" by placement.
- Ranked rank + progress bar read after Ranked matches, chart over time.
- 0-100 match score with the formula shown; personal bests and streaks (kills, chests, top-10 streak, win streak).
- Fortnite achievements in the hub with the unlock popup.
- Release a beta.
Done when: inventory and ranked read right in real matches, and the beta installs and updates.

### Phase F5 — Squad link (join code)
Added by the user (2026-11-10). **Mostly shipped early (beta.6-16):** join code over a public MQTT relay, dots, paths, icons, hotbar pictures, friends' chest/kill counts, storm sharing (beta.17). Left: a real two-PC test and squad totals. Deliverables:
- "Start squad" gives a short join code; a friend types it to link. Lasts until someone leaves. No accounts.
- A small online relay between the two apps (service picked at the start of the phase; nothing secret in the repo).
- Shared live from each friend's own screen reading: inventory (F4), chests + eliminations this match (F1) with squad totals, map dot + path (F3). Shown on the second monitor and in a squad panel. Each part has its own switch, and sharing is off until you join.
Done when: two PCs link with a code and each sees the other's inventory, chests, kills and dot during a real match.
Later (Phase 9): the same sharing through the friends list once accounts are on.

## Phase S — Setup overhaul: laptops, monitors, auto-detect (three parts)
Planned 2026-11-11 (DESIGN.md "Setup overhaul"). **Order (user):** after Phase F (F3, F4, F5) is finished. Goal: a friendly first run and good defaults on any screen, laptop or PC monitor, with HUD positions found automatically. Each part ends in a beta.

### Phase S1 — HUD auto-locate engine
Deliverables:
- An engine that finds Fortnite's HUD parts on any screen: minimap, eliminations, chest popup area, hotbar, and each of the 5 inventory slots. Works at any screen size and aspect, with black bars or stretched, at any Fortnite HUD Scale and with parts moved by the HUD Layout Tool.
- Runs at the start of each match and again when a reader stops seeing its thing. Results saved per screen size; the readers (chests, eliminations, minimap, hotbar) use the found spots instead of fixed boxes.
- Fortnite resolution worked out from the screen; the old picker moves to Advanced as an override.
- Hand-moved boxes (from S2) win over the engine until Reset boxes.
- Test set: the two recordings plus frames resized/padded to laptop and monitor shapes (1366x768, 1536x864, 1920x1200, 2560x1440, 3840x2160, stretched 4:3) and lower HUD scale.
Done when: every HUD part is found on every test shape, chest and elimination counts on the recordings are unchanged, and the hotbar picture is cropped to the slots.

### Phase S2 — Setup flow, layouts and simpler settings
Deliverables:
- Short app-wide welcome once; Fortnite setup the first time the Fortnite page opens, as step-by-step pages with Back / Next / Skip: screens found (applied, with Change), where the info shows (overlay / second monitor / both; second-screen choice stays a dropdown), where it reads, what the card shows, Epic name, hotkeys.
- "Where it reads" step: HUD sketch until your own screenshot exists ("Use my screen"), movable boxes (move only) for minimap, eliminations, chest popup, hotbar; each turns green live when it sees its thing; Reset boxes.
- Existing users get the setup once after updating, with their current choices pre-filled.
- Layouts: laptop card starts at left middle, PC monitor keeps the right side under the minimap; card size automatic from screen size and never over the hotbar; mid-match the card shrinks to one line while alive.
- Fortnite settings split Simple / Advanced; manual Low power switch; plain fix-it tips on the card that open the where-it-reads step.
Done when: a fresh install and an existing install both walk through setup in a laptop-size and a monitor-size check, and the card lands in the right spot at the right size on each.

### Phase S3 — Rebuilt hotbar and phone map
Deliverables:
- Rebuilt hotbar: slots 1-5 as tiles with matched rarity borders, held slot raised, empty slots faint; layout modelled on TRN's teammate-loadout overlay (settle from the user's screenshot first). Shown on the card (friends), map window, phone map and lobby squad panel.
- Phone map: the squad link host's map screen shows a QR code; it opens a web page (free hosting such as GitHub Pages) that reads the party's dots through the squad link relay, so it works on any Wi-Fi or mobile data. Big map with everyone's dots, pinch to zoom. Playing alone, your own PC is the host.
Done when: a phone on mobile data shows the live squad map from a QR scan, and two PCs see each other's rebuilt hotbar rows.

## Phase D — Dead by Daylight companion (six parts)
Design interview done 2026-11-17 (DESIGN.md "Dead by Daylight mode", D-Q1 to D-Q51). For a veteran (~600 h, survivor and killer) back after months away: no beginner content, tips are quick reminders. **Order (user, D-Q46): build now; Fortnite F4 is paused** (its real-match check and beta.22 come after, or when the user asks). Rules: screen reading, DbD's log file (match start/end only), Steam's own files, public data and the user's own signed-in official stats pages. Never DbD's memory or process (EasyAntiCheat), never info the game hides. Every feature has its own switch; overlay parts are see-through; ShotCaller look with red only for danger/timers. Each part ends in a beta (name options first, ask before publishing).

### Phase D1 — Foundation, catch-up and build manager
Deliverables:
- `games/dbd/` module (Steam app 381210, exe names, rail icon) and the DbD hub: Home (recap, session, what's new) + tabs Builds, Killers, Maps, Stats, Catch-up, with a survivor/killer switch on each.
- Data source for killers, survivors, perks, add-ons, items, offerings and maps with icons, plus patch changes and current popular builds (sources picked at the start of the phase; cached, refreshed after DbD updates).
- Short DbD setup: screen found, the game's UI scale and HUD scale, second monitor.
- ~~Match start/end from DbD's log file.~~ Moved to D3: the log is encrypted, so match start/end comes from screen reading.
- Catch-up from Steam's last-played date (with Change): new killers/survivors/perks/maps, big reworks/buffs/nerfs, what's strong now. Grouped page + "new" tags in builds and killer cards. "What changed this patch" once after each update.
- Build manager: perk grid with search and tag filters, one-line summaries that expand to the full text, saved builds per side (perks, add-ons/item, offering), popular builds to copy, share codes for a friend.
Done when: the catch-up is right for the real gap since the user last played, and builds save, load and share by code.
**Status: done 2026-11-17, released as v0.0.4-beta.23 "e23".** Sources: deadbydaylight.wiki.gg (main), Steam news (patch notes), dbd.tricky.lol (backup); popular builds are a curated games/dbd/builds.json also read from GitHub. See DESIGN.md "Phase D1 findings".

### Phase D2 — Ask AI: MCP server and in-app chat
Added by the user 2026-11-17 (DESIGN.md "Ask AI"). Both off by default, each with its own switch.
Deliverables:
- Grow the parked Skillshot MCP server (`electron/skillshot/mcpServer.ts`) into one shared, localhost-only ShotCaller MCP server with tools per game. Works with Claude Desktop, Claude Code and Gemini CLI; Settings shows copy-paste setup for each.
- DbD tools in this phase: perk/killer/survivor/map lookup, catch-up ("what changed since I left"), list builds; save/edit builds behind a second "let AI change things" switch. Later DbD phases add their tools (D3 live match, D4 killers/maps, D5 stats).
- In-app chat panel in the DbD hub (and a small one on the second monitor) with **no API keys and no extra cost**: ShotCaller runs the Claude Code CLI or Gemini CLI already installed and signed in on the PC (user picks; uses their existing Claude plan or Gemini's free Google sign-in), connected to ShotCaller's MCP tools. If neither is installed, the panel explains how to install and sign in. How each CLI is driven (headless mode, tool permissions) is checked at the start of the phase.
Done when: Claude Desktop (or Claude Code) and Gemini CLI both answer "make me a build against <killer>" through the MCP server and the build appears in the build manager; the in-app chat does the same through Claude Code and through Gemini CLI, with no API key.

### Phase D3 — Screen reading: hooks, timers, loadouts
Deliverables:
- Match start/end from the screen (moved from D1; DbD's log is encrypted).
- Readers (using the setup's UI/HUD scale): side, survivor portraits (healthy / injured / dying / hooked, hook stage, dead / escaped), gens left, your own 4 perks, exhaustion, end-game collapse; the lobby loadout; teammates' perks from the Esc menu.
- Hook badges beside the game's portraits: pips, red on death hook, "unhooked Ns ago"; as killer, survivors not hooked yet are dimmed.
- Perk timers as rings over your perk icons: yours, plus "possible perk" windows for the other side (replaced by teammates' real perks once read). Auto-start with a hotkey backup; soft tick before one ends. Exhaustion countdown; collapse timer, hatch reminder, "NOED possible".
- Lobby: names the saved build your equipped perks match.
- Test set from the user's own recorded survivor and killer matches.
Done when: hook stages, timers and loadouts match real matches on both sides.

### Phase D4 — Killer counters, maps, second monitor
Deliverables:
- Survivor side: killer found from killer-only status effects you get, with a hotkey killer grid when it can't tell. Counter card (power, how to beat it, common add-ons/perks, your escape rate vs that killer): ~8 s on the game, full on the second monitor.
- Killer side: card for your own killer (power tips, add-on pairs).
- Map name from the loading screen; map picture with main building and strong loops marked, on the game while loading and on the second monitor all match.
- Second monitor in a match: map left; killer card, session (and later squad) stacked right.
Done when: killer and map are named right in real matches and the cards show in time to use.

### Phase D5 — Stats, official tracker and achievements
Deliverables:
- End screen read after each public match (custom games skipped): side, characters, result, hooks, bloodpoints. Recap card on the second monitor (vs your usual) and the live session panel.
- Stats tab: escape/kill rate over time, per-killer table (faced and played), how each saved build performs.
- Official tracker tab (stats.deadbydaylight.com): the user signs in themselves, stays signed in; ShotCaller reads the user's own match history back to 2020 into the stats. Falls back to the plain tab if reading breaks.
- Steam DbD stats with the user's own Steam Web API key (secret, encrypted in userData) and a Nightlight.gg button.
- DbD Steam achievements in the hub with the unlock popup, plus ShotCaller goals (e.g. escape against every killer).
Done when: real matches land in the history with the right results and the official history import fills the stats.

### Phase D6 — Squad link (waits for a second tester)
Deliverables:
- Join code over the same relay as Fortnite's squad link; sharing off until you join, each part with its own switch.
- Shared: the killer once anyone finds it, live timers (DS, BT, exhaustion, OTR) on each friend's badge, everyone's lobby perks/item/offering, one combined recap. Short on the badges, full squad panel on the second monitor. No callout hotkeys.
- Squad stats: escape rate together vs solo.
Done when: two PCs link with a code and see each other's timers and loadouts in a real match.

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
