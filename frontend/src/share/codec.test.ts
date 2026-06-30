import { describe, it, expect } from 'vitest';
import { encodeState, decodeState } from '@/share/codec';
import type { ShareState } from '@/share/types';

const sample: ShareState = {
  v: 1,
  files: { 'main.py': 'x: int = 1\n', 'lib.py': 'def f(): ...\n' },
  panes: ['main.py', 'lib.py'],
  checkers: ['mypy-1.20.2', 'pyright-1.1.409'],
  py: 'py312',
};

describe('codec', () => {
  it('round-trips a workspace through encode/decode', () => {
    expect(decodeState(encodeState(sample))).toEqual(sample);
  });

  it('produces a URL-safe payload (no +, /, or = characters)', () => {
    expect(encodeState(sample)).not.toMatch(/[+/=]/);
  });

  it('is deterministic regardless of file insertion order', () => {
    const reordered: ShareState = {
      ...sample,
      files: { 'lib.py': sample.files['lib.py'], 'main.py': sample.files['main.py'] },
    };
    expect(encodeState(reordered)).toBe(encodeState(sample));
  });

  it('returns null for a payload with an unknown format marker', () => {
    const payload = encodeState(sample);
    expect(decodeState('9' + payload.slice(1))).toBeNull();
  });

  it('returns null for corrupt base64', () => {
    expect(decodeState('1!!!!not-base64!!!!')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(decodeState('')).toBeNull();
  });
});
