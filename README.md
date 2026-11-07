# ShotCaller

**A cross-game achievement hub and in-game overlay for PC gamers.**

ShotCaller tracks your achievements across games (Steam first), pops up real-time unlock cards, gives you
XP and a profile, and adds per-game overlay modules. The first game module is **Skillshot City**, with a
skill-pick advisor, build tools and a round tracker.

> 🚧 Early development. The current builds are an app shell with a self-updating launcher. Features land
> phase by phase. See [`PROJECT_PLAN.md`](PROJECT_PLAN.md).

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
| `electron/` | Main process: windows, IPC, settings, auto-updater, patch notes |
| `shared/` | Types and IPC channel names shared by main, preload and renderer |
| `src/` | React renderer: `splash/` (launcher) and `shell/` (main window) |
| `games/` | Game modules, one folder per game (`games/<id>/`) |
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
