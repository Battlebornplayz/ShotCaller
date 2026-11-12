PHASE HANDOFF — ShotCaller — Phase F3 (in progress) → Phase F3 (finish)

Use the `phased-project` skill. You are finishing Phase F3 (Fortnite: map history, pins and dot accuracy).
At the end of this phase, write a new handoff in this same format for Phase F4
(and tell that chat to do the same), so every phase hands off to the next.

Project folder: D:\ShotCaller
Read first: PROJECT_PLAN.md ("Phase F3", "Phase S"), DESIGN.md ("Phase F3 findings", "Phase F2 findings"), games/README.md.

## Project in one paragraph
ShotCaller is a polished Electron desktop app: a cross-game achievement hub plus per-game overlay modules. Modules: Skillshot City (paused) and the Fortnite companion ("the best Fortnite companion", TRN-style tracking). Public MIT repo Battlebornplayz/ShotCaller, installed from GitHub Releases with a self-updating launcher (Stable/Beta). For the user and a friend. Stack: Electron + TypeScript + React 19 + electron-vite, electron-builder, electron-updater, uiohook-napi, koffi.

## Done so far
- Phases 1-3, 5 done; Phase 4 dormant; Skillshot paused. Phase F1, F2 done; squad link pulled forward (beta.6-16). Setup overhaul planned as Phase S (after Phase F).
- Phase F3 so far (2026-11-11), committed on `phaseF1/fortnite-foundation`, NOT run in the app yet, NOT released:
  - **One whole-window copy per look** (`electron/fortnite/gameArea.ts` beginFrame/currentFrame/endFrame; buffer reused): measured 14 ms vs 28 ms for separate copies. Minimap matching unchanged.
  - **Fortnite's full map (M)** `shared/fortniteFullMap.ts`: `isFullMap` (navy top bar + yellow MAP tab line, any size), `FullMapLocator` (where the map is drawn: quick check 37 ms, near search ~0.2 s, whole search ~3 s spread over the event loop; found at default, 1.5x/2x/3x zoom and on 16:10), `readFullMapMarks` (your arrow by its chevron shape at any turn + heading; teammates' arrows and markers by real squad colour; mouse pointer and screen-edge storm ignored), `readStorm` (next circle + current edge), `readSquadColors` (HUD diamonds, yours last). Works in "1920-wide" units: 16:9 = 1920x1080, 16:10 = 1920x1200 (layout by width; bottom items from the bottom).
  - `electron/fortnite/fullMap.ts` runs it while M is open (HUD readers skip that look); `liveMap.ts` takes it in: dot fixed from the arrow (far jumps need two looks), accuracy per match (`checks`, close ≤ 12 px), distance (map px, 1 px = 1.46 m), storm (also shared/received over squad link), markers, squad colours, friends matched to their real colour.
  - **Map layer over Fortnite's map**: `electron/fortnite/mapLayerWindow.ts` + `src/fnmaplayer/FnMapLayerApp.tsx` (see-through, click-through, DIP bounds, hides with Alt+S). Settings `fortnite.mapLayer` (on + 13 layer switches) in Fortnite → map options. `FnMap.tsx` split: `FnMapLayers` shared by every map (storm, markers, death heat map, friend colours).
  - Places from `/v1/map` → map px (`seasonMap.ts` getPlaces, fit 12/12 within 1 px); drops get `place`; `DropStatsPanel` (lobby) and `MapStatsPanel` (distance, dot checks; lobby + map window); death heat map button on the lobby map.
  - Recording checks (scratch scripts, rewrite as needed: replay a video through the readers with ffmpeg at 2-4 fps): your recording 1 at 4:15-4:21: arrow found 23/23 M looks, minimap dot was 9 px (~13 m) off before the fix; teammate (purple) + yellow marker right; storm read. Friend's 16:10 M frame: map found (0.87), marker right, "you" on the bus.

## Phase F3 goal (rest)
Deliverables left:
- Read the M screen's left panel for everyone (not only squad link): each squad member's eliminations (row = colour; name kept as a cut-out picture, no text reader), players/squads left, storm round + timer. Digits: build templates from the frames (your rec 1 at 4:15-4:21 = storm timer 1:29→1:24; friend's at 0:20-0:50 = 0:35→0:15, "80 (20)").
- Squad-link friends' chests: already sent as marks and drawn (FriendMarks); check they show on the map window AND the M layer.
- Finish the replays: friend's video `Downloads\Fortnite   2026-11-10 19-32-36.mp4` (2304x1440 16:10; bus with M opened often, long driving = vehicle test, night), your `Captures\...14-08-09.mp4` and `...12-56-32.mp4`. Report sure %, M checks and errors.
- Skydive/bus zoom for the minimap dot (multi-scale) if the replays show it's needed.
- Run the dev app (quit the installed ShotCaller first; ask the user), check: lobby panels, map options switches, map window, the layer over a recorded/real M screen, no errors. Then beta.17.
Done when:
- Across a few real matches the dot stays right most of the time (checked against M reads) and landing/death pins are right.

## Decisions & constraints to respect
- **Never read Fortnite's memory, inject, hook or touch its process/files.** Screen, log (match start/end/mode), fortnite-api.com only.
- The fortnite-api.com key is a secret (userData/fortnite/key.bin), never in repo/settings/logs/chat.
- No separate 16:10 mode: readers work out the shape themselves (user asked; answered).
- Mouse pointer on the M map is a white pin with a dark hole: never "you".
- Every feature has its own switch; overlays see-through; Alt+S hides all.
- Publish each finished dev step as a beta (annotated tag `v0.0.4-beta.N`, next **beta.17**, patch notes written to a file, `-F`) — only after it runs in the app.
- Order: finish Phase F (F3, F4, F5), then Phase S. Don't tune fixed HUD boxes; readers go through gameArea (one place for S1).
- User is new: plain words, click-to-pick question widgets. Tests by recording (Win+Alt+R) with timestamps. `npm.cmd run dev`; quit the installed app first (ask). CRLF in some files; edit via small Python scripts in a file (bash heredocs with quotes broke twice). `reports/`, `research_notes/` stay untracked.

## Loose ends / known issues
- **Replay results (2 looks/s, whole videos):** friend's 16:10 (driving, night): minimap dot sure 94%; M checks after landing off by 2-3 px. Your rec 1: 85% sure, 15 M checks off by 0-7 px. Your rec 2: 82% sure, no M opened. **Bug to fix first:** on the bus the minimap is zoomed out, yet the tracker marked wrong spots "sure" (~130 px / 190 m off between M looks, friend's video 0:33-0:43). Don't trust the minimap dot on the bus/skydive (log phase / busAt), or add the multi-scale search. On the bus, M shows your arrow on the bus (read right, moves ~40 px/s).
- Nothing from F3 has been run in the real app yet (type check + lint pass). Main risks: the layer window's position on scaled (125%/150%) laptop screens, the whole-map search pausing the app for ~0.1 s per zoom step, imports between overlay.ts ↔ fortnite modules.
- Squad link still never tested between two PCs. Placement in team modes still empty (the M panel / end screen "#N" reader could give it).
- The world→map fit (1.46 m/px) is measured on this island; a new season may need it redone (places off the island show it).
- `phaseF1/fortnite-foundation` isn't merged to main; ask before merging.

## How to start
1. Read the files above.
2. Confirm the phase goal with the user in 1-2 lines.
3. Begin.
