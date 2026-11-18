import { BrowserWindow, ipcMain, screen } from 'electron';
import { IPC } from '../../shared/ipc';
import type { ModulePermissions } from '../../shared/modules';
import { sendAiChat } from '../ai/chat';
import { getDetectionState } from '../detection';
import { broadcast } from '../ipc';
import { getLibrary } from '../library';
import { getSettings, updateSettings } from '../settings';
import { createModuleMonitorWindow } from '../windows';
import { getPreviewPayload, previewDone } from './preview';
import {
  answerQuestion,
  applyProposal,
  backupAll,
  createFromTemplate,
  deleteModule,
  discardProposal,
  getAiLog,
  getModule,
  getModuleErrors,
  getModulesState,
  getModuleStorage,
  getVersion,
  initModules,
  installImport,
  listAssets,
  onModulesChange,
  onModuleStorageChange,
  pickImportFile,
  previewImport,
  reportModuleError,
  resetModuleStorage,
  restoreBackup,
  restoreVersion,
  setModuleEnabled,
  setModuleStorage,
  setPermissions,
  setSafeMode,
  shareCode,
  shareFile,
  undoLast,
} from './store';

/** Phase M1: the renderer's side of AI modules, plus the second-monitor window. */

const str = (v: unknown, n = 200) => (typeof v === 'string' ? v.slice(0, n) : '');
const win = (e: Electron.IpcMainInvokeEvent) => BrowserWindow.fromWebContents(e.sender);

export function registerModules(): void {
  initModules();
  onModulesChange((s) => {
    broadcast(IPC.modulesChanged, s);
    syncModuleMonitor();
  });
  onModuleStorageChange((id, storage) => broadcast(IPC.modulesStorageChanged, { id, storage }));

  ipcMain.handle(IPC.modulesGet, () => getModulesState());
  ipcMain.handle(IPC.modulesStorage, (_e, id) => getModuleStorage(str(id)));
  ipcMain.handle(IPC.modulesSetStorage, (_e, id, key, value) => setModuleStorage(str(id), str(key, 80), value));
  ipcMain.handle(IPC.modulesResetStorage, (_e, id) => resetModuleStorage(str(id)));
  ipcMain.handle(IPC.modulesApply, (_e, id) => applyProposal(str(id)));
  ipcMain.handle(IPC.modulesDiscard, (_e, id) => discardProposal(str(id)));
  ipcMain.handle(IPC.modulesSetEnabled, (_e, id, on) => setModuleEnabled(str(id), !!on));
  ipcMain.on(IPC.modulesReportError, (_e, id, error) => reportModuleError(str(id), str(error, 500)));
  ipcMain.handle(IPC.modulesVersion, (_e, id, v) => getVersion(str(id), Number(v)));
  ipcMain.handle(IPC.modulesRestore, (_e, id, v) => restoreVersion(str(id), Number(v)));
  ipcMain.handle(IPC.modulesUndo, (_e, id) => undoLast(str(id)));
  ipcMain.handle(IPC.modulesSetPermissions, (_e, id, perms: Partial<ModulePermissions>) => {
    const clean: Partial<ModulePermissions> = {};
    for (const k of ['internet', 'library', 'achievements'] as const) if (typeof perms?.[k] === 'boolean') clean[k] = perms[k];
    setPermissions(str(id), clean);
  });
  ipcMain.handle(IPC.modulesDelete, (_e, id) => deleteModule(str(id)));
  ipcMain.handle(IPC.modulesFromTemplate, (_e, t, gameKey) => {
    const g = typeof gameKey === 'string' ? getLibrary().games.find((x) => x.key === gameKey) : null;
    return createFromTemplate(str(t), g ? { key: g.key, name: g.name } : null);
  });
  ipcMain.handle(IPC.modulesSetSafeMode, (_e, on) => setSafeMode(!!on));
  ipcMain.handle(IPC.modulesShareCode, (_e, id, locked) => shareCode(str(id), !!locked));
  ipcMain.handle(IPC.modulesShareFile, (e, id, locked) => shareFile(str(id), !!locked, win(e)));
  ipcMain.handle(IPC.modulesImportPreview, async (e, text) => {
    const t = typeof text === 'string' ? text : await pickImportFile(win(e));
    return t === null ? null : previewImport(t.slice(0, 50_000_000));
  });
  ipcMain.handle(IPC.modulesImportInstall, (_e, token, asCopy) => installImport(str(token), !!asCopy));
  ipcMain.handle(IPC.modulesBackup, (e) => backupAll(win(e)));
  ipcMain.handle(IPC.modulesRestoreBackup, (e) => restoreBackup(win(e)));
  ipcMain.handle(IPC.modulesAiLog, () => getAiLog().slice(0, 200));
  ipcMain.handle(IPC.modulesErrors, (_e, id) => getModuleErrors(str(id)));
  ipcMain.handle(IPC.modulesAssets, (_e, id) => listAssets(str(id)));
  ipcMain.handle(IPC.modulesAnswer, (_e, id, answer) => answerQuestion(str(id), str(answer, 300)));
  ipcMain.handle(IPC.modulesAskAiFix, (_e, id) => askAiToFix(str(id)));
  ipcMain.handle(IPC.modulesPreviewData, (_e, token) => getPreviewPayload(str(token)));
  ipcMain.on(IPC.modulesPreviewDone, (_e, token, r) =>
    previewDone(str(token), {
      text: str(r?.text, 20_000),
      errors: Array.isArray(r?.errors) ? r.errors.slice(0, 10).map((x: unknown) => str(x, 400)) : [],
      ms: Number(r?.ms) || 0,
      height: Number(r?.height) || 0,
    }),
  );
}

