# Game modules

Each supported game lives in its own folder: `games/<id>/index.ts` exports a `GameModule` manifest
(see `types.ts`), and `games/index.ts` lists it.

A manifest is plain data, shared by the main process and the renderer:

- `id`, `name`, `initials`, `color`: identity and the game-rail icon.
- `steamAppId`: links it to the Steam library import and Steam's "running app" signal.
- `exeNames`: executable names that mean the game is running (for non-Steam launches).
- `overlayPanels`: panels the overlay draws, as `{ id, title }`.
- `autoOverlay`: open the overlay automatically when the game launches.

Panel components live in `games/panels.tsx`, registered as `"<moduleId>/<panelId>"`. They're kept out
of the manifests so the main process never imports React.

Games without a module (Steam imports, games added by hand) use `generic/`: they're detected and
get the achievement hub, and the overlay only opens for them when "Show the overlay for every game"
is on.

## How a game is detected as running

`electron/detection.ts` checks, every 3 seconds, in this order:

1. Steam's own `RunningAppID` matches the game's `steamAppId`.
2. A process with one of the `exeNames` (or the exact exe of a hand-added game) is running.
3. A process is running from the Steam game's install folder.

Only the process list and Steam's own files and registry values are read. Nothing touches the game.
