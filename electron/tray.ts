import { Menu, Tray, nativeImage } from 'electron';
import tray1x from '../resources/tray.png?asset';
import tray2x from '../resources/tray@2x.png?asset';

export interface TrayHandlers {
  openMain: () => void;
  togglePreview: () => void;
  quit: () => void;
}

export interface TrayInfo {
  playing: string | null;
  previewOn: boolean;
}

let tray: Tray | null = null;
let handlers: TrayHandlers | null = null;

function icon(): Electron.NativeImage {
  const img = nativeImage.createFromPath(tray1x);
  const hi = nativeImage.createFromPath(tray2x);
  if (!hi.isEmpty()) img.addRepresentation({ scaleFactor: 2, buffer: hi.toPNG() });
  return img;
}

export function createTray(h: TrayHandlers): void {
  handlers = h;
  tray = new Tray(icon());
  tray.on('click', () => h.openMain());
  tray.on('double-click', () => h.openMain());
  updateTray({ playing: null, previewOn: false });
}

export function updateTray(info: TrayInfo): void {
  if (!tray || !handlers) return;
  const h = handlers;
  tray.setToolTip(info.playing ? `ShotCaller — playing ${info.playing}` : 'ShotCaller');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: info.playing ? `Playing ${info.playing}` : 'No game running', enabled: false },
      { type: 'separator' },
      { label: 'Open ShotCaller', click: h.openMain },
      { label: 'Overlay preview', type: 'checkbox', checked: info.previewOn, click: h.togglePreview },
      { type: 'separator' },
      { label: 'Quit ShotCaller', click: h.quit },
    ]),
  );
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}
