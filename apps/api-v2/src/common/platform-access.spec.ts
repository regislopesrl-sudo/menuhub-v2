import { ForbiddenException } from '@nestjs/common';
import { assertCompanyScope, assertPlatformAdmin, isPlatformContext } from './platform-access';

describe('platform-access', () => {
  const baseCtx = {
    companyId: 'c1',
    userRole: 'developer' as const,
    requestId: 'r1',
    permissions: [],
  };

  it('identifica technical_admin como contexto platform', () => {
    expect(
      isPlatformContext({
        ...baseCtx,
        userRole: 'technical_admin',
      }),
    ).toBe(true);
  });

  it('identifica permissao platform:admin como contexto platform', () => {
    expect(
      isPlatformContext({
        ...baseCtx,
        permissions: ['platform:admin'],
      }),
    ).toBe(true);
  });

  it('bloqueia acesso platform para usuario nao tecnico', () => {
    expect(() => assertPlatformAdmin(baseCtx)).toThrow(ForbiddenException);
  });

  it('permite cross-company para technical_admin', () => {
    expect(() =>
      assertCompanyScope(
        {
          ...baseCtx,
          userRole: 'technical_admin',
        },
        'c2',
      ),
    ).not.toThrow();
  });
});
