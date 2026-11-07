// IPC channel names. Used by electron/ipc.ts (main) and electron/preload.ts.

export const IPC = {
  appInfo: 'app:info',
  appEnter: 'app:enter',
  windowControl: 'window:control',
  settingsGet: 'settings:get',
  settingsSetChannel: 'settings:set-channel',
  updaterGetState: 'updater:get-state',
  updaterCheck: 'updater:check',
  updaterDownload: 'updater:download',
  updaterInstall: 'updater:install',
  updaterState: 'updater:state',
  patchNotesGet: 'patch-notes:get',
} as const;
