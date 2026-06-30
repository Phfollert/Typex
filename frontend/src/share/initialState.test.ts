// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readInitialState } from '@/share/initialState';
import { encodeState } from '@/share/codec';
import { persistPayload } from '@/share/persistence';
import { stubStorage } from '@/test/storage';
import type { ShareState } from '@/share/types';

const linkState: ShareState = { v: 1, files: { 'main.py': 'x = 1\n' }, checkers: ['mypy-1.20.2'], py: 'py312' };
const draftState: ShareState = { v: 1, files: { 'draft.py': 'y = 2\n' }, checkers: [], py: 'py311' };

beforeEach(() => {
  stubStorage();
  window.history.replaceState(null, '', '/');
});
afterEach(() => vi.unstubAllGlobals());

describe('readInitialState', () => {
  it('prefers a URL fragment over persisted state, and strips the fragment', () => {
    localStorage.setItem('typex:latest', encodeState(draftState));
    window.history.replaceState(null, '', '/#s=' + encodeState(linkState));

    expect(readInitialState()).toEqual(linkState);
    expect(window.location.hash).toBe('');
  });

  it('falls back to persisted state when there is no fragment', () => {
    persistPayload(encodeState(draftState));
    expect(readInitialState()).toEqual(draftState);
  });

  it('returns null when nothing is available', () => {
    expect(readInitialState()).toBeNull();
  });

  it('strips a corrupt fragment and falls through to persisted state', () => {
    persistPayload(encodeState(draftState));
    window.history.replaceState(null, '', '/#s=garbage');

    expect(readInitialState()).toEqual(draftState);
    expect(window.location.hash).toBe('');
  });
});
