import { describe, it, expect, vi, afterEach } from 'vitest';
import { postSharePayload, fetchSharePayload } from '@/share/api';

afterEach(() => vi.unstubAllGlobals());

describe('postSharePayload', () => {
  it('posts the payload and returns the id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'Ab3xYz', url: '/s/Ab3xYz' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await postSharePayload('1abc')).toBe('Ab3xYz');
    expect(fetchMock).toHaveBeenCalledWith('/api/share', expect.objectContaining({
      method: 'POST',
      body: '1abc',
    }));
  });

  it('returns null on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    expect(await postSharePayload('1abc')).toBeNull();
  });

  it('returns null when the request throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await postSharePayload('1abc')).toBeNull();
  });
});

describe('fetchSharePayload', () => {
  it('returns the stored payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ payload: '1abc' }),
    }));
    expect(await fetchSharePayload('Ab3xYz')).toBe('1abc');
  });

  it('returns null on a 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect(await fetchSharePayload('missing')).toBeNull();
  });

  it('returns null when the request throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await fetchSharePayload('Ab3xYz')).toBeNull();
  });
});
