import { readRoleFromAccessToken } from './auth-claims';
import { clearAuthSession, getAuthSession, updateAuthSessionTokens } from './auth-session';

const API_BASE = process.env.NEXT_PUBLIC_API_V2_URL ?? 'http://localhost:3202';
let refreshInFlight: Promise<boolean> | null = null;

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

  const response = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
    ...init,
    headers,
  });

  if (response.status === 401 && typeof window !== 'undefined' && session?.refreshToken) {
    const refreshed = await refreshAccessToken(session.refreshToken);
    if (refreshed) {
      const refreshedSession = getAuthSession();
      const retryHeaders = new Headers(init?.headers ?? {});
      if (!retryHeaders.has('Content-Type')) {
        retryHeaders.set('Content-Type', 'application/json');
      }
      if (refreshedSession?.accessToken) {
        retryHeaders.set('Authorization', `Bearer ${refreshedSession.accessToken}`);
      }

      const retry = await fetch(`${API_BASE}${path}`, {
        cache: 'no-store',
        ...init,
        headers: retryHeaders,
      });
      if (retry.ok) {
        return (await retry.json()) as T;
      }
      throw await buildRequestError(retry);
    }
  }

  if (!response.ok) {
    throw await buildRequestError(response);
  }

  return (await response.json()) as T;
}

async function refreshAccessToken(refreshToken: string): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(`${API_BASE}/v2/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!response.ok) {
          clearAuthSession();
          return false;
        }
        const body = (await response.json()) as {
          accessToken: string;
          refreshToken: string;
          expiresInSec: number;
        };
        updateAuthSessionTokens({
          accessToken: body.accessToken,
          refreshToken: body.refreshToken,
          expiresInSec: body.expiresInSec,
          role: readRoleFromAccessToken(body.accessToken),
        });
        return true;
      } catch {
        clearAuthSession();
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }

  return refreshInFlight;
}

async function buildRequestError(response: Response): Promise<Error> {
  let reason = `HTTP ${response.status}`;
  try {
    const body = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(body.message) && body.message.length > 0) {
      reason = body.message.join(', ');
    } else if (typeof body.message === 'string' && body.message.trim()) {
      reason = body.message;
    }
  } catch {
    // keep fallback reason
  }

  if (response.status === 403) {
    reason = `Acesso negado (403). Verifique permissoes do perfil e o contexto da empresa. Detalhe: ${reason}`;
  }
  return new Error(reason);
}
