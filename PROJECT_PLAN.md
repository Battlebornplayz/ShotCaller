# ShotCaller — Project Plan

One phase per chat, using the `phased-project` skill. Each phase ends with a handoff (`HANDOFF.md`) for the next.
Target: **v0.1** = everything below, released to friends via GitHub Releases. Decisions live in `DESIGN.md`.

Stack: Electron + TypeScript + React + Vite, electron-builder (NSIS .exe + AppImage), electron-updater (GitHub Releases, stable + beta channels), Supabase (auth, Postgres, Edge Functions).

---

## Phase 1 — Design ✅
50 design questions answered. `DESIGN.md` written. This plan written.

## Phase 2 — Foundation, repo and auto-update
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

## Phase 3 — Games, detection, overlay framework
Goal: ShotCaller knows what you're playing and can draw an overlay.
Deliverables:
- Game module system (`games/<id>/` manifest: name, exe names, Steam app id, art, optional overlay panels). Skillshot City module stub (Steam app 308600). Generic module for any other game.
- Game detection: running-process watcher, Steam library import (local `libraryfolders.vdf` / manifests), add game manually.
- Tray app; auto-open when a supported game launches.
- Overlay window: transparent, always-on-top, top-right default, draggable, 70% idle opacity, click-through until Alt held; three presence modes (always-on, hotkey popup, second-monitor window) chosen in settings.
- Global hotkeys (Alt+S/1/2/R/E/H), rebindable in settings.
- Settings page (overlay, hotkeys, startup, channel).
Done when: launching Skillshot City opens ShotCaller and shows a placeholder overlay panel over the game; hotkeys work; settings persist.

## Phase 4 — Accounts and cloud (Supabase)
Goal: sign in and sync.
Deliverables:
- Supabase project, schema (profiles, games, achievements cache, unlocks, proofs, friends, xp), row-level security.
- Sign-in: Steam (OpenID via Edge Function), Discord, Google, email/password. Deep-link/loopback callback into Electron.
- Edge Function proxy for Steam Web API (key stays server-side).
- Profile sync; privacy settings (synced profile data only; opt-in crash reports).
Done when: user can sign in with each method on two PCs and see the same profile.

## Phase 5 — Steam achievement hub (core)
Goal: the main reason to download it.
Deliverables:
- Pull owned games, achievements, global rarity for any Steam game (via proxy).
- Library: toggle cover grid (completion rings) / banner list (progress bars).
- Game page: achievement list with progress bars, rarity %, completion %, secrets blurred until click, easiest-first sort, links to Steam guides/web; playtime + sessions.
- Real-time unlock detection by watching Steam's local stats cache; corner-card popup (icon, name, rarity) with sound that gets fancier with rarity.
- Unlock timeline.
Done when: unlocking a real Steam achievement shows the popup within seconds and it appears in the timeline and game page.

## Phase 6 — Hub home, XP, profile, extra sources
Deliverables:
- Home widgets: playing now, closest to unlock, recent unlocks, friends feed (placeholder until Phase 10), stats summary, weekly challenge.
- ShotCaller XP (scales with rarity) + levels; profile page (banner, level ring, 5-achievement showcase).
- Hunt list pinned to overlay.
- Bugged achievements: "mark as earned" with screenshot/clip proof (proof badge, ShotCaller-only) + community known-bugged list with workarounds.
- Manual checklists for games without an API; RetroAchievements integration.
Done when: home screen is fully populated from real data and XP/level updates after an unlock.

## Phase 7 — Skillshot City database
Deliverables:
- JSON schema for skills, items, weapons, synergies, counters.
- Research-drafted data (user verifies in-game), icons.
- Data updates shipped separately from app updates (versioned data pack fetched from repo/Releases).
- CONTRIBUTING guide for community data PRs.
- Build library: saved builds, share codes, counter tips, quick lookup.
Done when: the database covers every skill the user can find in-game and a data-only update reaches an installed app without reinstalling.

## Phase 8 — Skillshot City overlay
Deliverables:
- Skill pick advisor: side-by-side cards, recommended highlighted, short reason; manual pick via icon grid + search (fallback).
- Build target mode, synergy alerts.
- Round tracker panel: round X/3, build icons, synergy meter.
- Post-match recap, build win-rate stats, session goals.
- ShotCaller custom achievements for Skillshot City (driven by recaps).
Done when: a full 3-round match can be tracked end-to-end with advice and a saved recap.

## Phase 9 — Screen-reading auto-detect
Deliverables:
- Capture the game window region; template/OCR match the 2 offered skills; confidence threshold with manual fallback.
- Calibration screen for resolution/UI scale.
Done when: auto-detect picks the right two skills in most level-ups across a few matches at the user's resolution.

## Phase 10 — Social
Deliverables:
- Friends list, friend activity feed, leaderboards, shared hunt lists, friends comparison, "friends who play it".
- Discord rich presence.
Done when: two accounts can friend each other and see each other's unlocks live.

## Phase 11 — Stream overlay, extra platforms, polish
Deliverables:
- OBS browser-source stream overlay (current build / recent unlock).
- Investigate + add Xbox (e.g. OpenXBL) if workable; document Epic limits.
- Final logo (megaphone mark), custom sound pack, animation polish, accessibility pass.
Done when: polish checklist complete and stream overlay works in OBS.

## Phase 12 — v0.1 release
Deliverables:
- QA pass on Windows + Linux, crash-report opt-in check, README with screenshots, install guide, privacy note.
- Tag v0.1.0 stable; send to friends.
Done when: friends install from GitHub and the update flow works for them.
