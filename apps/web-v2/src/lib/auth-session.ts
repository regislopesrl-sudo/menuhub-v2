'use client';

const SESSION_KEY = 'auth_session_v2';

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  role?: 'admin' | 'technical_admin' | 'master' | 'user' | 'developer' | 'owner' | 'manager' | 'cashier' | 'kitchen' | 'waiter' | 'delivery_operator';
};

export function getAuthSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed.accessToken || !parsed.refreshToken || !parsed.expiresAt) return null;
    if (Number.isNaN(Date.parse(parsed.expiresAt))) return null;
    if (Date.parse(parsed.expiresAt) <= Date.now()) {
      clearAuthSession();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveAuthSession(input: { accessToken: string; refreshToken: string; expiresInSec: number; role?: AuthSession['role'] }) {
  if (typeof window === 'undefined') return;
  const expiresAt = new Date(Date.now() + input.expiresInSec * 1000).toISOString();
  const session: AuthSession = {
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    expiresAt,
    role: input.role,
  };
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearAuthSession() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(SESSION_KEY);
}

export function hasRole(role: NonNullable<AuthSession['role']>): boolean {
  const session = getAuthSession();
  return session?.role === role;
}

