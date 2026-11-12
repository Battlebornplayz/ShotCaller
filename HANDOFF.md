PHASE HANDOFF — ShotCaller — Setup overhaul planning → Phase F3 (resume)

Use the `phased-project` skill. You are starting Phase F3 (Fortnite: map history, pins and dot accuracy).
First do the F2 real-play check below (it's F2's "done when" and wasn't possible without a match).
At the end of this phase, write a new handoff in this same format for Phase F4
(and tell that chat to do the same), so every phase hands off to the next.

Project folder: D:\ShotCaller
Read first: PROJECT_PLAN.md ("Phase F", F1-F5, and "Phase S"), DESIGN.md ("Fortnite mode", "Phase F1 findings", "Phase F2 findings"), games/README.md.

## Project in one paragraph
ShotCaller is a polished Electron desktop app: a cross-game achievement hub (Steam, Anker Games, emulator files, hand-added games; unlock popups, library, timeline) plus per-game overlay modules. Modules: Skillshot City (Phase 6 Part 1, paused) and the Fortnite companion ("the best Fortnite companion", TRN-style tracking). Public MIT repo Battlebornplayz/ShotCaller, installed from GitHub Releases with a self-updating launcher (Stable/Beta). For the user and a friend. Stack: Electron + TypeScript + React 19 + electron-vite, electron-builder, electron-updater, uiohook-napi, koffi.

## Done so far
- Phases 1-3, 5 done; Phase 4 (Firebase accounts) built but dormant. Skillshot Phase 6 Part 1 paused (`docs/handoff-skillshot-part1.md`).
- Phase F design interview done. Phase F1 done (v0.0.4-beta.3, beta.4): log match tracking, chest counter by kind (chest / rare / sprite incl. merged "RARE CHEST X2" popups, 18/18 + 8/8 on recordings), "+1 chest" hotkey (Alt+C) for broken chests, live eliminations, time alive, solo placement (players left just before going down), overlay card, Fortnite hub, Fortnite-style look, achievement list hidden on the Fortnite page.
- Phase F2 (just finished, v0.0.4-beta.5), branch `phaseF1/fortnite-foundation` (pushed):
  - `shared/fortniteMap.ts`: minimap → map matcher (span 240 px, high-pass grey, labels masked, pyramid search) + `DotTracker` (sure/unsure, strict whole-map re-find). 92% sure on both recordings at 1 read/s, no wrong jumps during play.
  - `electron/fortnite/seasonMap.ts` (map download per season), `liveMap.ts` (dot, route, landing/death, chest pins, teammates; routes in `userData/fortnite/routes/`), `monitorWindow.ts` (second screen), `online.ts` (stats with encrypted key, shop + wishlist notification).
  - UI: `games/fortnite/FnMap.tsx` (map + grid + pins), `FnPanels.tsx` (session with arrows, chests + goal, recap, inventory placeholder), `FnHubTabs.tsx` (Lobby, Stats, Shop, map options), `src/fnmonitor/FnMonitorApp.tsx` (second-monitor window).
  - Checked in the dev app: map downloads, map window opens on the second screen with Fortnite, Lobby/Stats/Shop tabs render, shop pictures load.
  - Test tools: node 24 runs the .ts files directly; scripts that pipe ffmpeg frames into the readers were in the session scratchpad (rewrite as needed). Recordings: `Videos\Captures\Fortnite   2026-11-10 12-56-32.mp4` and `... 14-08-09.mp4` (second one: chests, rare/sprite cluster at 8:38-8:50, death + "YOU PLACED #7" at 12:16).

- Squad link pulled forward early (user, 2026-11-10, short on usage), shipped v0.0.4-beta.6/7:
  - `electron/fortnite/squad.ts`: join code (XXX-XXX), public MQTT relay `mqtts://broker.emqx.io:8883`, topic `shotcaller/squad/v1/<code>`, no accounts/secrets. Sends own dot ~2/s (Epic name or "Friend"); friends' dots + paths go into `FnMapState.squad` (drawn in `FnMap.tsx` with names). Relay round trip tested (~1 s); NOT yet tried between two PCs.
  - Inventory = a picture, not a reading: hotbar crop (x 1310-1890, y 830-1020 at 1080p: pickaxe, slots 1-5, Q item) every 2 s as JPEG, shown in `InventoryPanel` (map window + Lobby) for you and friends.
  - Smoother: dots/camera glide (CSS transform + rAF viewBox), minimap read every 500 ms.
  - Squad UI: `SquadPanel` in `FnHubTabs.tsx` Lobby (Start / Join / Leave / copy code).
- After that, up to v0.0.4-beta.16 (2026-11-10/11): map icons + planned routes with a GPS line, map marker (dot / arrow / own picture) shared over squad link, map zoom/drag; Fortnite resolution setting (`electron/fortnite/gameArea.ts`: game space, stretched, black bars; 16:10 and 3:2 laptops fixed); chests/kills fixed on non-1080p screens and friends' counts shared; overlay card shows everything but the map, `fortnite.display` = ask/overlay/monitor/both; Settings update card downloads and installs updates.
- **Setup overhaul planned (2026-11-11, planning only, nothing built):** design interview in DESIGN.md "Setup overhaul" (S-Q1..S-Q16, S-E1..S-E4, S-E3a-e); three build parts in PROJECT_PLAN.md "Phase S": S1 HUD auto-locate engine (finds minimap, elims, chest popup, hotbar + each slot at any screen size / HUD Scale / HUD Layout Tool), S2 step-by-step setup + laptop/monitor layouts + Simple/Advanced settings, S3 rebuilt hotbar tiles (TRN-style loadout, look to settle from a user screenshot) + phone map by QR from the squad host through the relay.

## Phase F3 goal
Map history, pins and dot accuracy.
Deliverables:
- Accuracy for the live dot: checked and corrected from the full map (M) screen; vehicles, open water and the bus/skydive zoom (multi-scale search); must keep working in the storm.
- Distance travelled; drop stats (average placement per place); death heat map. (Route, landing/death pins and chest pins already exist from F2.)
- Teammates' paths, pings and markers, and enemies only when the game reveals them.
Done when:
- Across a few real matches, the dot stays on the right spot most of the time (measured against full-map reads) and landing/death pins are right.

## Decisions & constraints to respect
- **Never read Fortnite's memory, inject, hook or touch its process/files** (EAC + BattlEye). Only screen capture, the log (match start/end/mode only) and fortnite-api.com.
- fortnite-api.com key is a secret: `userData/fortnite/key.bin` (safeStorage), never in the repo, settings, DESIGN.md, logs or the renderer. Don't repeat it in chat.
- Chests: one count, kinds kept (chest / rare / sprite / manual). XP text glows purple or gold: match shapes, never colour.
- TRN is the model for ideas only. Look: navy + #4F8CFF, Fortnite theme scoped to `.fn-theme` / `.fn-card` (Impact italic caps, rarity tiles, yellow selected tab), no Fortnite logos or art.
- Every feature has its own switch; overlay parts see-through; Alt+S hides all overlays.
- User's setup: 1920x1080, default HUD, Windowed Fullscreen, mouse and keyboard, 3 screens (main HP X24ih in the middle, VG248 on the left, Artist 12 below).
- **Publish each finished dev step as a beta** (user): commit, push, annotated tag `v0.0.4-beta.N` (next: beta.17) with plain patch notes; write messages to a file and use `-F`.
- Squad link is Phase F5; friends list Phase 9.
- **Order (user, 2026-11-11):** finish the Phase F plan first (F3, then F4, F5), then Phase S (S1, S2, S3). S1's engine will replace the fixed HUD boxes in `gameArea.ts` and the readers, so don't sink time into new fixed-box tuning in F3-F5; keep readers going through one place S1 can swap out.
- The user is new to things: plain explanations; question widgets with click-to-pick buttons. They test by recording matches (Win+Alt+R) and giving timestamps; frames via ffmpeg (`%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_*\ffmpeg-*\bin\`). Quit the installed ShotCaller before dev runs; `npm.cmd run dev`. The user approved closing it for checks in this chat.
- Some files have CRLF line endings. `reports/` and `research_notes/` stay untracked.

## Loose ends / known issues
- **Squad link real test:** user + friend on beta.7, linked by code during a real match: dots, names, paths, hotbar pictures. Fix whatever breaks first. F4's real hotbar *reading* (items, ammo numbers) and F5's remaining parts (squad chests/kills totals) still to do; update PROJECT_PLAN F4/F5 to say the picture version shipped.
- Next beta tag: beta.17.
- **F2 real-play check (do first):** play/record a match with ShotCaller running and check the dot + route + chest pins on the second screen against the minimap; paste the Epic name and the fortnite-api.com key in Fortnite → Stats (the user pastes it themselves) and compare the numbers with what the user knows; check the session panel updates after a match.
- Teammates' arrows (team modes): written but never seen on a real squad match; colours/sizes are guesses. Pink/purple squad colour is skipped because of the storm.
- Map grid A-J / 1-10 drawn over the whole 2048 picture; not compared with the in-game grid.
- Dot: not tested on open water far from land, in vehicles, on the bus/skydive (different zoom: reads "not sure" until you land). Gemini's ideas (gradient-orientation matching, peak-to-sidelobe confidence, multi-scale, WASM) in DESIGN.md if accuracy needs them.
- Placement in Duo/Trio/Squad is empty (needs a "#N" reader from the end screen). Chests opened within ~1 s may still merge in rare cases; break-open chests need the +1 key.
- Older matches (before beta.4) have no chest kinds; the user's second match was saved as 17 chests (really 13 + 4 rare + 1 sprite = 18).
- `phaseF1/fortnite-foundation` isn't merged to main (main is at v0.0.4-beta.2); ask before merging. The Skillshot builder commit (b0fcc11) rides on this branch.

## How to start
1. Read the files above.
2. Confirm the phase goal with the user in 1-2 lines.
3. Begin.
