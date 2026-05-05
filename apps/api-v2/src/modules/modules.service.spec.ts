import { BadRequestException } from '@nestjs/common';
import { ModulesService } from './modules.service';

describe('ModulesService', () => {
  it('plano controla modulos e bloqueia modulo fora do plano', async () => {
    const prismaMock = {
      plan: { findMany: jest.fn() },
      companySubscription: {
        findFirst: jest.fn().mockResolvedValue({
          planId: 'plan_basic',
          plan: { key: 'basic' },
        }),
      },
      companyModuleOverride: { findMany: jest.fn().mockResolvedValue([]) },
      planModule: {
        findMany: jest.fn().mockResolvedValue([{ moduleKey: 'orders' }]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as any;

    const service = new ModulesService(prismaMock);
    const result = await service.checkAccess({ companyId: 'c1', moduleKey: 'orders', isAdmin: false });
    expect(result.allowed).toBe(true);

    await expect(
      service.updateCompanyModuleOverride({ companyId: 'c1', moduleKey: 'whatsapp', enabled: true }),
    ).rejects.toThrow(BadRequestException);
  });

  it('override developer funciona para desabilitar modulo do plano', async () => {
    const prismaMock = {
      companySubscription: {
        findFirst: jest.fn().mockResolvedValue({
          planId: 'plan_pro',
          plan: { key: 'pro' },
        }),
      },
      companyModuleOverride: {
        findMany: jest.fn().mockResolvedValue([{ moduleKey: 'orders', enabled: false }]),
        upsert: jest.fn(),
      },
      planModule: {
        findMany: jest.fn().mockResolvedValue([{ moduleKey: 'orders' }]),
        findFirst: jest.fn().mockResolvedValue({ id: 'pm1' }),
      },
      plan: { findMany: jest.fn() },
    } as any;

    const service = new ModulesService(prismaMock);
    const access = await service.checkAccess({ companyId: 'c1', moduleKey: 'orders', isAdmin: true });
    expect(access.allowed).toBe(false);
    expect(access.reason).toBe('BLOCKED_COMPANY_OVERRIDE');

    prismaMock.companyModuleOverride.findMany.mockResolvedValue([{ moduleKey: 'orders', enabled: true }]);
    const updated = await service.updateCompanyModuleOverride({ companyId: 'c1', moduleKey: 'orders', enabled: true });
    expect(updated.enabled).toBe(true);
  });
});
