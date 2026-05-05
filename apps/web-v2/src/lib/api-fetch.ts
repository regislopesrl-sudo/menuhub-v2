import { getAuthSession } from './auth-session';

const API_BASE = process.env.NEXT_PUBLIC_API_V2_URL ?? 'http://localhost:3202';

export function getApiBase(): string {
  return API_BASE;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const session = typeof window !== 'undefined' ? getAuthSession() : null;
  const headers = new Headers(init?.headers ?? {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (session?.accessToken) {
    headers.set('Authorization', `Bearer ${session.accessToken}`);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
    ...init,
    headers,
  });

  if (!res.ok) {
    let reason = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (Array.isArray(body.message) && body.message.length > 0) {
        reason = body.message.join(', ');
      } else if (typeof body.message === 'string' && body.message.trim()) {
        reason = body.message;
      }
    } catch {
      // keep fallback reason
    }
    throw new Error(reason);
  }

  return (await res.json()) as T;
}
