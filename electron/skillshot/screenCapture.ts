import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * Copies pixels off the screen with ordinary Windows drawing calls, the same as any screenshot tool. It
 * never opens the game's memory or touches its window: it only asks which window is in front and where it
 * is, and checks that window's program name. Windows only; elsewhere everything here returns null.
 */

export interface WindowArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

const SRCCOPY = 0x00cc0020;
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

interface Gdi {
  GetForegroundWindow(): unknown;
  GetWindowThreadProcessId(hwnd: unknown, pid: [number]): number;
  GetClientRect(hwnd: unknown, rect: Rect): boolean;
  ClientToScreen(hwnd: unknown, point: { x: number; y: number }): boolean;
  OpenProcess(access: number, inherit: boolean, pid: number): unknown;
  QueryFullProcessImageNameW(handle: unknown, flags: number, name: Uint16Array, size: [number]): boolean;
  CloseHandle(handle: unknown): boolean;
  GetDC(hwnd: unknown): unknown;
  ReleaseDC(hwnd: unknown, dc: unknown): number;
  CreateCompatibleDC(dc: unknown): unknown;
  DeleteDC(dc: unknown): boolean;
  CreateCompatibleBitmap(dc: unknown, w: number, h: number): unknown;
  SelectObject(dc: unknown, obj: unknown): unknown;
  DeleteObject(obj: unknown): boolean;
  BitBlt(dst: unknown, x: number, y: number, w: number, h: number, src: unknown, sx: number, sy: number, op: number): boolean;
  GetDIBits(dc: unknown, bmp: unknown, start: number, lines: number, bits: Uint8Array, info: unknown, usage: number): number;
}

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

let gdi: Gdi | null | undefined;

function load(): Gdi | null {
  if (gdi !== undefined) return gdi;
  gdi = null;
  if (process.platform !== 'win32') return null;
  try {
    const koffi = createRequire(import.meta.url)('koffi') as typeof import('koffi');
    const user32 = koffi.load('user32.dll');
    const gdi32 = koffi.load('gdi32.dll');
    const kernel32 = koffi.load('kernel32.dll');
    koffi.struct('SC_RECT', { left: 'int32_t', top: 'int32_t', right: 'int32_t', bottom: 'int32_t' });
    koffi.struct('SC_POINT', { x: 'int32_t', y: 'int32_t' });
    koffi.struct('SC_BITMAPINFOHEADER', {
      biSize: 'uint32_t',
      biWidth: 'int32_t',
      biHeight: 'int32_t',
      biPlanes: 'uint16_t',
      biBitCount: 'uint16_t',
      biCompression: 'uint32_t',
      biSizeImage: 'uint32_t',
      biXPelsPerMeter: 'int32_t',
      biYPelsPerMeter: 'int32_t',
      biClrUsed: 'uint32_t',
      biClrImportant: 'uint32_t',
    });
    gdi = {
      GetForegroundWindow: user32.func('void* __stdcall GetForegroundWindow()'),
      GetWindowThreadProcessId: user32.func('uint32_t __stdcall GetWindowThreadProcessId(void* hwnd, _Out_ uint32_t* pid)'),
      GetClientRect: user32.func('bool __stdcall GetClientRect(void* hwnd, _Out_ SC_RECT* rect)'),
      ClientToScreen: user32.func('bool __stdcall ClientToScreen(void* hwnd, _Inout_ SC_POINT* point)'),
      OpenProcess: kernel32.func('void* __stdcall OpenProcess(uint32_t access, bool inherit, uint32_t pid)'),
      QueryFullProcessImageNameW: kernel32.func('bool __stdcall QueryFullProcessImageNameW(void* handle, uint32_t flags, _Out_ uint16_t* name, _Inout_ uint32_t* size)'),
      CloseHandle: kernel32.func('bool __stdcall CloseHandle(void* handle)'),
      GetDC: user32.func('void* __stdcall GetDC(void* hwnd)'),
      ReleaseDC: user32.func('int __stdcall ReleaseDC(void* hwnd, void* dc)'),
      CreateCompatibleDC: gdi32.func('void* __stdcall CreateCompatibleDC(void* dc)'),
      DeleteDC: gdi32.func('bool __stdcall DeleteDC(void* dc)'),
      CreateCompatibleBitmap: gdi32.func('void* __stdcall CreateCompatibleBitmap(void* dc, int w, int h)'),
      SelectObject: gdi32.func('void* __stdcall SelectObject(void* dc, void* obj)'),
      DeleteObject: gdi32.func('bool __stdcall DeleteObject(void* obj)'),
      BitBlt: gdi32.func('bool __stdcall BitBlt(void* dst, int x, int y, int w, int h, void* src, int sx, int sy, uint32_t op)'),
      GetDIBits: gdi32.func('int __stdcall GetDIBits(void* dc, void* bmp, uint32_t start, uint32_t lines, _Out_ uint8_t* bits, SC_BITMAPINFOHEADER* info, uint32_t usage)'),
    };
  } catch (err) {
    console.warn('[screenCapture] native calls unavailable:', err);
  }
  return gdi;
}

