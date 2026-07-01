// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readInitialState, resolveShortLink } from '@/share/initialState';
import { encodeState } from '@/share/codec';
import { persistState } from '@/share/persistence';
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
    persistState(draftState);
    window.history.replaceState(null, '', '/#s=' + encodeState(linkState));

    expect(readInitialState()).toEqual(linkState);
    expect(window.location.hash).toBe('');
  });

  it('falls back to persisted state when there is no fragment', () => {
    persistState(draftState);
    expect(readInitialState()).toEqual(draftState);
  });

  it('returns null when nothing is available', () => {
    expect(readInitialState()).toBeNull();
  });

  it('strips a corrupt fragment and falls through to persisted state', () => {
    persistState(draftState);
    window.history.replaceState(null, '', '/#s=garbage');

    expect(readInitialState()).toEqual(draftState);
    expect(window.location.hash).toBe('');
  });
});

describe('resolveShortLink', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetches and decodes the stored payload, then strips /s/<id>', async () => {
    window.history.replaceState(null, '', '/s/Ab3xYz');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ payload: encodeState(linkState) }),
    }));

    expect(await resolveShortLink('Ab3xYz')).toEqual(linkState);
    expect(window.location.pathname).toBe('/');
  });

  it('falls back to persisted state when the link is missing', async () => {
    persistState(draftState);
    window.history.replaceState(null, '', '/s/missing');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    expect(await resolveShortLink('missing')).toEqual(draftState);
    expect(window.location.pathname).toBe('/');
  });

  it('falls back to persisted state when the payload is corrupt', async () => {
    persistState(draftState);
    window.history.replaceState(null, '', '/s/Ab3xYz');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ payload: 'garbage' }),
    }));

    expect(await resolveShortLink('Ab3xYz')).toEqual(draftState);
  });
});
