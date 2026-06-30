import { deflate, inflate } from 'pako';
import { loadShareState, type ShareState } from './types';

// One-char prefix marking the payload *encoding* (deflate + base64url), separate
// from the schema `v` field. Bump this if the encoding itself ever changes.
const FORMAT_MARKER = '1';

// Stable key order so identical state always encodes to identical bytes.
function canonicalize(state: ShareState): string {
  return JSON.stringify({
    v: state.v,
    files: sortedRecord(state.files),
    panes: state.panes,
    checkers: state.checkers,
    py: state.py,
  });
}

function sortedRecord(record: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(record).sort()) out[key] = record[key];
  return out;
}

export function encodeState(state: ShareState): string {
  const json = canonicalize(state);
  const compressed = deflate(new TextEncoder().encode(json));
  return FORMAT_MARKER + bytesToBase64Url(compressed);
}

export function decodeState(payload: string): ShareState | null {
  if (payload[0] !== FORMAT_MARKER) return null;
  try {
    const bytes = base64UrlToBytes(payload.slice(1));
    const json = new TextDecoder().decode(inflate(bytes));
    return loadShareState(JSON.parse(json));
  } catch {
    return null;
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
