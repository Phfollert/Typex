import { decodeState } from './codec';
import type { ShareState } from './types';

// sessionStorage gives per-tab reload/restore continuity (isolated, no cross-tab
// clobbering). localStorage is a single most-recent-draft slot (last-write-wins)
// for recovering on a fresh visit. Both hold the same encoded payload.
export const SESSION_KEY = 'typex:workspace';
export const LOCAL_KEY = 'typex:latest';

export function persistPayload(payload: string): void {
  writeKey(sessionStorage, SESSION_KEY, payload);
  writeKey(localStorage, LOCAL_KEY, payload);
}

export function readPersistedState(): ShareState | null {
  return readKey(sessionStorage, SESSION_KEY) ?? readKey(localStorage, LOCAL_KEY);
}

function writeKey(store: Storage, key: string, payload: string): void {
  try {
    store.setItem(key, payload);
  } catch (err) {
    // Quota exceeded or storage disabled (private mode) - persistence is best-effort.
    console.warn('Failed to persist workspace:', err);
  }
}

function readKey(store: Storage, key: string): ShareState | null {
  try {
    const payload = store.getItem(key);
    return payload ? decodeState(payload) : null;
  } catch {
    return null;
  }
}
