# ShotCaller — Design

Third-party assistant/overlay app. First supported game: **Skillshot City** (free-to-play PvP roguelite top-down shooter, formerly Geneshift; Windows + Linux; 3 back-to-back battle royale rounds; level-ups offer a choice of 2 random skills). Built so more games can be added later (per-game modules).

## Fixed requirements (from the user)
- Name: ShotCaller. Multi-game ready; Skillshot City first.
- Public GitHub repo; app installable from GitHub Releases.
- On launch the app checks for a newer release and shows an "Update to latest version" button; clicking it updates.
- Built in phases (see `PROJECT_PLAN.md`, written at end of Phase 1), using the `phased-project` skill.

## Decisions

### Core concept (batch 1)
- Q1 Features: skill pick advisor, build library, match tracker, timers/reminders, wiki/item lookup, plus more gameplay-driven ideas (brainstormed in batch 2).
- Q2 Presence: all three modes, user picks in settings — always-on corner overlay, hotkey popup, second-monitor window.
- Q3 Data: built-in skill/item database. No memory reading or injection, to avoid ban risk.
- Q4 Stack: Electron (+ electron-updater with GitHub Releases).
- Q5 Updates: launcher splash screen on start checks GitHub; shows "Update to latest version" button when newer release exists.
- Q6 Audience: friends first, public later.
- User note: they want suggestions — propose ideas, don't just ask.

### Features and advisor (batch 2)
- Q7 Features chosen: build target mode, synergy alerts, round tracker (1/2/3), post-match recap, build win-rate stats, counter tips, share build codes, session goals, Discord rich presence, stream (OBS) overlay. Not chosen: death coach, pinned notes.
- Q8 Advice: side-by-side skill cards, recommended one highlighted, short reason.
- Q9 Database: Claude drafts from research, user corrects, community suggests edits via GitHub PRs. Data updates download separately from app updates.
- Q10 Launcher: gamer-launcher style splash with patch notes + big Play button (and the update button).
- Vision note: must look as official/polished as possible. Big pillar: cross-game achievement tracking (have / don't have, and more), "like Anker launcher's achievements but better". Must have features worth downloading for, across any game the user wants.

### Achievements and accounts (batch 3)
- Q11 Sources: Steam, ShotCaller custom achievements, RetroAchievements, Xbox/Epic (later phase), manual checklists.
- Q12 Unlock popup: corner card with icon, name, rarity %.
- Q13 Achievement page: list with progress bars. Extras: rarity %, guides/tips per achievement, hunt list pinned to overlay, completion % per game, friends comparison, unlock timeline, ShotCaller XP + levels.
- Q14 Game detection: auto-detect running game + import Steam library + add manually.
- Q15 Profiles: ShotCaller accounts with cloud sync (needs a backend; see batch 4).
- Q16 Reference: "Achievement Watcher" style — works even without Steam's overlay; instant unlock popups. Plan: watch local legit sources (e.g. Steam client's local stats) for real-time popups, plus APIs.