/** "Ask AI to fix" on a broken module (M-Q18): opens the chat with the error. */
function askAiToFix(id: string): { ok: true } | { ok: false; error: string } {
  const m = getModule(id);
  if (!m) return { ok: false, error: 'No such module.' };
  const s = getSettings().mcp;
  if (!s.modules) return { ok: false, error: 'Turn on "Let AI make modules" in Settings → Ask AI first.' };
  if (!s.chat) updateSettings({ mcp: { chat: true } });
  const errors = getModuleErrors(m.doc.id).slice(0, 3).map((e) => e.error);
  const text = `My ShotCaller module "${m.doc.name}" (id ${m.doc.id}) is broken and was turned off. The error: ${m.broken?.error ?? errors[0] ?? 'unknown'}. Please find the cause with modules_read, modules_errors and modules_preview, fix it with modules_edit, check it, and tell me when the fix is ready to Apply.`;
  // The chat starts once its setting has gone through.
  setTimeout(() => void sendAiChat(text, 'Modules'), 300);
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// The second-monitor window (M-Q10): modules placed there, while their game runs.

let monitor: BrowserWindow | null = null;

function monitorModulesRunning(): boolean {
  const s = getModulesState();
  if (s.safeMode) return false;
  const running = getDetectionState().running;
  return s.modules.some(
    (m) =>
      m.enabled &&
      m.doc.places.includes('monitor') &&
      running.some((r) => (m.doc.game?.key && r.key === m.doc.game.key) || (m.doc.addOnFor && r.moduleId === m.doc.addOnFor)),
  );
}

export function syncModuleMonitor(): void {
  const want = monitorModulesRunning();
  if (!want) {
    if (monitor && !monitor.isDestroyed()) monitor.close();
    monitor = null;
    return;
  }
  if (monitor && !monitor.isDestroyed()) return;
  // Never on a single screen: it would cover the game.
  const primary = screen.getPrimaryDisplay().id;
  const display = screen.getAllDisplays().find((d) => d.id !== primary);
  if (!display) return;
  const a = display.workArea;
  const width = Math.min(520, a.width - 32);
  monitor = createModuleMonitorWindow({ x: a.x + 16, y: a.y + 16, width, height: Math.min(900, a.height - 32) });
  monitor.once('ready-to-show', () => monitor?.showInactive());
  monitor.on('closed', () => {
    monitor = null;
  });
}
