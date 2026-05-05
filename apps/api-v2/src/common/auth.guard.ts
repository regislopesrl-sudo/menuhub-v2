import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtServiceV2 } from '../auth/jwt.service';
import { buildRequestContextFromClaims, buildRequestContextFromHeaders, readAuthorizationBearer, type RequestContext } from './request-context';
import { IS_PUBLIC_KEY } from './public.decorator';

type HttpRequest = {
  headers: Record<string, string | string[] | undefined>;
  context?: RequestContext;
};

@Injectable()
export class AuthGuardV2 implements CanActivate {
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

    if (isPublic) {
      const allowFallback = process.env.ALLOW_HEADER_CONTEXT_FALLBACK === 'true' && process.env.NODE_ENV !== 'production';
      if (allowFallback) {
        // Transitional fallback for local/HML only; production must use JWT.
        console.warn('[AuthGuardV2] Header context fallback ativo para rota publica. Use Authorization Bearer token.');
        request.context = buildRequestContextFromHeaders(request.headers);
      }
      return true;
    }

    const allowFallback = process.env.ALLOW_HEADER_CONTEXT_FALLBACK === 'true' && process.env.NODE_ENV !== 'production';
    if (allowFallback) {
      // Transitional fallback for local/HML only; production must use JWT.
      console.warn('[AuthGuardV2] Header context fallback ativo. Use Authorization Bearer token.');
      request.context = buildRequestContextFromHeaders(request.headers);
      return true;
    }

    throw new UnauthorizedException('Authorization Bearer token obrigatorio.');
  }
}
