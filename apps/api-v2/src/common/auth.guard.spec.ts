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
    process.env.NODE_ENV = 'test';
  });

  function makeContext(headers: Record<string, string>) {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
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
});
