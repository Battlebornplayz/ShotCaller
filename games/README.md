# Game modules

Each supported game lives in its own folder here: `games/<id>/index.ts`, exporting a `GameModule`
(see `types.ts`). The module is then listed in `games/index.ts`, which drives the game-icon rail
in the main window.

Later phases extend a module with detection (process and Steam library), overlay panels and
achievement sources. Games without a module still get the achievement hub through a generic
entry.
