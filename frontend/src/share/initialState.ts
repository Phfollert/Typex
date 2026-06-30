import { decodeState } from './codec';
import { parseShareUrl } from './url';
import { readPersistedState } from './persistence';
import type { ShareState } from './types';

// Resolves initial workspace state on mount, in precedence order:
//   URL fragment (#s=) > sessionStorage (this tab) > localStorage (latest) > null
// A consumed fragment is stripped from the address bar so later reloads restore
// from per-tab sessionStorage - otherwise edits made after opening a link would be
// lost to the stale fragment, which outranks storage.
export function readInitialState(): ShareState | null {
  const parsed = parseShareUrl(window.location);
  if (parsed?.kind === 'full') {
    const state = decodeState(parsed.payload);
    clearUrlFragment();
    if (state) return state;
  }
  return readPersistedState();
}

function clearUrlFragment(): void {
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}
