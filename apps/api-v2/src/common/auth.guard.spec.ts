import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuardV2 } from './auth.guard';

describe('AuthGuardV2', () => {
  const reflector = { getAllAndOverride: jest.fn(() => false) } as unknown as Reflector;
  const jwtService = {
    verifyToken: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ALLOW_HEADER_CONTEXT_FALLBACK;
    delete process.env.APP_ENV;
    process.env.NODE_ENV = 'test';
  });

  function makeContext(headers: Record<string, string>) {
    const request = { headers } as any;
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      __request: request,
    } as any;
  }

  it('token invalido bloqueia', () => {
    jwtService.verifyToken.mockImplementation(() => {
      throw new UnauthorizedException('invalid');
    });
    const guard = new AuthGuardV2(reflector, jwtService as any);

    expect(() =>
      guard.canActivate(makeContext({ authorization: 'Bearer bad-token' })),
    ).toThrow(UnauthorizedException);
  });

  it('nao aceita role falsificada por header quando fallback desabilitado', () => {
    const guard = new AuthGuardV2(reflector, jwtService as any);

    expect(() =>
      guard.canActivate(makeContext({ 'x-company-id': 'company_a', 'x-user-role': 'developer' })),
    ).toThrow(UnauthorizedException);
  });

  it('ignora fallback de header em ambiente production-like', () => {
    process.env.ALLOW_HEADER_CONTEXT_FALLBACK = 'true';
    process.env.APP_ENV = 'prd';
    const guard = new AuthGuardV2(reflector, jwtService as any);

    expect(() =>
      guard.canActivate(makeContext({ 'x-company-id': 'company_a', 'x-user-role': 'developer' })),
    ).toThrow(UnauthorizedException);
  });

  it('em fallback local, header developer nao concede role developer', () => {
    process.env.ALLOW_HEADER_CONTEXT_FALLBACK = 'true';
    process.env.APP_ENV = 'local';
    const guard = new AuthGuardV2(reflector, jwtService as any);
    const ctx = makeContext({ 'x-company-id': 'company_a', 'x-user-role': 'developer' });

    expect(guard.canActivate(ctx)).toBe(true);
    expect(ctx.__request.context.userRole).toBe('user');
    expect(ctx.__request.context.source).toBe('header-fallback');
  });

  it('rota publica sem x-company-id nao falha com fallback ativo', () => {
    process.env.ALLOW_HEADER_CONTEXT_FALLBACK = 'true';
    process.env.APP_ENV = 'local';
    (reflector.getAllAndOverride as jest.Mock).mockReturnValueOnce(true);
    const guard = new AuthGuardV2(reflector, jwtService as any);

    expect(guard.canActivate(makeContext({}))).toBe(true);
  });
});
