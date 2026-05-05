import { ForbiddenException } from '@nestjs/common';
import { RequireAdminGuard } from './require-admin.guard';

describe('RequireAdminGuard', () => {
  const guard = new RequireAdminGuard();

  function ctx(role: string) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ context: { userRole: role } }),
      }),
    } as any;
  }

  it('cashier nao acessa settings sensiveis', () => {
    expect(() => guard.canActivate(ctx('cashier'))).toThrow(ForbiddenException);
  });

  it('manager acessa area admin', () => {
    expect(guard.canActivate(ctx('manager'))).toBe(true);
  });
});
