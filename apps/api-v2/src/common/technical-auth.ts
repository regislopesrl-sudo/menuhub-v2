import { createHmac, timingSafeEqual } from 'crypto';

type TechnicalTokenPayload = {
  sub: string;
  email: string;
  role: 'TECHNICAL_ADMIN' | 'DEVELOPER_SESSION';
  exp: number;
};

const DEFAULT_TTL_SECONDS = 2 * 60 * 60;

function getSecret(): string {
  return process.env.JWT_SECRET?.trim() || process.env.JWT_ACCESS_SECRET?.trim() || 'local_technical_secret_change_me';
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signRaw(payloadEncoded: string): string {
  return createHmac('sha256', getSecret()).update(payloadEncoded).digest('base64url');
}

export function signTechnicalToken(
  input: Omit<TechnicalTokenPayload, 'exp'> & { exp?: number },
): string {
  const exp = input.exp ?? Math.floor(Date.now() / 1000) + DEFAULT_TTL_SECONDS;
  const payload: TechnicalTokenPayload = { ...input, exp };
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const signature = signRaw(payloadEncoded);
  return `${payloadEncoded}.${signature}`;
}

export function verifyTechnicalToken(token: string): TechnicalTokenPayload | null {
  const [payloadEncoded, signature] = token.split('.');
  if (!payloadEncoded || !signature) return null;
  const expected = signRaw(payloadEncoded);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(payloadEncoded)) as TechnicalTokenPayload;
    if (!payload.sub || !payload.email || !payload.role || !payload.exp) return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function readBearerToken(authorization?: string): string | null {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

