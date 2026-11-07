// Types shared by the Electron main process, the preload script and the renderer.

export type Channel = 'stable' | 'beta';

export interface Settings {
  channel: Channel;
}

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'dev' }
  | { status: 'up-to-date'; version: string }
  | { status: 'available'; version: string }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; message: string };

export interface PatchNote {
  version: string;
  name: string;
  date: string;
  body: string;
  prerelease: boolean;
}

export interface AppInfo {
  version: string;
  packaged: boolean;
  platform: string;
}

export interface ShotCallerApi {
  getAppInfo(): Promise<AppInfo>;
  getSettings(): Promise<Settings>;
  setChannel(channel: Channel): Promise<Settings>;
  getUpdateState(): Promise<UpdateState>;
  checkForUpdates(): Promise<void>;
  downloadUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  getPatchNotes(): Promise<{ ok: true; notes: PatchNote[] } | { ok: false; error: string }>;
  onUpdateState(callback: (state: UpdateState) => void): () => void;
  enterApp(): Promise<void>;
  windowControl(action: 'minimize' | 'maximize' | 'close'): Promise<void>;
}

declare global {
  interface Window {
    shotcaller: ShotCallerApi;
  }
}
