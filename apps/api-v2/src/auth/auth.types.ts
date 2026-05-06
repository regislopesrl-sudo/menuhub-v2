export type AppUserRole =
  | 'admin'
  | 'technical_admin'
  | 'user'
  | 'master'
  | 'developer'
  | 'owner'
  | 'manager'
  | 'cashier'
  | 'kitchen'
  | 'waiter'
  | 'delivery_operator';

export interface AuthTokenClaims {
  sub: string;
  companyId: string;
  branchId?: string;
  branchScope?: string[];
  role: AppUserRole;
  permissions: string[];
  sessionId: string;
  type: 'access' | 'refresh';
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
}


