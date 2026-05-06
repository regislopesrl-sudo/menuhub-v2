import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { AuthTokenClaims } from '../auth/auth.types';

export type UserRole =
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
export type ChannelKey = 'delivery' | 'pdv' | 'whatsapp' | 'kiosk' | 'waiter_app' | 'admin_panel';

export interface RequestContext {
  companyId: string;
  branchId?: string;
  userRole: UserRole;
  requestId: string;
  channel?: ChannelKey;
  permissions?: string[];
  userId?: string;
  sessionId?: string;
}

type HeaderMap = Record<string, string | string[] | undefined>;

const VALID_ROLES: UserRole[] = ['admin', 'technical_admin', 'user', 'master', 'developer', 'owner', 'manager', 'cashier', 'kitchen', 'waiter', 'delivery_operator'];
const VALID_CHANNELS: ChannelKey[] = ['delivery', 'pdv', 'whatsapp', 'kiosk', 'waiter_app', 'admin_panel'];

export function buildRequestContextFromHeaders(headers: HeaderMap): RequestContext {
  const companyId = readHeader(headers, 'x-company-id');
  if (!companyId) {
    throw new BadRequestException('Header x-company-id e obrigatorio na V2 (fallback local).');
  }

  const userRoleRaw = readHeader(headers, 'x-user-role');
  const userRole: UserRole = VALID_ROLES.includes((userRoleRaw ?? '').toLowerCase() as UserRole)
    ? ((userRoleRaw ?? '').toLowerCase() as UserRole)
    : 'user';

  const requestId = readHeader(headers, 'x-request-id') ?? randomUUID();
  const channelRaw = readHeader(headers, 'x-channel')?.toLowerCase();
  const channel = VALID_CHANNELS.includes(channelRaw as ChannelKey) ? (channelRaw as ChannelKey) : undefined;

  return {
    companyId,
    branchId: readHeader(headers, 'x-branch-id'),
    userRole,
    requestId,
    channel,
    permissions: [],
  };
}

export function buildRequestContextFromClaims(headers: HeaderMap, claims: AuthTokenClaims): RequestContext {
  const requestId = readHeader(headers, 'x-request-id') ?? randomUUID();
  const channelRaw = readHeader(headers, 'x-channel')?.toLowerCase();
  const channel = VALID_CHANNELS.includes(channelRaw as ChannelKey) ? (channelRaw as ChannelKey) : undefined;

  return {
    companyId: claims.companyId,
    branchId: claims.branchId,
    userRole: claims.role,
    requestId,
    channel,
    permissions: claims.permissions,
    userId: claims.sub,
    sessionId: claims.sessionId,
  };
}

export function readAuthorizationBearer(headers: HeaderMap): string | null {
  const auth = readHeader(headers, 'authorization');
  if (!auth) return null;
  const [scheme, token] = auth.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token?.trim()) {
    return null;
  }
  return token.trim();
}

function readHeader(headers: HeaderMap, key: string): string | undefined {
  const value = headers[key];
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }
  if (Array.isArray(value)) {
    const normalized = value[0]?.trim();
    return normalized && normalized.length > 0 ? normalized : undefined;
  }
  return undefined;
}



