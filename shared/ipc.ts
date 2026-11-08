// IPC channel names. Used by electron/ipc.ts (main) and electron/preload.ts.

export const IPC = {
  appInfo: 'app:info',
  appEnter: 'app:enter',
  appOpenMain: 'app:open-main',
  windowControl: 'window:control',

  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  settingsChanged: 'settings:changed',

  updaterGetState: 'updater:get-state',
  updaterCheck: 'updater:check',
  updaterDownload: 'updater:download',
  updaterInstall: 'updater:install',
  updaterState: 'updater:state',
  patchNotesGet: 'patch-notes:get',

  libraryGet: 'library:get',
  libraryImportSteam: 'library:import-steam',
  libraryAddManual: 'library:add-manual',
  librarySetPinned: 'library:set-pinned',
  libraryRemove: 'library:remove',
  libraryChanged: 'library:changed',

  detectionGet: 'detection:get',
  detectionChanged: 'detection:changed',

  overlayGetState: 'overlay:get-state',
  overlayState: 'overlay:state',
  overlayAction: 'overlay:action',
  overlaySetPreview: 'overlay:set-preview',
  overlayTrigger: 'overlay:trigger',
  overlayResize: 'overlay:resize',

  hotkeysGetStatus: 'hotkeys:get-status',
  hotkeysStatus: 'hotkeys:status',
  hotkeysSetCapture: 'hotkeys:set-capture',

  displaysGet: 'displays:get',

  authGetState: 'auth:get-state',
  authState: 'auth:state',
  authSignIn: 'auth:sign-in',
  authSignInEmail: 'auth:sign-in-email',
  authSignUpEmail: 'auth:sign-up-email',
  authSendReset: 'auth:send-reset',
  authSetPassword: 'auth:set-password',
  authCancel: 'auth:cancel',
  authDismissMessage: 'auth:dismiss-message',
  authSignOut: 'auth:sign-out',
  authLink: 'auth:link',
  authUnlink: 'auth:unlink',
  profileUpdate: 'profile:update',
  profileRefresh: 'profile:refresh',

  crashReport: 'crash:report',
} as const;
