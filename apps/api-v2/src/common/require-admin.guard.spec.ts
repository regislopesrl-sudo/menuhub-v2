import { ForbiddenException } from '@nestjs/common';
import { RequireAdminGuard } from './require-admin.guard';

describe('RequireAdminGuard', () => {
  const guard = new RequireAdminGuard();

  function ctx(context: Record<string, unknown>) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ context }),
      }),
    } as any;
  }

  it('cashier nao acessa settings sensiveis', () => {
    expect(() => guard.canActivate(ctx({ userRole: 'cashier', permissions: [] }))).toThrow(ForbiddenException);
  });

  it('manager acessa area admin', () => {
    expect(guard.canActivate(ctx({ userRole: 'manager', permissions: [] }))).toBe(true);
  });

  it('contexto platform com permissao platform:admin acessa area admin', () => {
    expect(guard.canActivate(ctx({ userRole: 'user', permissions: ['platform:admin'] }))).toBe(true);
  });
});
