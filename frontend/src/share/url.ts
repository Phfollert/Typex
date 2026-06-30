// Parses and builds share URLs. Full links carry the payload in the fragment
// (#s=<payload>); short links use the /s/<id> path.

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
