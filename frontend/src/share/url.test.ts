import { describe, it, expect } from 'vitest';
import { parseShareUrl, buildFullLink, buildShortLink } from '@/share/url';

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
