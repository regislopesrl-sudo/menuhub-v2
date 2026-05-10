import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtServiceV2 } from '../auth/jwt.service';
import {
  buildRequestContextFromClaims,
  buildRequestContextFromHeaders,
  readAuthorizationBearer,
  type RequestContext,
} from './request-context';
import { IS_PUBLIC_KEY } from './public.decorator';
import { allowHeaderContextFallback } from './runtime-env';

type HttpRequest = {
  headers: Record<string, string | string[] | undefined>;
  context?: RequestContext;
};

function hasCompanyHeader(headers: Record<string, string | string[] | undefined>): boolean {
  const raw = headers['x-company-id'];
  if (typeof raw === 'string') return raw.trim().length > 0;
  if (Array.isArray(raw)) return Boolean(raw[0]?.trim());
  return false;
}

@Injectable()
export class AuthGuardV2 implements CanActivate {
  private readonly logger = new Logger(AuthGuardV2.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtServiceV2,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<HttpRequest>();
    const bearer = readAuthorizationBearer(request.headers);

    if (bearer) {
      const claims = this.jwtService.verifyToken(bearer);
      if (claims.type !== 'access') {
        throw new UnauthorizedException('Token de acesso invalido.');
      }
      request.context = buildRequestContextFromClaims(request.headers, claims);
      return true;
    }

    const allowFallback = allowHeaderContextFallback();

    if (isPublic) {
      if (allowFallback) {
        if (hasCompanyHeader(request.headers)) {
          this.logger.warn(
            'Header context fallback ativo para rota publica. Use Authorization Bearer token.',
          );
          request.context = buildRequestContextFromHeaders(request.headers);
        }
      }
      return true;
    }

    if (allowFallback) {
      this.logger.warn('Header context fallback ativo. Use Authorization Bearer token.');
      request.context = buildRequestContextFromHeaders(request.headers);
      return true;
    }

    throw new UnauthorizedException('Authorization Bearer token obrigatorio.');
  }
}
