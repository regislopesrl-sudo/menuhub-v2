import { computeEffectiveModule } from '../../modules/domain/compute-effective-module';
import { ModulesService } from '../../modules/modules.service';

describe('SaaS Modules Flow', () => {
  it('ativo por plano', () => {
    expect(computeEffectiveModule({ planEnabled: true, override: null })).toBe(true);
  });

  it('override habilita', () => {
    expect(computeEffectiveModule({ planEnabled: false, override: true })).toBe(true);
  });

  it('override desabilita', () => {
    expect(computeEffectiveModule({ planEnabled: true, override: false })).toBe(false);
  });

  it('remover override volta ao plano', () => {
    expect(computeEffectiveModule({ planEnabled: true, override: null })).toBe(true);
  });

  it('sem assinatura bloqueia', async () => {
    const prisma = {
      company: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'c1',
          name: 'Empresa',
          legalName: 'Empresa LTDA',
          document: null,
          slug: 'empresa',
          status: 'ACTIVE',
        }),
      },
      companySubscription: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      plan: { findUnique: jest.fn() },
      planModule: { findMany: jest.fn().mockResolvedValue([]) },
      companyModuleOverride: { findMany: jest.fn().mockResolvedValue([]) },
      companyModuleAuditLog: { create: jest.fn() },
    };

    const service = new ModulesService(prisma as never);
    const modules = await service.listCurrentCompanyModules('c1');

    expect(modules.every((m) => m.enabled === false)).toBe(true);
  });
});
