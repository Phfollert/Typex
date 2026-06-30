// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseShareUrl, buildFullLink, buildShortLink, createShareLink } from '@/share/url';
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

describe('createShareLink', () => {
  const sample: ShareState = {
    v: 1,
    files: { 'main.py': 'x: int = 1\n', 'lib.py': 'def f(): ...\n' },
    checkers: ['mypy-1.20.2', 'pyright-1.1.409'],
    py: 'py312',
  };

  it('produces a link that parses and decodes back to the original state', () => {
    const parsed = parseShareUrl(new URL(createShareLink(sample)));
    expect(parsed?.kind).toBe('full');
    expect(decodeState((parsed as { payload: string }).payload)).toEqual(sample);
  });
});
