export type SessionRole =
  | 'admin'
  | 'technical_admin'
  | 'master'
  | 'user'
  | 'developer'
  | 'owner'
  | 'manager'
  | 'cashier'
  | 'kitchen'
  | 'waiter'
  | 'delivery_operator';

export function readJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    const base64 = (parts[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function readRoleFromAccessToken(token: string): SessionRole {
  const payload = readJwtPayload(token);
  const role = String(payload?.role ?? '').toLowerCase();
  if (
    role === 'admin' ||
    role === 'technical_admin' ||
    role === 'master' ||
    role === 'user' ||
    role === 'developer' ||
    role === 'owner' ||
    role === 'manager' ||
    role === 'cashier' ||
    role === 'kitchen' ||
    role === 'waiter' ||
    role === 'delivery_operator'
  ) {
    return role;
  }
  return 'user';
}

