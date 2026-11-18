import { randomBytes } from 'node:crypto';
import type { ModuleDoc } from '../../shared/modules';
import { createModulePreviewWindow } from '../windows';
import { getModuleStorage, listAssets, recordModuleErrors } from './store';

/**
 * Draws a module in an unseen window and hands back a picture, the page's text and any errors (M-Q17, B2-B4, B9).
 * The renderer asks for what to draw with its token and says when it's done.
 */

export type PreviewSize = 'small' | 'normal' | 'wide' | 'monitor' | 'home';

const SIZES: Record<PreviewSize, { width: number; height: number }> = {
  small: { width: 420, height: 700 },
  normal: { width: 900, height: 760 },
  wide: { width: 1360, height: 800 },
  monitor: { width: 1280, height: 720 },
  home: { width: 340, height: 360 },
};

export interface PreviewRequest {
  moduleId: string;
  doc: ModuleDoc;
  page: string | null;
  size: PreviewSize;
  pretendRunning: boolean;
  /** Draw it like the Home card or the second monitor instead of the page. */
  as: 'page' | 'home' | 'monitor';
}

export interface PreviewPayload extends PreviewRequest {
  storage: Record<string, unknown>;
  assets: string[];
}

export interface PreviewResult {
  ok: boolean;
  errors: string[];
  text: string;
  ms: number;
  png: Buffer | null;
  width: number;
  height: number;
}

const pending = new Map<string, { payload: PreviewPayload; done: (r: { text: string; errors: string[]; ms: number; height: number }) => void }>();

export function getPreviewPayload(token: string): PreviewPayload | null {
  return pending.get(token)?.payload ?? null;
}

export function previewDone(token: string, r: { text: string; errors: string[]; ms: number; height: number }): void {
  pending.get(token)?.done(r);
}

let queue: Promise<unknown> = Promise.resolve();

/** One preview at a time: each is a whole window. */
export function renderPreview(req: PreviewRequest, picture: boolean): Promise<PreviewResult> {
  const run = queue.then(() => doRender(req, picture));
  queue = run.catch(() => undefined);
  return run;
}

async function doRender(req: PreviewRequest, picture: boolean): Promise<PreviewResult> {
  const token = randomBytes(8).toString('hex');
  const size = SIZES[req.size] ?? SIZES.normal;
  const payload: PreviewPayload = { ...req, storage: getModuleStorage(req.moduleId), assets: listAssets(req.moduleId).map((a) => a.name) };
  const consoleErrors: string[] = [];
  const win = createModulePreviewWindow(size.width, size.height, token);
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error') consoleErrors.push(e.message.slice(0, 300));
  });
  try {
    const result = await new Promise<{ text: string; errors: string[]; ms: number; height: number }>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('The preview took too long (over 15 seconds).')), 15_000);
      pending.set(token, {
        payload,
        done: (r) => {
          clearTimeout(t);
          resolve(r);
        },
      });
      win.webContents.once('render-process-gone', () => reject(new Error('The preview window crashed.')));
    });
    let png: Buffer | null = null;
    let height = size.height;
    if (picture) {
      // Grow the window to fit the whole page (up to a limit), then wait a frame for it to redraw.
      height = Math.min(Math.max(size.height, Math.ceil(result.height)), 2400);
      if (height !== size.height) {
        win.setContentSize(size.width, height);
        await new Promise((r) => setTimeout(r, 350));
      } else await new Promise((r) => setTimeout(r, 150));
      const img = await win.webContents.capturePage();
      const scaled = img.getSize().width > 1100 ? img.resize({ width: 1100 }) : img;
      png = scaled.toPNG();
    }
    const errors = [...result.errors, ...consoleErrors.filter((m) => !/Electron Security Warning|DevTools/i.test(m))];
    if (errors.length) recordModuleErrors(req.moduleId, errors);
    return { ok: !errors.length, errors, text: result.text, ms: result.ms, png, width: size.width, height };
  } catch (e) {
    const msg = (e as Error).message;
    recordModuleErrors(req.moduleId, [msg]);
    return { ok: false, errors: [msg, ...consoleErrors], text: '', ms: 0, png: null, width: size.width, height: size.height };
  } finally {
    pending.delete(token);
    if (!win.isDestroyed()) win.destroy();
  }
}
