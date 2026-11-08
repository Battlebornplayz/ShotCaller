# ShotCaller

**A cross-game achievement hub and in-game overlay for PC gamers.**

ShotCaller tracks your achievements across games (Steam first), pops up real-time unlock cards, gives you
XP and a profile, and adds per-game overlay modules. The first game module is **Skillshot City**, with a
skill-pick advisor, build tools and a round tracker.

> 🚧 Early development. Current builds have the self-updating launcher, game detection (Steam library
> import, running-game watcher, add games by hand), a tray app and the overlay framework with global
> hotkeys. Features land phase by phase. See [`PROJECT_PLAN.md`](PROJECT_PLAN.md).

## The overlay

- Opens automatically when a supported game (Skillshot City) launches. ShotCaller starts with your
  computer and waits in the tray (both can be turned off in **Settings → Startup**).
- It's a separate always-on-top window, never injected into the game. It shows over **borderless** and
  **windowed** games; **exclusive fullscreen hides it**, so switch the game to borderless.
- Click-through by default, so it never steals your clicks. **Hold Alt** to interact with it or drag it
  by its header.
- Modes (**Settings → Overlay**): always-on corner overlay, hotkey popup, or a window on a second monitor.
- Default hotkeys, all rebindable: Alt+S show/hide, Alt+1 / Alt+2 pick skill, Alt+N next round,
  Alt+E end match, Alt+H hunt list. If another app already uses a combination (the NVIDIA overlay
  takes Alt+R, for example), Settings shows it as "In use by another app".

## Accounts

Sign in with **Google or email** (Profile, or Settings → Account). Your profile syncs to every PC you sign
in on, and you can link Google and email to the same account. ShotCaller only syncs profile data. There
are no usage analytics, and crash reports stay off unless you turn them on (Settings → Privacy). How the
cloud side works and how to set it up: [`docs/FIREBASE.md`](docs/FIREBASE.md).

## Install

1. Open the [latest release](https://github.com/Battlebornplayz/ShotCaller/releases/latest).
2. Download the file for your system:
   - **Windows:** `ShotCaller-Setup-<version>.exe`
   - **Linux:** `ShotCaller-Setup-<version>.AppImage` (mark it executable: `chmod +x ShotCaller-*.AppImage`)
3. Run it. After that, ShotCaller updates itself: when a newer version is out, the launcher shows an
   **Update to latest version** button.

### Windows SmartScreen warning

ShotCaller builds aren't code-signed yet, so Windows may show *"Windows protected your PC"* the first
time you run the installer. Click **More info → Run anyway**. The source and the build workflow that
produces every installer are public in this repo.

## Update channels

In **Settings → Update channel**:

- **Stable** (default): full releases only.
- **Beta**: also offers GitHub pre-releases, for early features with rough edges.

## Fair play

ShotCaller never reads or writes game memory and never injects into games. Achievement data comes from
legitimate sources only (official APIs and the Steam client's own local files). It never unlocks
achievements on Steam.

## Development

Requirements: Node.js 22+ and npm.

```bash
npm install
npm run dev        # run the app with hot reload
npm run typecheck  # TypeScript
npm run lint       # ESLint
npm run format     # Prettier
npm run dist       # build an installer locally into release/
```

Layout:

| Path | What's there |
| --- | --- |
| `electron/` | Main process: windows, IPC, settings, auto-updater, patch notes, Steam import, game detection, overlay, hotkeys, tray |
| `shared/` | Types and IPC channel names shared by main, preload and renderer |
| `src/` | React renderer: `splash/` (launcher) and `shell/` (main window) |
| `games/` | Game modules, one folder per game (`games/<id>/`), plus `panels.tsx` (overlay panels) |
| `resources/`, `build/` | App, tray and installer icons (regenerate with `node scripts/make-icons.cjs`) |
| `firestore.rules`, `docs/FIREBASE.md` | Cloud: Firestore security rules and the Firebase setup guide |
| `.github/workflows/` | CI checks and the tag-triggered release build |

The update check only runs in installed builds. `npm run dev` shows "Development build — updates are
disabled".

## Releasing

Releases are built by GitHub Actions when a version tag is pushed. The **annotated tag message** becomes
the release notes, which the launcher shows as patch notes.

```bash
git tag -a v0.0.2 -m "## What's new
- First thing
- Second thing"
git push origin v0.0.2
```

- `vX.Y.Z` publishes a stable release.
- `vX.Y.Z-beta.N` publishes a pre-release (beta channel only).
- The workflow sets the app version from the tag, then builds the Windows NSIS installer and the Linux
  AppImage and uploads both, with the update metadata, to the release.

## License

[MIT](LICENSE) © Battlebornplayz
