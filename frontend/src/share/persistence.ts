import { loadShareState, type ShareState } from './types';

// sessionStorage gives per-tab reload/restore continuity (isolated, no cross-tab
// clobbering). localStorage is a single most-recent-draft slot (last-write-wins)
// for recovering on a fresh visit. Stored as plain JSON: storage has no
// URL-safety or length constraint. Validated on read via loadShareState.
export const SESSION_KEY = 'typex:workspace';
export const LOCAL_KEY = 'typex:latest';

export function persistState(state: ShareState): void {
  const json = JSON.stringify(state);
  writeKey(sessionStorage, SESSION_KEY, json);
  writeKey(localStorage, LOCAL_KEY, json);
}

export function readPersistedState(): ShareState | null {
  return readKey(sessionStorage, SESSION_KEY) ?? readKey(localStorage, LOCAL_KEY);
}

function writeKey(store: Storage, key: string, value: string): void {
  try {
    store.setItem(key, value);
  } catch (err) {
    // Quota exceeded or storage disabled (private mode) - persistence is best-effort.
    console.warn('Failed to persist workspace:', err);
  }
}

function readKey(store: Storage, key: string): ShareState | null {
  try {
    const raw = store.getItem(key);
    return raw ? loadShareState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
