import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { persistPayload, readPersistedState, SESSION_KEY, LOCAL_KEY } from '@/share/persistence';
import { encodeState } from '@/share/codec';
import { stubStorage } from '@/test/storage';
import type { ShareState } from '@/share/types';

const stateA: ShareState = { v: 1, files: { 'a.py': 'x = 1\n' }, checkers: ['mypy-1.20.2'], py: 'py312' };
const stateB: ShareState = { v: 1, files: { 'b.py': 'y = 2\n' }, checkers: [], py: 'py311' };

beforeEach(stubStorage);
afterEach(() => vi.unstubAllGlobals());

describe('persistence', () => {
  it('round-trips a workspace through storage', () => {
    persistPayload(encodeState(stateA));
    expect(readPersistedState()).toEqual(stateA);
  });

  it('writes to both sessionStorage and localStorage', () => {
    persistPayload(encodeState(stateA));
    expect(sessionStorage.getItem(SESSION_KEY)).not.toBeNull();
    expect(localStorage.getItem(LOCAL_KEY)).not.toBeNull();
  });

  it('prefers sessionStorage (this tab) over the localStorage draft', () => {
    sessionStorage.setItem(SESSION_KEY, encodeState(stateA));
    localStorage.setItem(LOCAL_KEY, encodeState(stateB));
    expect(readPersistedState()).toEqual(stateA);
  });

  it('falls back to the localStorage draft when sessionStorage is empty', () => {
    localStorage.setItem(LOCAL_KEY, encodeState(stateB));
    expect(readPersistedState()).toEqual(stateB);
  });

  it('returns null when nothing is stored', () => {
    expect(readPersistedState()).toBeNull();
  });

  it('returns null for a corrupt stored payload', () => {
    sessionStorage.setItem(SESSION_KEY, 'not-a-valid-payload');
    expect(readPersistedState()).toBeNull();
  });
});
