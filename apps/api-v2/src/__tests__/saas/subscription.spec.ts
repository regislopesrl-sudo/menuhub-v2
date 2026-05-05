import { DeveloperController } from '../../developer/developer.controller';
import { canUseModules } from '../../subscriptions/domain/can-use-modules';

describe('SaaS Subscription Flow', () => {
  it('listar planos usa endpoint real do developer controller', async () => {
    const modulesService = {
      listPlans: jest.fn().mockResolvedValue([{ id: 'p1', key: 'basic' }]),
      createPlan: jest.fn(),
      updatePlan: jest.fn(),
      listCurrentCompanyModules: jest.fn(),
      updateCompanyModuleOverride: jest.fn(),
    };
    const authService = { loginWithDeveloperCode: jest.fn() };
    const controller = new DeveloperController(modulesService as never, authService as never);

    const result = await controller.listPlans();
    expect(result).toHaveLength(1);
    expect(modulesService.listPlans).toHaveBeenCalled();
  });

  it('atualizar modulo da empresa usa endpoint real', async () => {
    const modulesService = {
      listPlans: jest.fn(),
      createPlan: jest.fn(),
      updatePlan: jest.fn(),
      listCurrentCompanyModules: jest.fn(),
      updateCompanyModuleOverride: jest.fn().mockResolvedValue({
        companyId: 'c1',
        moduleKey: 'kds',
        enabled: true,
      }),
    };
    const authService = { loginWithDeveloperCode: jest.fn() };
    const controller = new DeveloperController(modulesService as never, authService as never);

    const result = await controller.updateCompanyModule('c1', 'kds', { enabled: true });
    expect(result.enabled).toBe(true);
    expect(modulesService.updateCompanyModuleOverride).toHaveBeenCalledWith({
      companyId: 'c1',
      moduleKey: 'kds',
      enabled: true,
    });
  });

  it('expirar assinatura bloqueia uso de modulos', () => {
    expect(canUseModules('EXPIRED')).toBe(false);
    expect(canUseModules('ACTIVE')).toBe(true);
  });
});
