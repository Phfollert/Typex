import { decodeState } from './codec';
import { parseShareUrl } from './url';
import type { ShareState } from './types';

// Decodes a full share link from the URL fragment to seed the state hooks.
export function readInitialShareState(): ShareState | null {
  const parsed = parseShareUrl(window.location);
  if (parsed?.kind === 'full') return decodeState(parsed.payload);
  return null;
}