### Look and accounts (batch 4)
- Q17 Theme: ~~esports sharp neon~~ → **Mobalytics-inspired** (changed after Phase 1): deep navy/indigo backgrounds (#0F1023 page, #1A1C3A cards, #090A18 sidebar), rounded cards (10–12px), pill badges, data-dense stat tiles and progress bars, soft colored tints for tiers (gold = S tier, green = synergy), muted lavender secondary text (#8F93C9). Inspired by the style only — no Mobalytics assets, logos or names.
- Q18 Accent: electric blue #4F8CFF.
- Q19 Logo: megaphone / "callout" mark (fits "ShotCaller"). **Chosen in Phase 3 ("variant 2"):** white megaphone with sound wave inside two crossed light-blue (#7FB2FF) orbit ellipses (±30°) on a navy #1A1C3A rounded tile; at 16px the wave is dropped and orbits thicken. Source: `src/components/Logo.tsx`; PNGs in `resources/` (tray, window) and `build/icon.png` (installer).
- Q20 Layout: game-icon sidebar (Discord-style) + section list + content.
- Q21 Backend: Supabase (auth + Postgres, free tier).
- Q22 Sign-in: Steam, Discord, Google, email/password.
- Q23 Piracy-adjacent sources: user dislikes that use case; wants the *good* version — helping people whose achievements are bugged/don't register. Resolution in batch 5 (Q24).

### Overlay and Skillshot City (batch 5)
- Q24 Bugged achievements: "mark as earned" inside ShotCaller with screenshot/clip proof (shown with a proof badge, never written to Steam) + community known-bugged database with workarounds. No unlocking on Steam itself.
- Q25 Overlay default: top right, draggable, idle opacity 70%.
- Q26 Click-through: (skipped → default) click-through; hold Alt to interact.
- Q27 Hotkeys: (skipped → defaults, all rebindable) Alt+S popup, Alt+1/Alt+2 pick skill, ~~Alt+R~~ **Alt+N** next round (changed in Phase 3: NVIDIA's overlay owns Alt+R), Alt+E end match/recap, Alt+H hunt list. Hotkeys are only registered while a game runs or the overlay is open (setting).
- Q28 Skill input: goal is auto-detect via screen reading (OCR/image match of the 2 offered skills). Manual icon grid + search kept as fallback until auto-detect is reliable.
- Q29 Round HUD: full panel — round X/3, build icons, synergy meter.
- Q30 Performance: full animations always.

### Release, privacy, social, scope (batch 6)
- Q31 GitHub user: Battlebornplayz; `gh` CLI is logged in on this PC. Repo: Battlebornplayz/ShotCaller.
- Q32 License: public repo, MIT.
- Q33 Install: one-click Windows installer (NSIS via electron-builder) + Linux AppImage.
- Q34 Channels: stable + opt-in beta (GitHub pre-releases).
- Q35 Privacy: cloud gets synced profile data only; crash reports opt-in. No usage analytics.
- Q36 Social: friends list, activity feed, leaderboards, shared achievement hunts.
- Q37 Sounds: custom sound pack, rarer unlocks get fancier sounds.
- Q38 Startup: auto-opens when a supported game launches (needs a tiny background watcher / tray).
- Q39 v0.1 friends release: everything — launcher + auto-update, Steam achievements + popups, overlay (round tracker + skill advisor), Skillshot City DB, accounts + cloud sync, screen-reading auto-detect, friends/social.
- Q40 Emphasis: achievements are general — a hub for all your Steam (and other) achievements, not Skillshot-specific. User wants more design questions (batch 7).

### Achievement hub (batch 7)
- Q41 Home widgets: playing now / last played, closest to unlock, recent unlocks, friends feed, stats summary (total, perfect games, XP), daily/weekly challenge.
- Q42 Library: toggle between cover-art grid (completion rings) and banner list (progress bars).
- Q43 Secret achievements: blurred until click.
- Q44 XP: scales with global rarity (rarer = more XP).
- Q45 Profile: banner, level ring around avatar, 5-achievement showcase.
- Q46 Sort/filter: easiest first (by global unlock %) — plus basic sorts (name, unlocked/locked).
- Q47 Guides: links out to Steam guides / web search per achievement.
- Q48 Game page: achievements, playtime + sessions, friends who play it.
- Q49 Release: no per-phase alpha builds for friends; friends get the full v0.1. (Developer still ships test releases to verify updater.)

## Technical notes
- Steam Web API key must NOT ship inside the app. Steam calls go through a Supabase Edge Function proxy that holds the key; users identify via Steam sign-in (OpenID) → SteamID.
- Real-time unlocks: watch Steam client's local per-user stats/achievement cache files for changes, then confirm via API. Legit sources only — no parsing of cracked/emulator achievement files.
- Epic has no public achievement API; Xbox possible via third-party (OpenXBL). Treat both as "investigate" in a late phase.
- Overlay works over borderless/windowed games only (no injection). Document that exclusive fullscreen hides it.
- Game support is per-game modules (`games/<id>/`): Skillshot City is the first; generic games get the achievement hub only.

## Open questions
- Logo chosen (see Q19); Phase 11 may still polish the artwork.
- Skillshot City skill list/icons: Claude drafts from research, user verifies in-game.

## Open questions
