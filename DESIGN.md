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
- **Learning is a goal (user, 2026-11-08):** the user is not good at the game yet and wants ShotCaller to teach them to play. Advice explains why in plain language and doesn't assume game knowledge. This doesn't undo P6-Q9 (still one mode for everyone).
- **Research first (user, 2026-11-08):** this is the first overlay of its kind for the game, so do as much research as possible. Notes in `research_notes/Skillshot City game knowledge/`, report in `reports/`.
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
- **Skill collection reader (user, 2026-11-07, Part 1):** auto-read owned skills per class with rarity colors (Common grey / Rare blue / Epic purple / Legendary gold). Sources: each match's equipped build (`Build Slot` lines) under the class from your standing (classID follows the game's class order: 1 Assault, 2 Marksman, 3 Heavy, 4 Caster, 5 Scavenger, 6 Criminal, 7 Scientist, 8 Assassin; unverified beyond 1) and the profile's `::IMPS` owned list (skill numbers, names learned from the log). Full collection is server-side (HTTPS) → memory reader fills the rest. Flask results are not logged; the profile is saved on game exit. Network interception rejected (HTTPS + root cert/proxy, injection rule).
- **ShotCaller MCP (user, 2026-11-07):** localhost MCP server so Claude can assist players; goes in Phase 6 Part 2 (see PROJECT_PLAN).
- **Built-in Ask engine (user, 2026-11-07):** the main assistant is ShotCaller's own offline engine that answers from overlay/app data (no API key, no cost, no account). The Claude MCP is an optional add-on on top. Not using the Claude API inside the app: it bills per use and needs a key.
- **Advanced builder (user, 2026-11-07):** ShotCaller's own builder makes good *and* fun builds for the playstyle you want, using advanced stats.
- P6-Q42: **C** — pick a playstyle card, then fine-tune with sliders (aggression, range, survival, spice).
- P6-Q43: **B, C, D, E, F** (offer odds corrected, see "Research findings" below) — drive builds with: your synergy pair results, offer odds from your equipped build + rarity, tiers + community notes, skill numbers (damage/cooldown) when found, kills/deaths per build. (Per-skill win % was not picked as a builder input; the live advisor still uses it.)
- P6-Q44: **B + C** — a spice slider (meta ↔ wild combos) plus a "surprise me" button for a random themed build.
- P6-Q45: **A** — builds use only skills you own.
- P6-Q46: **B** — top 3 builds with pros and cons.
- P6-Q47: **C** — each plan: skill list + what to max first + backup picks and reroll targets.
- P6-Q48: **A** (corrected, see "Research findings" below) — the builder also plans the build you equip in the game. The equipped build only guarantees the right-hand offer for skills 3 and 4, and makes those skills somewhat more likely elsewhere.
- Presets (user: "come up with a bunch"): 17 styles in `games/skillshot-city/playstyles.json`, built on the game's official synergy pairs — Unkillable tank, Clone army, Nuke caster, One-shot sniper, Bullet hose, Shadow assassin, Pyromaniac, Plague doctor, Demolition expert, Blade dancer, Speed demon, Kingpin, Road rage, Vampire lord, Cooldown machine, Recon, Chaos gremlin.
- P6-Q41: **B** — ShotCaller's Skillshot text follows the game's language setting (game ships de/es/fr/pt_BR/ru/zh_Hans translations). ShotCaller's own text (how-to lines, Learn page) is English only so far.

