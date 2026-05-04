import { ForbiddenException } from '@nestjs/common';
import { RequireDeveloperGuard } from './require-developer.guard';

describe('RequireDeveloperGuard', () => {
  const guard = new RequireDeveloperGuard();

  function ctx(role: string) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ context: { userRole: role } }),
      }),
    } as any;
  }

  it('developer so via token valido (role developer)', () => {
    expect(guard.canActivate(ctx('developer'))).toBe(true);
  });

  it('technical_admin tambem acessa area developer', () => {
    expect(guard.canActivate(ctx('technical_admin'))).toBe(true);
  });

  it('bloqueia admin na area developer', () => {
    expect(() => guard.canActivate(ctx('admin'))).toThrow(ForbiddenException);
  });
});
