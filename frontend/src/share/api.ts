// Backend short-link store client. The server holds the opaque codec blob; these
// only move the payload string in and out. Failures resolve to null so callers
// fall back to a full link (write) or persisted state (read) instead of throwing.

export async function postSharePayload(payload: string): Promise<string | null> {
  try {
    const res = await fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: payload,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { id: string; url: string };
    return data.id;
  } catch {
    return null;
  }
}

export async function fetchSharePayload(id: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/share/${id}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { payload: string };
    return data.payload;
  } catch {
    return null;
  }
}
