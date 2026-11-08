import { useEffect, useState } from 'react';
import type { SkillshotData, SkillshotLiveState } from '../../shared/skillshot';
import type { SkillCollection } from '../../shared/skillshotCollection';
import type { AuthState, DetectionState, HotkeyStatus, HubState, Library, OverlayState, Settings } from '../../shared/types';

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

export const useSkillshot = (): SkillshotLiveState | null => useLive(() => api().getSkillshot(), (cb) => api().onSkillshot(cb));
export const useSkillCollection = (): SkillCollection | null =>
  useLive(() => api().getSkillCollection(), (cb) => api().onSkillCollection(cb));
/** Skill data changes only when the game updates; fetched once per window. */
export const useSkillshotData = (): SkillshotData | null => useLive(() => api().getSkillshotData(), () => () => undefined);

export const useHub = (): HubState | null => useLive(() => api().getHub(), (cb) => api().onHub(cb));

/** Loads a value and reloads it whenever the hub's data changes (or `deps` change). */
export function useHubQuery<T>(load: () => Promise<T>, deps: unknown[]): { value: T | null; loading: boolean; reload: () => void } {
  const hub = useHub();
  const [tick, setTick] = useState(0);
  const sig = JSON.stringify([...deps, hub?.revision ?? -1, tick]);
  // The last result and the request it answered; loading = it answers an older request.
  const [result, setResult] = useState<{ sig: string | null; value: T | null }>({ sig: null, value: null });
  useEffect(() => {
    let active = true;
    void load().then((value) => active && setResult({ sig, value }));
    return () => {
      active = false;
    };
    // load is recreated each render; sig decides when to refetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  return { value: result.value, loading: result.sig !== sig, reload: () => setTick((t) => t + 1) };
}
