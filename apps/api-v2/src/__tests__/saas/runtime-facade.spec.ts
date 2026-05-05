import { RuntimeFacadeService } from '../../modules/runtime-facade.service';

describe('SaaS Runtime Facade', () => {
  it('retorna config consistente com plano + override', async () => {
    const modulesService = {
      getCompanyModulesView: jest.fn().mockResolvedValue({
        company: { id: 'c1' },
        subscription: {
          id: 's1',
          status: 'ACTIVE',
          startsAt: '2026-01-01T00:00:00.000Z',
          endsAt: null,
          trialEndsAt: null,
        },
        plan: { id: 'p1', key: 'pro', name: 'Pro' },
        modules: [
          {
            moduleKey: 'delivery',
            includedInPlan: true,
            overrideEnabled: null,
            effectiveEnabled: true,
            source: 'plan',
            adminOnly: false,
            enabledByDefault: true,
          },
          {
            moduleKey: 'whatsapp',
            includedInPlan: false,
            overrideEnabled: true,
            effectiveEnabled: true,
            source: 'override',
            adminOnly: false,
            enabledByDefault: false,
          },
        ],
      }),
    };

    const facade = new RuntimeFacadeService(modulesService as never);
    const result = await facade.getRuntimeModules('c1');

    expect(result.companyId).toBe('c1');
    expect(result.modules).toHaveLength(2);
    expect(result.modules[1].enabled).toBe(true);
  });
});
