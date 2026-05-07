import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionGuardV2 } from './permission.guard';

describe('PermissionGuardV2', () => {
  function createGuard(required?: string[]) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(required),
    } as unknown as Reflector;
    return new PermissionGuardV2(reflector);
  }

  function ctx(permissions: string[]) {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ context: { permissions } }),
      }),
    } as any;
  }

  it('permite quando nenhuma permissao e exigida', () => {
    const guard = createGuard(undefined);
    expect(guard.canActivate(ctx([]))).toBe(true);
  });

  it('permite wildcard *', () => {
    const guard = createGuard(['settings.write']);
    expect(guard.canActivate(ctx(['*']))).toBe(true);
  });

  it('bloqueia quando permissao obrigatoria esta ausente', () => {
    const guard = createGuard(['settings.write']);
    expect(() => guard.canActivate(ctx(['settings.read']))).toThrow(ForbiddenException);
  });
});
