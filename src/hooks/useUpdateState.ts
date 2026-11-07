import { useEffect, useState } from 'react';
import type { UpdateState } from '../../shared/types';

/** Live update state from the main process (checking, available, downloading, ...). */
export function useUpdateState(): UpdateState {
  const [state, setState] = useState<UpdateState>({ status: 'idle' });

  useEffect(() => {
    let active = true;
    void window.shotcaller.getUpdateState().then((s) => {
      if (active) setState(s);
    });
    const unsubscribe = window.shotcaller.onUpdateState((s) => {
      if (active) setState(s);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return state;
}
