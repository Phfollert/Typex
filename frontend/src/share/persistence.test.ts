import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { persistState, readPersistedState, SESSION_KEY, LOCAL_KEY } from '@/share/persistence';
import { stubStorage } from '@/test/storage';
import type { ShareState } from '@/share/types';

const stateA: ShareState = { v: 1, files: { 'a.py': 'x = 1\n' }, checkers: ['mypy-1.20.2'], py: 'py312' };
const stateB: ShareState = { v: 1, files: { 'b.py': 'y = 2\n' }, checkers: [], py: 'py311' };

beforeEach(stubStorage);
afterEach(() => vi.unstubAllGlobals());

describe('persistence', () => {
  it('round-trips a workspace through storage', () => {
    persistState(stateA);
    expect(readPersistedState()).toEqual(stateA);
  });

  it('stores plain JSON in both sessionStorage and localStorage', () => {
    persistState(stateA);
    expect(JSON.parse(sessionStorage.getItem(SESSION_KEY)!)).toEqual(stateA);
    expect(JSON.parse(localStorage.getItem(LOCAL_KEY)!)).toEqual(stateA);
  });

  it('prefers sessionStorage (this tab) over the localStorage draft', () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(stateA));
    localStorage.setItem(LOCAL_KEY, JSON.stringify(stateB));
    expect(readPersistedState()).toEqual(stateA);
  });

  it('falls back to the localStorage draft when sessionStorage is empty', () => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(stateB));
    expect(readPersistedState()).toEqual(stateB);
  });

  it('returns null when nothing is stored', () => {
    expect(readPersistedState()).toBeNull();
  });

  it('returns null for non-JSON', () => {
    sessionStorage.setItem(SESSION_KEY, 'not json');
    expect(readPersistedState()).toBeNull();
  });

  it('returns null for JSON that is not a valid workspace', () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ v: 99 }));
    expect(readPersistedState()).toBeNull();
  });
});
