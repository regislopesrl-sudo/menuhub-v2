import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';

export type UserRole = 'admin' | 'user' | 'master' | 'developer';
export type ChannelKey = 'delivery' | 'pdv' | 'whatsapp' | 'kiosk' | 'waiter_app' | 'admin_panel';

export interface RequestContext {
  companyId: string;
  branchId?: string;
  userRole: UserRole;
  requestId: string;
  channel?: ChannelKey;
}

type HeaderMap = Record<string, string | string[] | undefined>;

const VALID_ROLES: UserRole[] = ['admin', 'user', 'master', 'developer'];
const VALID_CHANNELS: ChannelKey[] = ['delivery', 'pdv', 'whatsapp', 'kiosk', 'waiter_app', 'admin_panel'];

export function buildRequestContextFromHeaders(headers: HeaderMap): RequestContext {
  const companyId = readHeader(headers, 'x-company-id');
  if (!companyId) {
    throw new BadRequestException('Header x-company-id é obrigatório na V2.');
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
  };
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
