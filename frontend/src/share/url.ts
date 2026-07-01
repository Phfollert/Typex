// Parses and builds share URLs. Full links carry the payload in the fragment
// (#s=<payload>); short links use the /s/<id> path.

import { encodeState } from './codec';
import { postSharePayload } from './api';
import type { ShareState } from './types';

const FRAGMENT_KEY = 's';

export type ShareUrl =
  | { kind: 'full'; payload: string }
  | { kind: 'short'; id: string }
  | null;

export function parseShareUrl(location: Pick<Location, 'hash' | 'pathname'>): ShareUrl {
  const hash = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
  const params = new URLSearchParams(hash);
  const payload = params.get(FRAGMENT_KEY);
  if (payload) return { kind: 'full', payload };

  const match = location.pathname.match(/^\/s\/([A-Za-z0-9]+)$/);
  if (match) return { kind: 'short', id: match[1] };

  return null;
}

export function buildFullLink(origin: string, payload: string): string {
  return `${origin}/#${FRAGMENT_KEY}=${payload}`;
}

export function buildShortLink(origin: string, id: string): string {
  return `${origin}/s/${id}`;
}

// Full link: the whole payload rides in the fragment, no server round-trip.
export function createFullLink(state: ShareState): string {
  return buildFullLink(window.location.origin, encodeState(state));
}

// Short link: stores the payload server-side and returns a /s/<id> link, or null
// when the store is unavailable so the caller can surface the failure.
export async function createShortLink(state: ShareState): Promise<string | null> {
  const id = await postSharePayload(encodeState(state));
  return id ? buildShortLink(window.location.origin, id) : null;
}
