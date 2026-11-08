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
- Q21 Backend: ~~Supabase~~ → **Firebase** (changed in Phase 4; accounts then deferred by the user — code built but dormant until a Firebase project is connected): Firebase Auth + Firestore with security rules, free Spark plan. No Cloud Functions (they need the paid Blaze plan).
- Q22 Sign-in: ~~Steam, Discord,~~ **Google + email/password** (changed in Phase 4: the user dropped Steam and Discord sign-in with the move to Firebase, since both would need server code). Google uses the installed-app OAuth flow (PKCE, loopback redirect) → `signInWithCredential`. Accounts can link Google and email together.
- Q23 Piracy-adjacent sources: user dislikes that use case; wants the *good* version — helping people whose achievements are bugged/don't register. Resolution in batch 5 (Q24). **Changed in Phase 5 by the user:** ShotCaller now reads local emulator achievement files (read-only) for games on this PC. It still never downloads games or writes to Steam.

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

### Phase 5 decisions (achievement hub)
- Local-only for now (the user's own PC); no Steam API key or proxy (see Technical notes).
- Games added by hand get achievements too: link them to a Steam game (search by name, import its public achievement list with icons and rarity) or create your own. The user ticks these off; ticking still fires the popup, XP-ready timeline entry and sound.
- **Anker Games launcher import:** games installed through the Anker launcher are auto-imported from its `library.json` (title, install folder, Steam app id) and detected when running from their install folder. Their achievement list comes from the linked Steam app; unlocks come from their local emulator achievement files (the user changed Q23), plus ticks.
- Popup: corner card (bottom right), five rarity tiers with synthesized sounds that get fancier as rarity rises; the custom sound pack stays in Phase 11.

### Phase 6 decisions (Skillshot City helper) — setup interview
Numbered P6-Q1… to avoid clashing with the Phase 1 numbers.
- **Phase 6 is split in two parts (user):** Part 1 = skills + synergies (data, advisor, build target, round tracker, recap). Part 2 = weapons, items, counters (and the rest of the Phase 6 list).
- **User rule: auto-detect anything possible** instead of manual entry.
- **Memory reading — changed by the user (2026-11-07):** the user accepts the ban risk and wants read-only memory reading for live data; when an anti-cheat appears they will switch the overlay to the safe sources. Rules: (1) **read-only** (ReadProcessMemory; never writes, never injects code); (2) **own player's state only** — level, XP, health, offered skills, build, round, timer; never hidden info about other players (positions, their health, etc.); (3) a separate "live memory" source behind a setting (with a risk warning), so screen reading + log still run the overlay when it's off; (4) values found with a built-in Cheat-Engine-style scanner (scan → change in-game → rescan) using signatures/pointer paths so they can be re-found after game updates. The game ships no client anti-cheat today (install folder: exe, openal, steam_api only).
- **Build order (user):** overlay first (running on log + manual pick), then the memory source.
- **Health readout (user):** once memory works, show your health (and shield) as real numbers, e.g. `412 / 600` with shield, not only the in-game bar over the character.
- **Second monitor (user):** the second-monitor window gets the richer UI: a bigger build-help layout (advice, build, synergies, goal build, health numbers, stats) instead of the compact corner overlay.
- **Vision (user):** a professional helper for both new and advanced players that gives them all the info they need about the game.
- **Discovery: the game's own files have most of the data (read-only, no memory reading):** in `<install>/data/`:
  - `translations/en.csv` (and other languages): official skill names + descriptions, skill trees (Healing, Defense, …), synergy challenge names. → Data is extracted from here, not hand-typed, so there's little left to "verify".
  - `log.txt` (+ `logPrevious1-3.txt`): every skill draft with the offered skills, levels and pick (`SKILL DRAFT n …: RADIATE(2), BOUNCING BULLETS(2), (-1), SELECTED: RADIATE(2)`), BR round number (`br round: 2 … brfinal`), build slots with rarity, and final standings (`Position #01: <name> score= trophies= kills= deaths= classID= playerLevel=`). → Round tracker, build, picks and recap can be fully automatic by tailing the log. The draft line is written at pick time, so live advice *before* picking still needs the offer from another source (see P6-Q7).
  - `weapons.ini`: weapon data (Part 2). `textures/menuTextures*.png`: sprite sheets that likely hold the skill icons.
- P6-Q1: **B** — skills + synergies in depth first (Part 1); weapons/items/counters in Part 2.
- P6-Q2: superseded — data comes from the game files automatically; the user only fixes tiers/advice if they disagree.
- P6-Q3: use the game's real skill icons (cropped from its texture sheets on this PC).
- P6-Q4: **C** — name, effect, tags, plus tier (S/A/B/C) and role; numbers optional.
- P6-Q5: **C** — quick lookup both as a page in the app and as a compact search in the overlay.
- P6-Q6: **C** — the recommendation uses tier + synergy with your current build (stack levels, round) + your own history from recaps (win rate per skill), so it learns.
- P6-Q7: **B** — screen reading of the 2 offered skills moves into Phase 6 (from Phase 8); manual pick (icon grid, search, Alt+1/Alt+2) stays as the fallback. The pick itself is confirmed from `log.txt`.
- P6-Q8: **B** — side-by-side cards with skill, level, tier badge and a one-line reason; the recommended one highlighted.
- P6-Q9: **A** — one mode for everyone (no beginner/pro toggle).
- P6-Q10: **A** — advise a reroll when both offers are weak and a reroll is available.
- P6-Q11: (user) make the current build easy to see: a build view auto-filled from the game (log), not typed in. Other in-game files worth reading: `data/profiles/<name>.guy` (player profile) and `data/config.ini` (server/mode, maxSkills).
- P6-Q12: **C** — goal build suggested from your first 2–3 picks; you can lock or change it.
- P6-Q13: **C** — synergy alerts: green glow on the offer that completes a synergy + a toast with sound when it becomes active.
- P6-Q14: **C** — synergy meter shows goal-build % and active synergies count.
- P6-Q15: **B** — build panel: real icons, rarity-colored borders, level pips, green links between synergizing skills.
- P6-Q16: **A** — class-aware advice; class read from the game automatically.
- P6-Q17: **A** — read the in-game skill pool so goals only use skills that can actually be offered.
- How it works (explained to the user): tail `log.txt` live — level-ups (`Player leveled up: <you>`), offer opened (`Generating Draft` / `StartQuickSkillUnlock`) → screenshot + match the 2 cards → advice; pick confirmed by `SKILL DRAFT n … SELECTED:`; round from `br round: N … brfinal`; stats from `Giving Syringe for Kills`; match end + recap from `Position #NN:` lines. Your player name comes from `data/profiles/<name>.guy`. **Verified live (2026-11-07):** the game writes the log in **chunks**, not line by line — in-game events from 58 s to 210 s all landed in one write at 22:54:33, the next batch at 22:56:04 when the game closed. Delay ranged from ~0 to ~2.5 min. Consequence: **screen reading is the live source** (offers, level-ups, round banners); the log is the accurate, slightly late source used to confirm picks, fill the build, rebuild the timeline (each line has the in-match time) and write the recap. Also seen: `Build Slot (Rarity=n): ID=… Name=…` lines = your in-game skill pool with rarity (P6-Q17), and `Generating New Draft … player level: 2 … reroll counter` gives level and rerolls. Extractor test on the real files: 54 skills, 8 classes, 80 synergies (52 class+skill, 28 skill+skill) each with the game's own tip.
- P6-Q18: **B** — rounds fully automatic from the log; Alt+N / Alt+E remain manual overrides.
- P6-Q19: **B** — round panel shrinks to a thin strip during fights; full panel on level-up, between rounds or while Alt is held.
- P6-Q20: **B** — live match stats on the panel: kills/syringes, your level, wanted level, skill points left.
- P6-Q21: **B** — default position top right, moved down below Skillshot City's QUIT button.
- P6-Q22: **B** — holding Alt lets you click without taking focus from the game; if the game minimizes anyway, ShotCaller restores it.
- P6-Q23: **B** — in the lobby/between matches the overlay shows a mini recap of the last match + session goal progress.
- P6-Q24: **C** — recap: short card on the overlay at match end + full recap in the app's match history.
- P6-Q25: **B** — recap includes placement, K/D, final build, every pick by round, advice followed or not, best/worst pick.
- P6-Q26: **C** — win % = 1st place; also average placement and top-3 rate.
- P6-Q27: **C** — stats per skill, synergy, build and class, plus trend over time.
- P6-Q28: **C** — session goals: a few suggested from your stats each session + your own.
- P6-Q29: **A** — import past matches from the existing `log*.txt` files on first run.
- P6-Q30: **C** — build library: every match's build auto-saved with its result, star favorites, plus import of the user's in-game skill builds.
- P6-Q31: **C** — share as a short text code (e.g. `SSC-7F3K-R2Q9`) and as an image card.
- P6-Q32: **C** — 50+ ShotCaller achievements for Skillshot City, including very hard ones.
- P6-Q33: **C** — types: skill mastery, feats (kills, deathless wins, streaks) and helper ones (follow the advice N times, etc.).
- P6-Q34: **A** — tier list drafted from community guides, then adjusted by the user's own win rates.
- P6-Q35: **C** — lookup page: list + search, filters (tree, tag, tier), synergy map, and your win rate / pick rate / best partners per skill.
- P6-Q36: **A** — screen reading = icon template match + OCR of the skill names, fully offline on the PC.
- P6-Q37: **A** — names/text re-extracted from the game files after each game update; tiers/advice ship as small data packs from GitHub (separate from app updates).
- P6-Q38: **C** — counter tips (Part 2) in the recap and live on the overlay, if the log records who hit/killed you.
- P6-Q39: **A** — soft sound cue when the advice cards appear.
- P6-Q40: **A** — tag beta v0.0.4 after Part 1 (also the first test of silent in-place updates).
- P6-Q41: **B** — ShotCaller's Skillshot text follows the game's language setting (game ships de/es/fr/pt_BR/ru/zh_Hans translations).

## Technical notes
- **Steam data (decided in Phase 5): local-first, no API key, no proxy.** For now ShotCaller is for the user's own PC. Achievement lists come from Steam's local schema cache (`appcache/stats/UserGameStatsSchema_<appid>.bin`), unlocks + unlock times from the local stats cache (`UserGameStats_<accountid>_<appid>.bin`, binary KeyValues), playtime from `userdata/<accountid>/config/localconfig.vdf`, the SteamID from `loginusers.vdf`, global rarity from the keyless `GetGlobalAchievementPercentagesForApp` endpoint, and achievement lists for games Steam hasn't cached from Steam's public achievement page. A Steam Web API key still never ships in the app; a proxy (Cloudflare Worker recommended) only becomes necessary if public users need data Steam doesn't keep locally (e.g. owned-but-never-played games).
- Real-time unlocks: watch the Steam client's local stats cache (and local emulator achievement files) for changes and diff the unlocked set (no API round trip needed).
- Epic has no public achievement API; Xbox possible via third-party (OpenXBL). Treat both as "investigate" in a late phase.
- Overlay works over borderless/windowed games only (no injection). Document that exclusive fullscreen hides it.
- Game support is per-game modules (`games/<id>/`): Skillshot City is the first; generic games get the achievement hub only.

## Open questions
- Logo chosen (see Q19); Phase 11 may still polish the artwork.
- Skillshot City skill list/icons: extracted from the game's own files (see Phase 6 decisions).
