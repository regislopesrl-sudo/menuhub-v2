import { apiFetch } from './api-fetch';
import { clearAuthSession, getAuthSession } from './auth-session';

export type AuthMeResponse = {
  id: string;
  name: string;
  email: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  companyId: string;
  branchId: string | null;
  role: string;
  permissions: string[];
  sessionId: string | null;
};

export function authMe() {
  return apiFetch<AuthMeResponse>('/v2/auth/me', { method: 'GET' });
}

export async function logoutCurrentSession(): Promise<void> {
  const session = getAuthSession();
  if (!session?.refreshToken) {
    clearAuthSession();
    return;
  }

  try {
    await apiFetch<{ success: boolean }>('/v2/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
  } finally {
    clearAuthSession();
  }
}
