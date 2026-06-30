import { useEffect } from 'react';
import { encodeState } from '@/share/codec';
import { persistPayload } from '@/share/persistence';
import type { ShareState } from '@/share/types';

const AUTOSAVE_DELAY = 500; // ms of inactivity before writing to storage

// Debounced autosave of the workspace. The encoded payload is a stable string, so
// the effect only re-fires when the content actually changes.
export function useAutosave(state: ShareState): void {
  const payload = encodeState(state);
  useEffect(() => {
    const handle = window.setTimeout(() => persistPayload(payload), AUTOSAVE_DELAY);
    return () => window.clearTimeout(handle);
  }, [payload]);
}
