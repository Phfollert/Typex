import { describe, it, expect } from 'vitest';
import { loadShareState } from '@/share/types';

const valid = {
  v: 1,
  files: { 'main.py': 'x = 1' },
  panes: ['main.py'],
  checkers: ['mypy-1.20.2'],
  py: 'py312',
};

describe('loadShareState', () => {
  it('accepts a well-formed v1 payload', () => {
    expect(loadShareState(valid)).toEqual(valid);
  });

  it('rejects an unknown version', () => {
    expect(loadShareState({ ...valid, v: 99 })).toBeNull();
  });

  it('rejects a non-object', () => {
    expect(loadShareState(null)).toBeNull();
    expect(loadShareState('nope')).toBeNull();
  });

  it('rejects wrong field types', () => {
    expect(loadShareState({ ...valid, panes: 'main.py' })).toBeNull();
    expect(loadShareState({ ...valid, files: { 'main.py': 1 } })).toBeNull();
    expect(loadShareState({ ...valid, py: 312 })).toBeNull();
    expect(loadShareState({ ...valid, checkers: [1, 2] })).toBeNull();
  });
});
