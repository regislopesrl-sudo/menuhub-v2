import { UnauthorizedException } from '@nestjs/common';
import { readBearerToken, verifyTechnicalToken } from './technical-auth';

type HeaderMap = Record<string, string | string[] | undefined>;

function readHeader(headers: HeaderMap, key: string): string | undefined {
  const value = headers[key];
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

export function requireDeveloperAreaAccess(headers: HeaderMap): {
  mode: 'developer_session' | 'technical_admin';
  technicalAdminId?: string;
} {
  const authorization = readHeader(headers, 'authorization');
  const bearer = readBearerToken(authorization);
  if (bearer) {
    const payload = verifyTechnicalToken(bearer);
    if (payload?.role === 'TECHNICAL_ADMIN') {
      return { mode: 'technical_admin', technicalAdminId: payload.sub };
    }
  }

  const sessionToken = readHeader(headers, 'x-developer-session');
  if (sessionToken) {
    const payload = verifyTechnicalToken(sessionToken);
    if (payload?.role === 'DEVELOPER_SESSION') {
      return { mode: 'developer_session' };
    }
  }

  throw new UnauthorizedException('Acesso tecnico requer login developer ou TECHNICAL_ADMIN.');
}

