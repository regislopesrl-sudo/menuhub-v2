import { ForbiddenException } from '@nestjs/common';
import { RequireDeveloperGuard } from './require-developer.guard';

describe('RequireDeveloperGuard', () => {
  const guard = new RequireDeveloperGuard();

  function ctx(context: Record<string, unknown>) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ context }),
      }),
    } as any;
  }

  it('developer acessa area developer', () => {
    expect(guard.canActivate(ctx({ userRole: 'developer', permissions: [] }))).toBe(true);
  });

  it('contexto platform com source technical-admin acessa area developer', () => {
    expect(
      guard.canActivate(
        ctx({
          userRole: 'admin',
          source: 'technical-admin',
          permissions: [],
        }),
      ),
    ).toBe(true);
  });

  it('contexto platform com permissao * acessa area developer', () => {
    expect(guard.canActivate(ctx({ userRole: 'admin', permissions: ['*'] }))).toBe(true);
  });

  it('bloqueia admin sem contexto platform', () => {
    expect(() => guard.canActivate(ctx({ userRole: 'admin', permissions: [] }))).toThrow(ForbiddenException);
  });
});
