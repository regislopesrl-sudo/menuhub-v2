import { DeveloperController } from './developer.controller';
import { ForbiddenException } from '@nestjs/common';

describe('DeveloperController', () => {
  const modulesService = {
    listPlans: jest.fn(),
    createPlan: jest.fn(),
    updatePlan: jest.fn(),
    listCurrentCompanyModules: jest.fn(),
    updateCompanyModuleOverride: jest.fn(),
  };
  const authService = {
    loginWithDeveloperCode: jest.fn(),
  };
  const prisma = {
    company: { findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    companySubscription: { findFirst: jest.fn(), create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    companyModuleOverride: { count: jest.fn() },
  };

  const controller = new DeveloperController(modulesService as any, authService as any, prisma as any);

  it('login tecnico usa codigo e retorna sessao', async () => {
    authService.loginWithDeveloperCode.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresInSec: 900 });

    const result = await controller.login({ code: 'abc123' });

    expect(authService.loginWithDeveloperCode).toHaveBeenCalledWith({ code: 'abc123' });
    expect(result).toEqual({ accessToken: 'a', refreshToken: 'r', expiresInSec: 900 });
  });

  it('listPlans bloqueia usuario developer sem contexto platform', () => {
    expect(() =>
      controller.listPlans({ companyId: 'c1', userRole: 'developer', requestId: 'r1', permissions: [] }),
    ).toThrow(ForbiddenException);
  });

  it('listPlans permite contexto platform por source', () => {
    modulesService.listPlans.mockReturnValueOnce([{ key: 'pro' }]);
    const result = controller.listPlans({
      companyId: 'c1',
      userRole: 'developer',
      source: 'technical-admin',
      requestId: 'r1',
      permissions: ['*'],
    });
    expect(modulesService.listPlans).toHaveBeenCalled();
    expect(result).toEqual([{ key: 'pro' }]);
  });
});
