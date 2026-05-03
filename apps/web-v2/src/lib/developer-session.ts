'use client';

import { clearAuthSession, getAuthSession, hasRole, saveAuthSession } from './auth-session';

export type DeveloperSession = {
  role: 'developer';
  expiresAt: string;
};

export function getDeveloperSession(): DeveloperSession | null {
  const session = getAuthSession();
  if (!session || session.role !== 'developer') return null;
  return { role: 'developer', expiresAt: session.expiresAt };
}

export function saveDeveloperSession(session: DeveloperSession) {
  const expiresInSec = Math.max(1, Math.floor((Date.parse(session.expiresAt) - Date.now()) / 1000));
  const current = getAuthSession();
  saveAuthSession({
    accessToken: current?.accessToken ?? '',
    refreshToken: current?.refreshToken ?? '',
    expiresInSec,
    role: 'developer',
  });
}

export function clearDeveloperSession() {
  clearAuthSession();
}

export function hasDeveloperSession(): boolean {
  return hasRole('developer');
}