### Phase 6 research findings (2026-11-08)
Full report with sources: `reports/Skillshot City game knowledge.md`; notes in `research_notes/Skillshot City game knowledge/`. Checked against game version 1992, hotfix 23.
- **Offers don't work the way we assumed.** 5 skills per match, mostly random from every unlocked skill (26 on the user's account). Only the right offer on skills 3 and 4 comes from the build; equipped skills are also more likely on random steps, by an unknown amount. So a build plan is a preference, never a guarantee. `pool`/`collection.json` only hold the equipped 8.
- **Score** is showdown kills + round wins only (since 2026-07-07): +1 per survivor killed in showdown, +5 per round 1/2 win, +100 for the round 3 win (read off the user's own v0.992.23 end screen, 2026-11-03). Level gives no points. Only round 3 decides the winner.
- **Owned skills are detected from files after all:** every skill number in the profile's `::IMPS` draft history is unlocked (offers only come from unlocked skills). History (25) + equipped build (1 more) = exactly the game's `Enabled: 26`. Rarity is still only known for skills seen equipped (8), which the memory reader or equipping them fills in.
- **Builder (`shared/skillshotBuilder.ts`):** beam search over owned skills: slider fit, ranked stats (spice trades them for rarely used skills), rarity, official synergies, your own pair and K/D results, penalties for stacking shields and for too many active skills. "Keep it simple" (default on, for the learning user) favors automatic skills. Each build has 5 skills, as in the game.
- **Icons:** positions in `games/skillshot-city/icons.json`, cropped from the installed game at startup (art isn't shipped). Numeric skill ids confirmed for all 54 there.
- **Tiers now come from data:** skillshotcity.gg public ranked tables, all 54 skills, all-ranks + Top 100, stored in `tiers.json` with the numbers. Provisional: win rate is undefined there, samples are hidden, about 8 days of data, gaps under 3 points are noise. Low ranks have no ranked data. Refresh after patches.
- **Rarity:** max level 4/5/6/7, values follow 2/3/4/5/6/8/10 across levels, mutation strength 40/60/80/100%. Syringe: 3 kills per round, +2 levels + mutation.
- **Not the first overlay.** SSC Mod Menu (Epiano7, MIT, hooks the game) already has match recording, summaries and stats, and held a gated live draft advisor now retired, reason unknown. Don't describe ShotCaller as "first". Its room is live draft coaching, build planning and teaching.
- **Developer's stance on overlays and memory reading is unknown, not permissive.** No statement found, no anti-cheat found, no EULA readable, Discord unread. Direct contact recommended (skillshotcity@gmail.com, or Steam forum) before shipping memory reading or live ranked advice. The user's earlier acceptance of the ban risk still stands, but it predates this finding.
- **skillshotcity.gg API** (`/api/draft` has per-offer scores) is disallowed by its robots.txt with no terms: ask the operator before using it. Public pages only until then.
- **Open questions to test in game:** reroll per draft or per match, which level maps to which draft step, whether the "weekly skill rotation" text is live (hover a top build slot), class number mapping beyond 1.

### Skill builder overhaul (user, 2026-11-09)
The user's complaints: they couldn't choose skills themselves, and it didn't look good. **Changes P6-Q42 and P6-Q46:** you now build by hand and a coach reacts. The playstyle cards, sliders, surprise me and top 3 builds stay, but as an optional "Need a starting point?" section that loads a build you can change.
- **Synergy map is the centre of the page** (`games/skillshot-city/BuilderPage.tsx`, `shared/skillshotCoach.ts`, `src/styles/skillbuilder.css`): your class in the middle, skills linked by the game's official synergies only. Laid out by a repeatable force layout measured to the real width, and nothing moves as you pick. Green = active, dashed green = one side picked.
- **Why clusters, not a ring:** the user's 27 owned skills have only 5 official skill-to-skill pairs plus a few class links each, so a ring of every skill would be mostly empty. Skills with no pair go in a tray under the map.
- **Coach:** skill card on hover, good next picks (first picks show one of each job), build check, the game's synergy tips, and for 3+ skills what to level first, backups and what to equip. A goal needs at least 3 skills. A full build swaps by clicking a slot.
- **Owned skills only (P6-Q45 stands), with hints:** up to 4 locked skills appear dashed on the map, up to 3 in "Worth watching for". Flasks decide unlocks, so hints never say "unlock this next".

### Launcher flow (user, 2026-11-09)
Opening ShotCaller yourself (shortcut or tray) always goes launcher, then Play, then the app, even if it's already running in the tray. If a window is already up, that window comes to the front instead. Starting with Windows stays hidden in the tray, and in-game shortcuts (overlay "Open app", game launch set to open the window) go straight to the app. The launcher has a Stable/Beta picker that checks that channel straight away. Picking older versions was left out: it means installing old releases and stopping the update offer, and older versions may not read newer data.

### Look: the unlock card is the model (user, 2026-11-09)
The user finds the achievement popup the cleanest GUI in the app, so everything follows it (`src/styles/global.css`): a diagonal navy gradient, a thin border tinted by a `--tier` colour, a coloured bar down the left edge, a soft glow, and a coloured uppercase line above a bold title with quiet detail below. Set `--tier` on a panel to give it a meaning (rarity on skill rows, accent on the recommended pick). `.card` / `.overlay-panel` / `.ss-card` are panels, `.tier-row` is a list row, `.tile` is a flat block inside a panel, `.eyebrow` / `.section-label` are the coloured line.
- **Changes P6-Q8:** advice cards are stacked rows shaped like the unlock card, in the order the game offers them, instead of side by side. This applies to the second-monitor view too: side by side cut off the skill names there.

### Phase 6 screen reading (2026-11-09)
Code: `shared/skillshotVision.ts` (matching + layout, pure), `electron/skillshot/screenCapture.ts` (Windows copy of a screen area, only while the game is the front window), `electron/skillshot/screenReader.ts` (polls every 400 ms, setting `skillshot.screenReader`, on by default).
- **The draft is not a modal.** Two small panels at the top centre, and the fight goes on behind them. At 1920x1080 the icons are 38 px at x 769 and 994, y 47. Other resolutions assume the UI scales with height: unchecked.
- **Offer = both slots read clearly, twice in a row.** The reader needs no "draft open" trigger, since an idle slot scores far under the 0.78 threshold (0.36 at most on the real shot, against 0.89-0.96 during a draft).
- **The top-centre row is your build** (user, 2026-11-09): one icon per skill, growing from the centre, 28 px at y 31 (y 45 on the end screen). A new skill showing there says which card you took. An upgrade leaves the row unchanged, so those fall back to a click on a card, and the log corrects anything else (up to ~2.5 min later).
- **Rarity is read off the card (2026-11-09).** The colour of the panel's `Lvl x/y` text shows rarity, matching the max level printed there (4/5/6/7 = Common/Rare/Epic/Legendary). Hue / saturation at 1080p: Common 219 / 0.43, Rare 186 / 0.89, Epic 282 / 0.66, Legendary 49 / 0.81 (`readRarity`). Colour was chosen over reading the digits: it needs no digit templates and doesn't depend on text position. Replayed on all 21 real strips from one match: 41 of 42 cards right, none wrong, 1 "not sure" (the mouse crosshair was over the text). The strip grew from 335 to 400 px so the right card's whole `Lvl x/y` is in view for later.
  - A rarity counts after the same answer twice in a row, once per offer. It's stored apart from the log's rarities (`CollectionStore.screen`): only the newest screen read counts, so a misread gets corrected next time, and the shown rarity is the highest of log and screen. The advisor, collection card and builder all read it through `toCollection`.
  - A rise over a known rarity shows a small overlay toast. A first-time read doesn't. A notice for a newly unlocked skill isn't built.
  - Not checked: other resolutions (the blue bar just under the text reads as Common if the layout is off), whether holding the syringe key changes the text colour, and the build row's disc colours, which are no longer needed for rarity.
- **The draft header shows your level** ("Skill Draft For Level 11"). A possible live level source ahead of the log, and data for the level-to-step map. Reading its digits isn't built.
- **Real match, before the rules were loosened (2026-11-09):** 10 of 11 drafts read with no wrong pair, 1 missed, and a repeat read when Force Field's gap dipped. The best-scoring skill was right in all 21 saved strips, and today's `readOffers` accepts all 21, so these faults should be gone. That still needs a live re-run.
- **The syringe key isn't always Alt.** The panel says "Hold CTRL and select a skill (or reroll)" on this PC; the game's text has the key as a placeholder, and older notes say Alt. Don't name a key in teaching text.
- Records for checking accuracy: `userData/skillshot/vision/reads.jsonl` (each read and pick) and up to 200 `offer-*.png` + 20 `unsure-*.png` strips. Local only.
- **Seeing that it works (user, 2026-11-09):** a one-line status at the top of the overlay in every view, plus a Screen check tab (`games/skillshot-city/ScreenCheckPage.tsx`): plain-language state with what to do about it, a live picture of the strip with where it looks marked, and each read marked right / wrong / missed against the log's `SKILL DRAFT` lines (`checkAgainstLog`). The read list is this session only.

### Fortnite mode — design interview (started 2026-11-10)
Goal (user): "the best Fortnite companion". A new game module, `games/fortnite/`, built after Skillshot Phase 6 Part 1.
- **Hard rule: never read Fortnite's memory or touch its files/process.** Fortnite runs Easy Anti-Cheat + BattlEye; memory reading would very likely get the account banned. Screen reading only (plus online stats). Overlay needs Windowed Fullscreen; the second-monitor window works either way.
- **Q1 home:** a game hub with tabs, like Skillshot's.
- **Q2 modes played:** Battle Royale (builds), Zero Build, Ranked, Reload. Creative not needed.
- **Q3 main job:** track my numbers (chests, kills, placements). Coaching is not the focus.
- **Q4 data sources:** screen reading + online stats with the Epic name. The user left out the log file and replay files (see the batch 2 follow-up).
- **Q5 first feature:** the chest counter (reads the "chest opened" XP popup).
- **Live map from the minimap (user idea):** feasible without memory. The minimap is a crop of the same map art the public map service serves, so matching the minimap picture against the full season map gives your position. That could also give a trail and where you opened chests. Untested: may blur in the storm or while gliding.
- **Q6 chest counter counts:** chests and rare chests, each kind on its own. Not supply drops, ammo boxes or other XP popups.
- **Q7 totals:** this match, this session, today, all time.
- **Q8 look:** a small overlay card (each kind + the session total).
- **Q9 live map draws:** my position, my path this match, and pins for where I landed and died across matches.
- **Q10:** the Fortnite log file may be read, only to find when a match starts and ends.
- **Q11 online stats:** fortnite-api.com with the user's own free key. **The key is a secret: it goes in ShotCaller's settings (userData), never in the repo, DESIGN.md or the build.** The user has a key.
- **Rule for every overlay part (user):** each feature the user agrees to has its own on/off switch, and overlay parts are see-through (not full opacity) so they don't block the game.
- **Q12 inventory:** both a live copy (bigger, on the second monitor) and a loadout history (what I carried vs. how I placed, "best loadouts").
- **Q13 inventory shows:** the 5 slots with item + rarity colour, ammo in each gun, reserve ammo, materials (builds), health and shield, medallions and mythics. All read from the screen.
- **Q14:** no weapon info (damage, fire rate).
- **Q15 map layers:** place names, my landing-spot stats (average placement per place), grid letters, death heat map.
- **Q16 new season:** download the new map by itself and keep old seasons' pins archived.
- **Q17:** Zero Build and Builds tracked apart, plus a combined view.
- **Q18 each match records:** placement, eliminations, chests, time alive, landing spot, distance travelled (from the live map), damage dealt (if the end screen shows it), final loadout.
- **Q19 recap:** on the second monitor, and saved in the hub.
- **Q20 history page:** charts of trends on top, the list of matches below.
- **Q21 online stats page:** wins, K/D and win rate per mode, and battle pass level.
- **Q22 goals:** yes ("50 chests today"), with progress on the overlay card.
- **Q23:** filter stats by team size (solo/duo/trio/squad).
- **TRN as the model (user):** take as many feature ideas as possible from Tracker Network (fortnitetracker.com and its overlay). Ideas only: don't scrape their site, use their data without permission, or copy their look or branding. "Top X% of players" is out of reach (needs other players' data).
- **Q24 Ranked:** rank + progress bar read from the screen after each Ranked match, with a chart over time.
- **Q25 live session panel** (matches, wins, kills, K/D, chests since launch, arrows against your usual): on the second monitor.
- **Q26:** a 0-100 match score blending placement, eliminations and time alive, with the formula shown.
- **Q27 personal bests:** most kills in a match, most chests in a match, top-10 streak, win streak. No toast when a best is beaten.
- **Q28 extras:** today's item shop and a wishlist alert when a chosen skin is back (fortnite-api.com). No news.
- **Q29:** Fortnite achievements of ShotCaller's own in the achievement hub, with the unlock popup.
- **Q30 overlay opacity:** 60% by default, adjustable.
- **Q31 position:** drag the card anywhere (position saved).
- **Q32:** the card is always visible (at the chosen opacity).
- **Q33:** a hotkey hides and shows every overlay at once.
- **Q34 style:** ShotCaller navy, with Fortnite's rarity colours for items.
- **Q35 size:** medium, with a size slider in settings.
- **Q36 second monitor:** the map on the left, panels stacked on the right (session, inventory, chests).
- **Q37 map view:** the whole map with my dot (no zoom-follow).
- **Q38 between matches:** last match recap, session panel, goals progress, and the map with my drop stats.
- **Q39 window:** fills the chosen monitor, choice remembered.
- **Q40:** opens when Fortnite starts and closes with it.
- **Other players' dots (user):** only what Fortnite already shows on your own minimap can be copied: teammates' markers, and whatever the game itself shows you (pings, sound-visualizer marks if turned on). Enemies the game doesn't show you can't and won't be shown: that needs memory reading and would be cheating.
- **Q41 other dots on the big map:** teammates in their squad colours, pings and markers, enemies only when the game itself reveals them, and teammates' paths.
- **Q42 order (user):** Fortnite next. Skillshot Phase 6 Part 1 is paused where it stands (its handoff is kept in `docs/handoff-skillshot-part1.md`).
- **Q43 first Fortnite version has everything:** match start/end, chest counter + card, placement + eliminations, match history, online stats, second-monitor map, live minimap tracking, inventory reading. It's split over several phases (PROJECT_PLAN "Phase F"), with a beta at the end.
- **Q44-47 the user's setup:** 1920x1080, default HUD (scale and layout unchanged), mouse and keyboard. Screen readers are tuned for this first; other setups unchecked.
- **Q46:** ShotCaller may save screenshots while the user plays (local only, with an off switch) to build and check the screen readers.
- **Grid and tracking (user idea):** opening Fortnite's full map (M) shows the same A-J / 1-10 grid and your arrow on the whole map. Reading that screen gives an exact position, so it can check and correct the minimap tracking. On the second monitor, the grid also lets you read off spots to call out.
- **Minimap tracking accuracy (estimate, unmeasured):** good on land in normal play; weak over open water and empty fields, where it should say "not sure" instead of guessing. It searches near the last position (you can't teleport), with a whole-map search only at landing. Things to check: does the minimap stay north-up, and does it zoom while skydiving or in vehicles? A feasibility test comes first, in F1.
- **The storm is a must-work case (user, 2026-11-10).** Two ways, used together:
  1. Shape over colour: match edges and outlines (roads, coasts, buildings) with brightness-normalised matching, so the purple tint barely matters. This is the main matcher everywhere.
  2. A storm version of the map: measure the storm tint from real screenshots (its colour and blend) and apply it to a copy of the season map. Minimap pixels that look like storm are compared against the storm copy, the rest against the normal map. This covers the minimap half in and half out of the storm.
  Whichever scores better counts. The test set must include in-storm and storm-edge screenshots.

### Phase F1 findings (2026-11-10)
- **Process:** `FortniteClient-Win64-Shipping.exe` (also `..._EAC_EOS.exe`, `FortniteLauncher.exe` in the same folder). The user plays Windowed Fullscreen (mode 1) at 1920x1080 (checked once by hand, the app doesn't read that file).
- **Log:** `%LOCALAPPDATA%\FortniteGame\Saved\Logs\FortniteGame.log` (backups `FortniteGame-backup-<date>.log`). Line times are UTC. A match = `LogLoad: LoadMap:` of an island (`Delilah_Terrain` this season), mode from `playlistid="Playlist_NoBuildBR_Squad"`, phases from `HandleGamePhaseChanged ... EAthenaGamePhase::Warmup/Aircraft/SafeZones/EndGame`, end = `LoadMap: /Game/Maps/Frontend?closed` (lobby) or the next island load (re-queue skips the lobby and the playlist line, so the mode carries over). `shared/fortniteLog.ts` found all 75 matches in the saved logs (Nov 7-10) with their mode. Leaving before the bus doesn't count as a match.
- **One chest count (user, 2026-11-10): if the XP label says CHEST, it's a chest.** Rare chests, treasure chests, sprite chests and any other "… CHEST" label all count as one chest; no kinds are kept apart. Replaces Q6's "chests and rare chests apart".
- **Season (Chapter 7 mini season "Treasure Hunters", Nov 1 - Dec 5 2026), user: include the treasure.** Chest kinds per the web, for reference only (all counted as one): **Treasure Chest** (the normal chest; gold skull icon), **Rare Chest** (silver skull icon; inside the 9 Vaults), **Sprite Chest** (dark chest with a purple crystal; dug up from a Treasure Map, or in Vaults). Other season items (Vault Keys, Wanted Posters, Treasure Maps) are not counted in F1.
- **Test footage:** the user records whole matches with Xbox Game Bar (Win+Alt+R, `Videos\Captures`, 1080p60); frames are pulled with ffmpeg (installed by winget) into `research_notes/fortnite/frames/` (untracked). First recording: `Fortnite 2026-11-10 12-56-32.mp4` (10.5 min, Zero Build Squad; died ~5:20).
- **HUD at 1080p, default:** top-right stack at x ~1520-1620: own eliminations (skull) y ~50, team eliminations y ~85, players left y ~127, storm timer y ~165. Minimap square x 1636-1888, y 32-284. XP total right side (1850, 773); hotbar bottom right; health/shield bottom left; squad list left.
- **Chest popup (checked):** opening a chest shows floating text right of centre: "+600 XP" (white) with the reason "CHEST" on the line under it, for ~2 s. Extra reasons stack as more lines ("+800 XP / WEAKPOINT STREAK / CHEST"). The glow is purple, **gold when XP is supercharged (user)**, so the reader matches the shape of the word, never its colour. Separate from it, a "+75 CONTAINER OPENED" toast by the level badge (x ~1460-1700, y ~470-520) also shows for other containers, so it isn't used.
- **Chest reader test (first recording):** grey-level shape match of the word "CHEST" in x 1150-1550, y 250-450 (half scale) found all 8 chests (scores 0.85-0.98, each ~2 s), and nothing else above 0.68 (best non-chest: "SHIELD CRACKED X2" at 0.64). Cut-off 0.8; a new chest = a hit after no hit for a while. No rare or sprite chest in this recording, so their labels are still unknown.
- **Death (checked):** big yellow "ELIMINATED BY <NAME>" at the top centre, then "SPECTATING <TEAMMATE>" and, in team modes, "REBOOT CARD AUTO-COLLECTS IN 117s". Team modes can bring you back (the user was rebooted and died again at 10:34), so time alive = time on the island minus time spent down/spectating, and placement is only final at the end screen. The first recording stops at the second death, so the end screen (placement) still needs footage.
- **Map:** Crossbones Isle. Named places: Arlong Park, Busy Bay, Cursed Cavern, Lantern Landing, Lil' Uzi's Stronghold (was Fortune's Fort), Loguetown, Loot Lagoon, Plunder Port, Rubber Resort, The $.$. Rocky, The Chest, Windmill Village.
- **Code (F1, 2026-11-10):** `games/fortnite/` (manifest, `overlay.tsx` card, `FortniteHub.tsx` with Matches / Screen check / Options, `chestLabel.json` = the CHEST template averaged from 12 real crops), `shared/fortniteLog.ts` (log parser), `shared/fortniteVision.ts` (chest area, grey shape match, `ChestCounter`), `shared/fortnite.ts` (types, settings defaults), `electron/fortnite/tracker.ts` (follows the log while Fortnite runs, catches up on the last 16 MB at start, saves played matches to `userData/fortnite/matches.json`), `electron/fortnite/screenReader.ts` (4 reads/s during a match while Fortnite is in front; recorder off by default: one JPEG per 10 s, cap 600, plus chest-area PNGs, in `userData/fortnite/shots`). Settings group `fortnite` (screenReader on, recorder off, cardOpacity 0.6, cardScale 1, a switch per card part). Run over the first recording, the app's own reader code counted 8 of 8 chests.
- **Live eliminations (user, 2026-11-10):** read in real time from the number next to the skull (top right) and sent live to the squad mate joined by code (F5). Reader (`readHud` in `shared/fortniteVision.ts`, templates in `games/fortnite/hudGlyphs.json`): finds the skull icon (must be the top row, and clearly more skull than person), then matches the white digits left of it against 0-9 shapes learned from the players-left row of the first recording (96-1,082 examples per digit). A digit must beat the runner-up by 0.05 or the read is skipped (a 0 read as 9 over bright grass otherwise). The count settles after two equal reads and only rises within a match. Whole-recording test: elims 0, then 1 at 10:07 (the user's elimination at ~10:04); players left followed the real count (80 → 16) with one brief 41/42 flicker. The skull row hides while you're down or spectating, so the count pauses then.
- **Time alive (F1):** counted from the screen: alive = your skull row shows; down = it's gone and the players-left icon is the top row; neither (map, menu) keeps the last state. Counted from the bus on, also while tabbed out. On the first recording it gave alive 0:00-5:14, down 5:14-8:48 (spectating, then rebooted), alive 8:48-10:33, down after: right on every change. Without screen reads a match falls back to bus-to-leaving.
- **Minimap feasibility test (F1 → F3), result:** season map = `https://fortnite-api.com/images/map.png` (2048x2048, public, no key; `/v1/map` also gives place-name positions), kept in `research_notes/fortnite/map/`. The minimap (x 1636-1888, y 32-284 at 1080p) is **north-up** and shows ~**240 px of the 2048 map** (one zoom on foot; it's different on the bus/skydiving: frames before landing didn't match). Brightness-normalised grey matching at 1/4 scale, whole-map search, 52 frames: **35 of 38 in-match frames right (92%)**, and **10 of 10 in the storm** (incl. a half-pink storm-edge view), checked by eye against the map (coastlines and roads line up). The 3 misses were all a covered minimap (an "Eliminated saved" popup, the menu, the end) and show as a jump across the map, so searching near the last position (you can't teleport) and a score floor (~0.45) reject them. Edge-only ("shape") matching scored worse on this art (0.31 vs 0.58 on the same frame), so normalised grey is the main matcher; the storm-tinted map copy wasn't needed in this test. Not tested yet: open water far from land, vehicles, the zoom on the bus. Speed: ~1-2 s per whole-map search in JS; the local search during play is far cheaper. **Verdict: feasible.** The user moved the live dots (yours + teammates' from your minimap) into F2 (2026-11-10); F3 keeps paths, pins, drop stats, heat map and the full-map accuracy check.
- **Squad link (user, 2026-11-10):** you and a friend see each other's **inventory, chests + eliminations, and map position** (dot + path), each read by the friend's own ShotCaller from their own screen and sent to you. Nothing touches the game. Linking: **both** — a join code first ("Start squad" gives a short code like K7F-2QX, the other types it, lasts until you leave; no accounts), and later the friends list (Phase 9, needs accounts). Needs a small online relay between the two apps; which service (e.g. Firebase, a Cloudflare Worker) is decided in that phase. Match history is not shared.
- **Chest kinds (second recording, 2026-11-10):** the user wants rare chests counted on their own (Q6). Fortnite **merges chests opened close together into one popup that grows in place**: "+900 XP / RARE CHEST" -> "+1,800 XP / RARE CHEST X2" -> a "SPRITE CHEST" line added under it ("+2,700"). Lines are right-aligned, so RARE / SPRITE sit at fixed spots left of the CHEST word and "X2" right of it (`games/fortnite/chestWords.json`). Each line is read on its own: +1 when it first shows, +1 each time its "Xn" settles on a new picture (shift-tolerant compare). "X2" lines score only ~0.76 on CHEST, so a CHEST at 0.68+ counts when RARE/SPRITE/X backs it. Other lines ("WEAKPOINT STREAK") stack above a plain CHEST line. Result: second recording 13 chest + 4 rare + 1 sprite = 18, all right (the old one-label counter got 16; the live run saved 17); first recording still 8/8. Kinds saved per match (`chestKinds`), older matches have only the total.
- **+1 chest key (user, 2026-11-10):** chests you break open show no XP popup, so a rebindable hotkey `fnChest` (default Alt+C, Settings -> Hotkeys) adds a chest of kind `manual` to the match in progress.
- **Placement (2026-11-10):** "YOU PLACED #7" shows top centre on the death screen and the match recap. In **solo**, the players-left number read just before you went down equals your place (7 left -> #7, checked on the recording); a win ends on 1. Team modes rank teams, which the HUD doesn't show: placement stays empty there (a "#N" reader needs digit samples first).
- **Look (user, 2026-11-10): more Fortnite-themed.** Our own take, no logos/art: Impact (ships with Windows) in italic capitals for headings and numbers, sky-blue -> purple gradients, slanted stat tiles in rarity colours, yellow for the picked tab. Scoped to `.fn-theme` (the Fortnite game page) and `.fn-card`. The Fortnite page hides the achievement list (Fortnite has none).
- **Hide every overlay:** the existing show/hide overlay hotkey (Alt+S) does this; no second key.

### Phase F2 findings (2026-11-10)
- **Live dot (`shared/fortniteMap.ts`):** minimap span re-measured: **240 map px** (232/236/244/248 all scored lower). Matching = masked, brightness-normalised correlation on a **high-pass** grey picture (pixel minus its 12-px neighbourhood mean: kills the storm's pink tint, its soft edge and night shading) with the **place-name labels and route line masked out** (bright near-white pixels, grown 3 px for the black outline; a minimap that's mostly white is skipped). Whole map: 1/8 pyramid, best 30 separated peaks re-checked at 1/4, refined at 1/2 (~100-300 ms). Tracking: 1/4 within 24 + 40 px/s of the last spot, refined at 1/2 (~10 ms). `DotTracker`: near fix counts at 0.30; when lost >4 s, a whole-map fix needs score 0.40, a 0.05 margin over any far spot, and the same spot twice in a row. Result over the second recording at 1 read/s: **92% sure, no wrong jumps during play** (was 80% with plain grey); first recording 92% sure. Covered minimap ('Elimination saved' popup), death and end screens read as not sure. Gemini's review (user, 2026-11-10) suggested gradient-orientation matching, white-label masking (done), peak-to-sidelobe confidence, multi-scale for the bus/skydive, WASM SIMD, HSV teammate arrows; the rest is parked for F3 if accuracy needs it.
- **Season map (`electron/fortnite/seasonMap.ts`):** `map.png` (plain, matched) and `map_en.png` (place names drawn by the service, shown) from fortnite-api.com, no key. Saved in `userData/fortnite/map/<last-modified date>-<size>/`; checked at most every 6 h; a new id = new season, older folders stay for archived pins. `/v1/map` POI world coordinates aren't used (no published world-to-pixel transform; the names image covers it).
- **Routes (`electron/fortnite/liveMap.ts`):** about 1 point/s while sure, saved per match in `userData/fortnite/routes/<match id>.json` with chest pins (by kind), landing (first sure spot after the bus) and death (last spot when you go down); `index.json` keeps landing/death/placement per match and map id for drop stats. Old maps' entries are filtered out (archived).
- **Teammates:** strongly coloured arrow-sized blobs in yellow/green/blue on the minimap, team modes only (pink/purple skipped: storm). **Not checked on a real team match yet.**
- **Second monitor (`electron/fortnite/monitorWindow.ts`, `src/fnmonitor/`):** frameless, fills the chosen screen's work area (default: the first non-main screen; none with a single screen), opens without taking focus when Fortnite starts, closes when it stops; 'Open map window' opens it anyway. Map left (follows your dot in a match, whole map with last route + drops in the lobby), panels right: recap (lobby), session, chests + goal, inventory placeholder.
- **Online (`electron/fortnite/online.ts`):** the key is stored encrypted with Electron safeStorage (Windows DPAPI) in `userData/fortnite/key.bin`, never in settings, logs or the renderer. Stats: `/v2/stats/br/v2?name=&timeWindow=season|lifetime` (all inputs; no Builds/Zero Build split). Shop: `/v2/shop` (public), checked every 30 min; wishlist from `/v2/cosmetics/br/search/all` and the shop; one Windows notification per shop day. CSP allows images from fortnite-api.com.
- **Grid:** A-J left to right, 1-10 top to bottom over the whole 2048 picture. Not yet compared with the in-game map grid.

### Phase F3 findings (2026-11-11)
- **Full map (M) screen:** flat navy top bar + yellow line under the MAP tab. Laid out by screen width (16:10 = same spots, more height; bottom buttons stay at the bottom). Default view at 1080: map drawn 0.590 px per map px, centred x 960, y ~47% down; 0.660 at 1200 high.
- **Your arrow on M:** a white chevron (about 140 px at 1080p) that turns with you; a lime ring shows round it only some of the time. Found by shape at any turn. The **mouse pointer** is a white pin with a dark hole (user) and is ignored. Teammates: arrows in their squad colour with a black outline; markers: pins in the placer's colour.
- **Squad colours** come from the diamond before each name in the HUD list (your row is last, no portrait). On the first recording: blue, purple, yellow, you pink.
- **Scale:** 1 map px = 1.46 m (fit of 12 places from /v1/map world positions to the labels on M, all within 1 px).
- **User (2026-11-11):** ShotCaller's map over Fortnite's M map with the same info as the squad-link map and a switch per layer; read what M shows to keep info right; real squad colours; one whole-screen copy per look (must not be slower: measured 14 ms vs 28 ms); no separate 16:10 mode; show squad-link friends' chests and the M panel stats (kills per member, players left, storm) for everyone.

- **Bus (corrected 2026-11-11):** the minimap is NOT zoomed out on the bus; it matches at the usual 240 span (0.6-0.9, clear winner) and shows the ship in the middle. On M the bus is a big ship icon and the arrow reader picked parts of its white outline (75-130 px off, jumping). Rule: a fresh minimap match ≥ 0.6 wins over an M arrow more than 40 px away. Multi-scale search not needed.
- **Markers on the minimap:** your own marker = white teardrop pin with a diamond in your colour; a teammate's = solid pin in their colour (~20x30 px at 252) with a dark hole. Off-screen markers stick to the minimap edge (~96 px out, turned toward the spot): only pins within ±88 px are taken. Tip = the spot. Friend's video: purple read at 899,1041 vs M 898,1035; blue 845,787 vs 845,780; no false pins in the whole video. Each player has one marker: newest per colour wins; a kept marker in view but missing 3 looks in a row is dropped. M also reads your own marker now.
- **M left panel (`readMapPanel`):** right column x 240-432 (1920 units), from y 250, same spot on 16:9 and 16:10. Values right-aligned: storm timer (has ':'), players left ("80 (20)" = teams in brackets), then one eliminations line per squad member. Digits matched to 10 pictures built from the recordings (0:35→0:19, 1:28→1:24, 80 (20), 47 (13)→46 (12), kills 0/4/4/0 all read right). Names are cut out as pictures (portrait + name), never read as text.
- **User (2026-11-11):** TRN's squad strip is the model for the S3 hotbar (see S-E3e); markers players place must show on ShotCaller's big map.

### Setup overhaul — design interview (started 2026-11-11)
Goal: a friendlier first-run and default experience that works on laptops and PC monitors, with screen sizes detected automatically. Planning only in this chat; built in a later phase.
- S-Q1: **B** — a short app-wide welcome once, then each game's own setup the first time you open or play that game.
- S-Q2: **A** — the Fortnite setup appears the first time you open the Fortnite page (not when the game launches).
- S-Q3: **A** — step-by-step pages: one question per page, Next / Back, progress dots.
- S-Q4: **A + calibration (user)** — apply what it detects and show what it found ("Laptop, 1920x1200, 125%") with a Change link. Plus: show a frame of the game with the chest popup on screen and a box over the area it reads, which you can move if it's in the wrong place (details in batch 2).
- S-Q5: **A** — existing users (you, your friend) get the new setup once after updating; choices already made are the starting picks.
- S-Q6: **B** — the full Fortnite setup (5-6 steps: screens, layout, what the card shows, Epic name, hotkeys, test check), with Skip on each step.
- S-Q4a: **C** — the "where it reads" step shows a drawn sketch of the HUD (no real Fortnite frames ship with the app) until a screenshot from your own game exists; "Use my screen" swaps it in. The screenshot stays on your PC.
- S-Q4b: **B** — every reading area has a movable box: chest popup, minimap, eliminations, hotbar. "Reset boxes" puts them back to the detected spots.
- S-Q4c: **A** — move only; each box's size follows the screen automatically (the readers expect a set size).
- S-Q4d: **A** — while Fortnite runs, each box turns green when it sees its thing (minimap right away, chest popup when you open one).
- S-Q7: **B** — on a laptop the card starts at the left middle (emptiest part of the default HUD). S-Q7b: **A** — on a PC monitor it keeps today's spot (right, under the minimap). Always draggable.
- S-Q8: **A** — card size is automatic from the screen size (smaller on laptops, bigger on 1440p/4K) and never runs into the hotbar.
- S-Q9: **A** — mid-match the card shrinks to one line while you're alive ("4 chests · 2 elims"); full in the lobby, on the bus and after you die.
- S-Q10: **A (user)** — with one screen, the live map goes to a phone or tablet: a QR code on the map screen, tied to squad link: the squad link host (whoever pressed Start for the join code) hosts the map and shows its QR code on the map screen; scanning it opens the party's live map. S-Q10c answered by this: the leader is the squad link host (details in batch 3).
- S-Q11: **C** — keep the dropdown list for choosing the map's screen.
- S-Q10a: **B** — the phone map works anywhere: the host's ShotCaller sends the party's map data through the squad link relay, and the phone opens a web page (hosted free, e.g. GitHub Pages) that reads it. Works on any Wi-Fi or mobile data.
- S-Q10b: **A** — the phone shows the map with everyone's dots, big and simple, pinch to zoom.
- S-Q10c: **A** — the leader is whoever pressed Start for the squad code.
- S-Q10d: **A** — playing alone, your own PC acts as the host, so the QR works just for you.
- S-Q12: **B** — a manual Low power switch only (slower reads); no automatic battery switching.
- S-Q13: **A + engine (user)** — no manual resolution guessing: build an auto-locate engine that finds where each HUD part is on any screen (minimap, eliminations, chest popup area, hotbar) so it works on every screen size. The current resolution picker stays as an override under Advanced.
- S-Q13b (user): the engine also finds the individual inventory slots, so the shared hotbar picture shows only the slots, not the whole bottom-right area ("looks sloppy").
- S-Q14: **A** — Fortnite settings split into Simple and Advanced (resolution override, read rates, recorder under Advanced).
- S-Q15: **A** — when something isn't being read, a plain tip on the card ("Can't see your minimap. Fix it") opens the where-it-reads step.
- S-Q16: **C** — no separate test step at the end of setup. (The live green boxes in the where-it-reads step, S-Q4d, still show it working.)
- Fortnite has a HUD Scale setting and a HUD Layout Tool (players can move HUD parts), so fixed boxes can't be trusted; the engine handles both.
- S-E1: **A** — the engine looks at the start of each match and again whenever a reader stops seeing its thing.
- S-E2: **A** — it finds HUD parts at any size and anywhere on screen (HUD Scale + HUD Layout Tool).
- S-E3: **B** — the shared hotbar is rebuilt: each slot cut out and set in ShotCaller's own neat row with matching rarity borders (details below).
- S-E4: **A** — a box you moved by hand wins over the engine until you press Reset boxes.
- S-E3a: **A** — the row holds slots 1-5 only (no pickaxe, no Q item).
- S-E3b: **A** — each tile shows the item picture cut from the screen; ammo/count numbers and item names come later with F4's hotbar reading.
- S-E3c: **A** — the slot being held is raised.
- S-E3d: **A** — empty slots show as faint empty tiles, so the row is always five long.
- S-E3e (user): the layout should be closer to Tracker Network's Fortnite teammate-loadout overlay (ideas only, not their look or branding). TRN's page can't be read automatically, so the exact layout is open: settle it from a screenshot or description from the user at the start of the build phase. Shown on: the overlay card (friends only), map window, phone map and lobby squad panel unless the user says otherwise.
- S-E3e layout settled from the user's TRN screenshot (2026-11-11): a compact see-through strip, top-right header with "Show/Hide" + its hotkey. One row per squad member, name on the left (cut short with "..."), in the game's squad order. Your row (and linked friends') shows 5 square slot tiles on the right; a teammate without the app shows a faint "Invite friend to app" hint + hotkey instead of tiles. Our version: same structure, ShotCaller's own look (navy, rarity borders, held slot raised, squad-colour diamond before each name), no TRN branding. Placement (user, 2026-11-11): starts on top of the minimap (see-through), Alt-drag to move (position saved), shown/hidden with **Ctrl+B** (rebindable). Markers players place must show on ShotCaller's big map: read from M (done) and from the minimap too (F3).

### Games tab (launcher) — design interview (started 2026-11-12)
The user asked for a launcher tab that adds games from Steam, Epic and the other big stores on its own, with a More tab for the Anker launcher. Batch 1 (L-Q1-42), answers:
- L-Q1 Name: **Games**. L-Q2: the current Library page **becomes** the Games tab (one list of games, not two). L-Q3: sits **after Home** in the sidebar. L-Q4: after the splash Play, the app still opens on **Home**.
- L-Q5 Main stores found on their own: **Steam, Epic Games, Xbox / Microsoft Store**. L-Q6: every other store (GOG, EA, Ubisoft, Battle.net, Riot, Rockstar, Amazon, itch.io) goes in the **More tab**.
- L-Q7: installed games, plus owned-but-not-installed shown faded. L-Q8: read the stores' own files on this PC, no sign-in; optional sign-in later for full owned lists. L-Q9: scan on app start, when a store's files change, plus a Refresh button. L-Q10: a store list in settings shows Found / Not found with a Pick folder button.
- L-Q11: a game owned on two stores is **one card**; Play uses the installed copy, an arrow next to Play picks the store. L-Q12: non-games (Wallpaper Engine, SDKs, redistributables, benchmarks) go in a **Tools section**.
- L-Q13 More tab: Anker Games launcher, emulators, the smaller stores, games added by hand, and "all games grouped together, with a layout like GOG Galaxy" (user's words; follow-ups in batch 2). L-Q14: everything also shows in the main grid; the More tab is where those sources are set up.
- L-Q15 Anker: list, play, achievements (already working) plus an Open in Anker button. L-Q16: Play on an Anker game starts its exe directly. L-Q17: add by hand by browsing for an exe or dragging in an exe or shortcut.
- L-Q18 Layout: **cover grid**. L-Q19 Art: each store's own art, then SteamGridDB, then a clean title card. L-Q20 Card shows: store icon, achievement ring, playtime, install size. L-Q21: clicking a card opens a game page (big banner, Play, achievements, playtime, store, folder).
- L-Q22: Play starts the game **through its store** (keeps cloud saves, updates, anti-cheat). L-Q23: ShotCaller minimises to the tray after Play. L-Q24: games with a module (Fortnite) turn the overlay on at Play. L-Q25: owned-not-installed games get an Install button that hands off to the store's installer. L-Q26: Uninstall in a "..." menu with a confirm, handed to the store. L-Q27: small Update badge where the store makes that readable.
- L-Q28 Sort: recently played. L-Q29 Filters: by store, installed, has achievements, has ShotCaller overlay, genre. L-Q30: favourites row plus your own collections. L-Q31 Top rows: Continue playing, Favourites, Recently added. L-Q32: search bar in the tab plus Ctrl+K quick-launch anywhere in the app. L-Q33: right-click Hide, with a Hidden list to bring games back.
- L-Q34 Playtime: the store's number where it has one, ShotCaller's own tracking otherwise. L-Q35: track playtime from game detection even when started outside ShotCaller. L-Q36: per-game launch options in the game page's settings. L-Q37: tray menu lists the last 5 games. L-Q38 (desktop shortcuts): not answered, asked again in batch 2. L-Q39: controller support later, not in the first version. L-Q40 Extras: Epic free games of the week.
- L-Q41: built **now, as Phase L, before Phase F4**. L-Q42: two parts: L1 stores + grid + Play, L2 More tab + Anker + extras. Each ends in a beta the user OKs before it's published.
- Notes: the user asked for more questions (batch 2).

Batch 2 (L-Q43-67, plus L-Q38 again), answers:
- L-Q43 **GOG Galaxy-style layout for the whole Games tab**: a list on the left (All games, Installed, each store, your collections), cover grid on the right. L-Q44 Left list order: main stores, then a **More** heading (Anker, emulators, other stores), then **Tools**, then **Hidden**. L-Q45: game count next to each entry. L-Q46: the left list folds down to icons.
- L-Q38: desktop shortcuts, made from the game page's "..." menu.
- L-Q47 Steam owned-not-installed: read the public Steam profile when it's public; otherwise installed + played games only. L-Q48 Epic and Xbox: installed only for now; their sign-in later as an optional extra. L-Q49 Game Pass: installed Game Pass games only, with a Game Pass tag.
- L-Q50 Achievement rings for Epic/Xbox games: use the Steam version's list when the same game is on Steam; otherwise no ring. L-Q51 SteamGridDB: optional free key in settings, stored privately like the Fortnite key; a title card when there's no key. L-Q52 Genres: from Steam's store info (matched by name for other stores), editable per game. L-Q53 Install size: the store's number, else measured in the background.
- L-Q54 Card size: slider in the top bar. L-Q55 Hover: the card lifts a little and shows a Play button. L-Q56 Game page: the game's wide art across the top, fading into the app colour. L-Q57 Collections: right-click > Add to collection. L-Q58 Recently added = last 14 days. L-Q59 New game installed: small in-app toast "Added [game]".
- L-Q60 Epic free games: small card on Home plus a row in the More section. L-Q61 Home gets a Continue playing strip (last 4 games with Play). L-Q62 Ctrl+K finds games and app pages/settings.
- L-Q63 Emulators: **RPCS3 (PS3), Ryujinx (Switch), mGBA (Game Boy Advance)**. L-Q64: you point at your game folders once; each file becomes a card that opens in the right emulator.
- L-Q65: the achievement corner card and unlock popups work for every game started from the Games tab, not only module games. L-Q66 Look: the same ShotCaller style as the rest of the app (dark, unlock-card look). L-Q67 First open: short scan screen ("Found 84 games in 3 stores") with the store list and Pick folder for missing stores.

## Technical notes
- **Steam data (decided in Phase 5): local-first, no API key, no proxy.** For now ShotCaller is for the user's own PC. Achievement lists come from Steam's local schema cache (`appcache/stats/UserGameStatsSchema_<appid>.bin`), unlocks + unlock times from the local stats cache (`UserGameStats_<accountid>_<appid>.bin`, binary KeyValues), playtime from `userdata/<accountid>/config/localconfig.vdf`, the SteamID from `loginusers.vdf`, global rarity from the keyless `GetGlobalAchievementPercentagesForApp` endpoint, and achievement lists for games Steam hasn't cached from Steam's public achievement page. A Steam Web API key still never ships in the app; a proxy (Cloudflare Worker recommended) only becomes necessary if public users need data Steam doesn't keep locally (e.g. owned-but-never-played games).
- Real-time unlocks: watch the Steam client's local stats cache (and local emulator achievement files) for changes and diff the unlocked set (no API round trip needed).
- Epic has no public achievement API; Xbox possible via third-party (OpenXBL). Treat both as "investigate" in a late phase.
- Overlay works over borderless/windowed games only (no injection). Document that exclusive fullscreen hides it.
- Game support is per-game modules (`games/<id>/`): Skillshot City is the first; generic games get the achievement hub only.

## Open questions
- Logo chosen (see Q19); Phase 11 may still polish the artwork.
- Skillshot City skill list/icons: extracted from the game's own files (see Phase 6 decisions).
