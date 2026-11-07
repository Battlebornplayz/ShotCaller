PHASE HANDOFF — ShotCaller — Phase 1 → Phase 2

Use the `phased-project` skill. You are starting Phase 2.
At the end of this phase, write a new handoff in this same format for Phase 3
(and tell that chat to do the same), so every phase hands off to the next.

Project folder: D:\ShotCaller
Read first: PROJECT_PLAN.md, DESIGN.md

## Project in one paragraph
ShotCaller is a polished, official-looking Electron desktop app: a cross-game achievement hub (Steam first, real-time unlock popups, XP, profiles, friends) plus per-game overlay modules. The first game module is Skillshot City (free-to-play roguelite battle royale, Steam app 308600) with a skill-pick advisor, build tools and a round tracker. Public MIT repo Battlebornplayz/ShotCaller, installed from GitHub Releases, with a launcher splash that shows "Update to latest version" when a newer release exists. Stack: Electron + TypeScript + React + Vite, electron-builder, electron-updater, Supabase later.

## Done so far
- Phase 1 (just finished): 50-question design interview. All decisions in DESIGN.md; 12-phase plan in PROJECT_PLAN.md. No code yet, no git repo yet.

## Phase 2 goal
An installable app shell that updates itself from GitHub.
Deliverables:
- git init, create public repo Battlebornplayz/ShotCaller with `gh` (already logged in), MIT license, README, .gitignore; commit existing docs.
- Electron + TS + React + Vite scaffold with a `games/` module slot.
- Launcher splash: logo placeholder, patch notes from GitHub release body, big Play button, "Update to latest version" button + download progress + restart to apply.
- Stable/beta channel setting (beta = GitHub pre-releases).
- Main window shell: Mobalytics-inspired dark navy theme (see DESIGN.md Q17), #4F8CFF accent, Discord-style game-icon sidebar, empty section pages.
- GitHub Actions: on tag push build Windows NSIS .exe + Linux AppImage and publish to Releases.
Done when:
- v0.0.1 installed from Releases; publishing v0.0.2 makes the splash show the update button; clicking it updates and relaunches.

## Decisions & constraints to respect
- Mobalytics-inspired look: deep navy (#0F1023 / #1A1C3A cards / #090A18 sidebar), rounded cards, pill badges, data-dense stat tiles; style only, no Mobalytics assets. Accent electric blue #4F8CFF. Megaphone/"callout" logo (placeholder ok), full animations.
- Update UI lives on the launcher splash (gamer-launcher style with patch notes), not a banner.
- Windows installer (NSIS) + Linux AppImage. Stable + opt-in beta channels.
- Multi-game architecture from day one; Skillshot City is just the first module.
- No memory reading / injection, ever. Legit achievement sources only.
- Unsigned builds will trigger Windows SmartScreen — mention it in the README for now.

## Loose ends / known issues
- None from Phase 1. Logo art is a placeholder until Phase 11.

## How to start
1. Read the files above.
2. Confirm the phase goal with the user in 1-2 lines.
3. Begin.
