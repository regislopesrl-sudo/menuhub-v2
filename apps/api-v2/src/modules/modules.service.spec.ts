import { ModulesService } from './modules.service';

describe('ModulesService', () => {
  function createService() {
    const prisma = {
      company: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'c1',
          name: 'Acme',
          legalName: 'Acme LTDA',
          document: null,
          slug: 'acme',
          status: 'ACTIVE',
        }),
      },
      companySubscription: {
        findFirst: jest.fn().mockResolvedValue({
          id: 's1',
          companyId: 'c1',
          planId: 'p1',
          status: 'ACTIVE',
          startsAt: new Date('2026-01-01T00:00:00.000Z'),
          endsAt: null,
          trialEndsAt: null,
        }),
      },
      plan: {
        findUnique: jest.fn().mockResolvedValue({ id: 'p1', key: 'pro', name: 'Pro' }),
      },
      planModule: {
        findMany: jest.fn().mockResolvedValue([{ moduleKey: 'delivery' }, { moduleKey: 'orders' }]),
      },
      companyModuleOverride: {
        findMany: jest.fn().mockResolvedValue([{ moduleKey: 'orders', enabled: false }]),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      companyModuleAuditLog: {
        create: jest.fn(),
      },
    };

    return {
      prisma,
      service: new ModulesService(prisma as never),
    };
  }

  it('override da empresa tem prioridade sobre plano', async () => {
    const { service } = createService();

    const result = await service.checkAccess({
      companyId: 'c1',
      moduleKey: 'orders',
      isAdmin: true,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('BLOCKED_COMPANY_OVERRIDE');
  });

  it('atualiza override e audita', async () => {
    const { service, prisma } = createService();

    await service.updateCurrentCompanyModule({
      companyId: 'c1',
      moduleKey: 'delivery',
      enabled: true,
      reason: 'teste',
      userId: 'u1',
    });

    expect(prisma.companyModuleOverride.upsert).toHaveBeenCalled();
    expect(prisma.companyModuleAuditLog.create).toHaveBeenCalled();
  });
});
