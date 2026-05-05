import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import type { AuthTokenClaims } from './auth.types';

type JwtPayload = AuthTokenClaims & {
  exp: number;
  iss: string;
};

@Injectable()
export class JwtServiceV2 {
  private readonly secret = process.env.AUTH_JWT_SECRET?.trim() || 'dev-v2-secret-change-me';
  private readonly issuer = process.env.AUTH_JWT_ISSUER?.trim() || 'menuhub-v2';

  signAccessToken(claims: AuthTokenClaims): string {
    return this.sign(claims, Number(process.env.AUTH_ACCESS_TTL_SEC ?? 900));
  }

  signRefreshToken(claims: AuthTokenClaims): string {
    return this.sign(claims, Number(process.env.AUTH_REFRESH_TTL_SEC ?? 60 * 60 * 24 * 15));
  }

  verifyToken(token: string): AuthTokenClaims {
    const [headerB64, payloadB64, signature] = token.split('.');
    if (!headerB64 || !payloadB64 || !signature) {
      throw new UnauthorizedException('Token invalido ou expirado.');
    }

    const expected = this.signRaw(`${headerB64}.${payloadB64}`);
    const safeA = Buffer.from(signature);
    const safeB = Buffer.from(expected);
    if (safeA.length !== safeB.length || !timingSafeEqual(safeA, safeB)) {
      throw new UnauthorizedException('Token invalido ou expirado.');
    }

    try {
      const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')) as { alg?: string; typ?: string };
      if (header.alg !== 'HS256' || header.typ !== 'JWT') {
        throw new UnauthorizedException('Token invalido ou expirado.');
      }

      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as JwtPayload;
      if (payload.iss !== this.issuer || payload.exp <= Math.floor(Date.now() / 1000)) {
        throw new UnauthorizedException('Token invalido ou expirado.');
      }

      const { exp: _exp, iss: _iss, ...claims } = payload;
      return claims;
    } catch {
      throw new UnauthorizedException('Token invalido ou expirado.');
    }
  }

  private sign(claims: AuthTokenClaims, ttlSec: number): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }), 'utf8').toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        ...claims,
        exp: Math.floor(Date.now() / 1000) + ttlSec,
        iss: this.issuer,
      }),
      'utf8',
    ).toString('base64url');

    const signature = this.signRaw(`${header}.${payload}`);
    return `${header}.${payload}.${signature}`;
  }

  private signRaw(value: string): string {
    return createHmac('sha256', this.secret).update(value).digest('base64url');
  }
}
