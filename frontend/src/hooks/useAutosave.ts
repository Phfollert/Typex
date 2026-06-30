import { useEffect } from 'react';
import { persistState } from '@/share/persistence';
import type { ShareState } from '@/share/types';

const AUTOSAVE_DELAY = 500; // ms of inactivity before writing to storage

// Debounced autosave of the workspace. Serialization happens inside the timeout,
// so a burst of edits pays the cost once (when typing pauses), not per keystroke.
export function useAutosave(state: ShareState): void {
  useEffect(() => {
    const handle = window.setTimeout(() => persistState(state), AUTOSAVE_DELAY);
    return () => window.clearTimeout(handle);
  }, [state]);
}
