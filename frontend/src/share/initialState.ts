import { useEffect, useState } from 'react';
import { decodeState } from './codec';
import { parseShareUrl } from './url';
import { readPersistedState } from './persistence';
import { fetchSharePayload } from './api';
import type { ShareState } from './types';

// Resolves the synchronous sources in precedence order:
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

export type InitialState =
  | { status: 'loading' }
  | { status: 'ready'; state: ShareState | null };

// Resolves initial state on mount. Every source is synchronous except a short link
// (/s/<id>), which needs a GET - so that one path goes through a loading gate while
// the rest resolve immediately.
export function useInitialState(): InitialState {
  const [result, setResult] = useState<InitialState>(() =>
    parseShareUrl(window.location)?.kind === 'short'
      ? { status: 'loading' }
      : { status: 'ready', state: readInitialState() }
  );

  useEffect(() => {
    const parsed = parseShareUrl(window.location);
    if (parsed?.kind !== 'short') return;
    let cancelled = false;
    void resolveShortLink(parsed.id).then((state) => {
      if (!cancelled) setResult({ status: 'ready', state });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return result;
}

// Fetches and decodes a short-link payload, then strips /s/<id> from the address
// bar so later reloads restore from per-tab sessionStorage rather than re-fetching
// the stale link (which would lose edits made after opening it). A missing or
// corrupt link falls back to persisted state, matching the full-link path.
export async function resolveShortLink(id: string): Promise<ShareState | null> {
  const payload = await fetchSharePayload(id);
  const state = payload ? decodeState(payload) : null;
  clearShortPath();
  return state ?? readPersistedState();
}

function clearUrlFragment(): void {
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

function clearShortPath(): void {
  window.history.replaceState(null, '', '/' + window.location.search);
}
