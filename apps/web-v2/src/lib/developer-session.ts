'use client';

const SESSION_KEY = 'developer_session_v2';

export type DeveloperSession = {
  role: 'developer';
  expiresAt: string;
  sessionToken?: string;
  accessToken?: string;
};

export function getDeveloperSession(): DeveloperSession | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DeveloperSession;
    if (parsed.role !== 'developer') return null;
    if (!parsed.expiresAt || Number.isNaN(Date.parse(parsed.expiresAt))) return null;
    if (Date.parse(parsed.expiresAt) <= Date.now()) {
      clearDeveloperSession();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveDeveloperSession(session: DeveloperSession) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearDeveloperSession() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(SESSION_KEY);
}

export function hasDeveloperSession(): boolean {
  return getDeveloperSession() !== null;
}

export function buildDeveloperAccessHeaders(): Record<string, string> {
  const session = getDeveloperSession();
  if (!session) return {};
  if (session.accessToken) {
    return { authorization: `Bearer ${session.accessToken}` };
  }
  if (session.sessionToken) {
    return { 'x-developer-session': session.sessionToken };
  }
  return {};
}
