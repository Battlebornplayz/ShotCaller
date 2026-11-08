import { useEffect, useState } from 'react';
import type { AuthState, DetectionState, HotkeyStatus, Library, OverlayState, Settings } from '../../shared/types';

/** Initial fetch plus live updates from the main process. */
function useLive<T>(get: () => Promise<T>, subscribe: (cb: (v: T) => void) => () => void): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    let active = true;
    void get().then((v) => active && setValue(v));
    const unsubscribe = subscribe((v) => active && setValue(v));
    return () => {
      active = false;
      unsubscribe();
    };
    // get/subscribe are stable bridge functions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}

const api = () => window.shotcaller;

export const useSettings = (): Settings | null => useLive(() => api().getSettings(), (cb) => api().onSettings(cb));
export const useLibrary = (): Library | null => useLive(() => api().getLibrary(), (cb) => api().onLibrary(cb));
export const useDetection = (): DetectionState | null => useLive(() => api().getDetection(), (cb) => api().onDetection(cb));
export const useOverlayState = (): OverlayState | null => useLive(() => api().getOverlayState(), (cb) => api().onOverlayState(cb));
export const useHotkeyStatus = (): HotkeyStatus | null => useLive(() => api().getHotkeyStatus(), (cb) => api().onHotkeyStatus(cb));
export const useAuth = (): AuthState | null => useLive(() => api().getAuthState(), (cb) => api().onAuthState(cb));