function exeNameOf(api: Gdi, pid: number): string | null {
  const handle = api.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
  if (!handle) return null;
  try {
    const name = new Uint16Array(1024);
    const size: [number] = [name.length];
    if (!api.QueryFullProcessImageNameW(handle, 0, name, size)) return null;
    return path.win32.basename(String.fromCharCode(...name.subarray(0, size[0])));
  } finally {
    api.CloseHandle(handle);
  }
}

/** Where the front window's picture is on screen, if that window belongs to one of `exeNames`. */
export function foregroundGameArea(exeNames: string[]): WindowArea | null {
  const api = load();
  if (!api) return null;
  try {
    const hwnd = api.GetForegroundWindow();
    if (!hwnd) return null;
    const pid: [number] = [0];
    api.GetWindowThreadProcessId(hwnd, pid);
    const exe = pid[0] ? exeNameOf(api, pid[0]) : null;
    if (!exe || !exeNames.some((n) => n.toLowerCase() === exe.toLowerCase())) return null;
    const rect: Rect = { left: 0, top: 0, right: 0, bottom: 0 };
    if (!api.GetClientRect(hwnd, rect)) return null;
    const origin = { x: 0, y: 0 };
    if (!api.ClientToScreen(hwnd, origin)) return null;
    const width = rect.right - rect.left;
    const height = rect.bottom - rect.top;
    return width > 0 && height > 0 ? { x: origin.x, y: origin.y, width, height } : null;
  } catch {
    return null;
  }
}

/** Copies a screen area as top-down BGRA pixels (the 4th byte isn't meaningful). */
export function captureScreen(area: WindowArea, into?: Uint8Array): Uint8Array | null {
  const api = load();
  if (!api) return null;
  const screen = api.GetDC(null);
  if (!screen) return null;
  const mem = api.CreateCompatibleDC(screen);
  const bmp = api.CreateCompatibleBitmap(screen, area.width, area.height);
  const old = api.SelectObject(mem, bmp);
  try {
    if (!api.BitBlt(mem, 0, 0, area.width, area.height, screen, area.x, area.y, SRCCOPY)) return null;
    // Reuse the caller's buffer when it's the right size (whole-window copies, several times a second).
    const bits = into && into.length === area.width * area.height * 4 ? into : new Uint8Array(area.width * area.height * 4);
    const info = {
      biSize: 40,
      biWidth: area.width,
      biHeight: -area.height, // Negative = rows run top to bottom.
      biPlanes: 1,
      biBitCount: 32,
      biCompression: 0,
      biSizeImage: 0,
      biXPelsPerMeter: 0,
      biYPelsPerMeter: 0,
      biClrUsed: 0,
      biClrImportant: 0,
    };
    // The bitmap has to be out of the DC for GetDIBits.
    api.SelectObject(mem, old);
    return api.GetDIBits(mem, bmp, 0, area.height, bits, info, 0) === area.height ? bits : null;
  } catch {
    return null;
  } finally {
    api.DeleteObject(bmp);
    api.DeleteDC(mem);
    api.ReleaseDC(null, screen);
  }
}
