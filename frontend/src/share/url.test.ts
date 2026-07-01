// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseShareUrl, buildFullLink, buildShortLink, createFullLink, createShortLink } from '@/share/url';
import { decodeState } from '@/share/codec';
import type { ShareState } from '@/share/types';

describe('parseShareUrl', () => {
  it('reads a full-link payload from the fragment', () => {
    expect(parseShareUrl({ hash: '#s=1abc', pathname: '/' })).toEqual({ kind: 'full', payload: '1abc' });
  });

  it('reads a short-link id from the path', () => {
    expect(parseShareUrl({ hash: '', pathname: '/s/Ab3xYz' })).toEqual({ kind: 'short', id: 'Ab3xYz' });
  });

  it('prefers a fragment payload over a path id', () => {
    expect(parseShareUrl({ hash: '#s=1abc', pathname: '/s/Ab3xYz' })).toEqual({ kind: 'full', payload: '1abc' });
  });

  it('returns null when neither is present', () => {
    expect(parseShareUrl({ hash: '', pathname: '/' })).toBeNull();
  });

  it('ignores a malformed short-link path', () => {
    expect(parseShareUrl({ hash: '', pathname: '/s/has spaces' })).toBeNull();
  });
});

describe('link builders', () => {
  it('builds a full link with the fragment key', () => {
    expect(buildFullLink('https://typex.dev', '1abc')).toBe('https://typex.dev/#s=1abc');
  });

  it('builds a short link with the /s/ path', () => {
    expect(buildShortLink('https://typex.dev', 'Ab3xYz')).toBe('https://typex.dev/s/Ab3xYz');
  });
});

const sample: ShareState = {
  v: 1,
  files: { 'main.py': 'x: int = 1\n', 'lib.py': 'def f(): ...\n' },
  checkers: ['mypy-1.20.2', 'pyright-1.1.409'],
  py: 'py312',
};

describe('createFullLink', () => {
  it('produces a full link that parses and decodes back to the original state', () => {
    const parsed = parseShareUrl(new URL(createFullLink(sample)));
    expect(parsed?.kind).toBe('full');
    expect(decodeState((parsed as { payload: string }).payload)).toEqual(sample);
  });
});

describe('createShortLink', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('stores the payload and returns a short link', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'Ab3xYz', url: '/s/Ab3xYz' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const link = await createShortLink(sample);
    expect(parseShareUrl(new URL(link as string))).toEqual({ kind: 'short', id: 'Ab3xYz' });
    expect(fetchMock).toHaveBeenCalledWith('/api/share', expect.objectContaining({ method: 'POST' }));
  });

  it('returns null when the short-link store is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    expect(await createShortLink(sample)).toBeNull();
  });
});
