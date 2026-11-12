PHASE HANDOFF — ShotCaller — Phase F3 → Phase F4

Use the `phased-project` skill. You are starting Phase F4.
At the end of this phase, write a new handoff in this same format for Phase F5
(and tell that chat to do the same), so every phase hands off to the next.

Project folder: D:\ShotCaller
Read first: PROJECT_PLAN.md ("Phase F4", "Phase F5", "Phase S"), DESIGN.md ("Fortnite mode", "Phase F1/F2/F3 findings", S-E3e), games/README.md.

## Project in one paragraph
ShotCaller is a polished Electron desktop app: a cross-game achievement hub plus per-game overlay modules. Modules: Skillshot City (paused) and the Fortnite companion ("the best Fortnite companion", TRN-style tracking). Public MIT repo Battlebornplayz/ShotCaller, installed from GitHub Releases with a self-updating launcher (Stable/Beta). For the user and a friend. Stack: Electron + TypeScript + React 19 + electron-vite, electron-builder, electron-updater, uiohook-napi, koffi.

## Done so far
- Phases 1-3, 5 done; Phase 4 dormant; Skillshot paused. Phase F1, F2 done; squad link pulled forward (beta.6-16). Setup overhaul planned as Phase S (after Phase F).
- Phase F3 (just finished, v0.0.4-beta.17, branch `phaseF1/fortnite-foundation`): one whole-window copy per look (`gameArea.ts`); Fortnite's full map (M) found at any zoom/pan and 16:10 (`shared/fortniteFullMap.ts`, `electron/fortnite/fullMap.ts`): your arrow fixes the dot, teammates/markers/storm in real squad colours; ShotCaller's map drawn over M (`mapLayerWindow.ts`, `src/fnmaplayer/`, 13 layer switches); places, drop stats, distance, death heat map. Last session: bus dot bug fixed (it was M misreading the ship icon; strong minimap match ≥0.6 now wins over an M arrow >40 px away, `liveMap.ts`); markers read from the minimap (`readMinimapMarkers`: own white pin with diamond, teammates' solid pins; edge-stuck pins skipped; newest per colour); M left panel read (`readMapPanel`: storm timer, players/teams left, kills per member, names cut out as pictures) shown in the new Squad panel (`MapPanelPanel` in `games/fortnite/FnPanels.tsx`). User played a live match on the dev app: dot, markers and Squad panel all right. beta.18: the M layer hides the moment the map stops lining up (zoom, reopen) and re-finds it by trying the nearest 1.5x zoom steps first (`locateAsync(px, lastGood)`, ~0.8 s vs 15-20 s).

## Phase F4 goal
Inventory, ranked, bests, achievements, beta (see PROJECT_PLAN.md "Phase F4").
Deliverables:
- Hotbar reading: 5 slots with item + rarity, ammo per gun, reserve ammo, materials, health and shield, medallions and mythics; live inventory panel on the second monitor (replaces the "inventory placeholder").
- Loadout history: final loadout per match and "best loadouts" by placement.
- Ranked rank + progress bar read after Ranked matches, chart over time.
- 0-100 match score with the formula shown; personal bests and streaks (kills, chests, top-10 streak, win streak).
- Fortnite achievements in the hub with the unlock popup.
- Release a beta (next: **beta.19**).
Done when:
- Inventory and ranked read right in real matches, and the beta installs and updates.

## Decisions & constraints to respect
- **Never read Fortnite's memory, inject, hook or touch its process/files.** Screen, log (match start/end/mode), fortnite-api.com only.
- The fortnite-api.com key is a secret (userData/fortnite/key.bin), never in repo/settings/logs/chat.
- Readers go through gameArea (one copy per look; one place for Phase S1); work in "1920-wide" units (16:9 = 1920x1080, 16:10 = 1920x1200); no separate 16:10 mode; don't tune fixed HUD boxes (S1 does auto-locate).
- Every feature has its own switch; overlays see-through; Alt+S hides all.
- Digits: build templates from real frames (as `readMapPanel` did: 10x14 pictures, clustered then labelled by eye). Names never read as text: keep cut-out pictures.
- The rebuilt TRN-style squad strip (S-E3e) is Phase S3, not F4: starts on top of the minimap, Alt-drag, Ctrl+B toggle. F4 reads the inventory; S3 draws the strip.
- Publish each finished dev step as a beta (annotated tag `v0.0.4-beta.N`, patch notes in a file, `-F`) — only after it runs in the app.
- Order: finish Phase F (F4, F5), then Phase S.
- User is new: plain words, click-to-pick question widgets. Tests by recording (Win+Alt+R) with timestamps. `npm.cmd run dev`; quit the installed app first (ask). Some files are CRLF, most LF: edit via small Python scripts that keep each file's endings. `reports/`, `research_notes/` stay untracked.
- Replay harness idea (rewrite in the scratchpad; old ones are gone): copy `shared/fortnite*.ts` with `.ts` import suffixes, run with plain `node` (type stripping), pipe ffmpeg `-f rawvideo -pix_fmt bgra` frames scaled to 1920 wide.

## Loose ends / known issues
- Dot accuracy over whole recordings at 1 look/s: friend's 16:10 ~94% sure, your rec 1 (12-56-32) 85%, rec 2 (14-08-09) 81%; one live match checked by the user. The minimap marker reader is proven on the friend's video only (none of your recordings' markers came into minimap view).
- Squad link still never tested between two PCs (F5). Friends' chests on the map window and M layer share the same code, but they haven't been seen live.
- Placement in team modes is still empty: the M panel's teams-left (when you go down) or the end screen "#N" could give it.
- The M layer window's position on scaled (125%/150%) screens isn't checked yet.
- World→map fit (1.46 m/px) is per island; a new season may need it redone.
- The dev app may still be running in terminal tab c1; the installed app was closed for testing (beta.17 will auto-update it once reopened).
- `phaseF1/fortnite-foundation` isn't merged to main; ask before merging.

## How to start
1. Read the files above.
2. Confirm the phase goal with the user in 1-2 lines.
3. Begin.
