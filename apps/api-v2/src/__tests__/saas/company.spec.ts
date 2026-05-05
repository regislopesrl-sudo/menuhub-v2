import { DeveloperController } from '../../developer/developer.controller';

describe('SaaS Company Flow', () => {
  it('login developer usa auth service atual', async () => {
    const modulesService = {
      listPlans: jest.fn(),
      createPlan: jest.fn(),
      updatePlan: jest.fn(),
      listCurrentCompanyModules: jest.fn(),
      updateCompanyModuleOverride: jest.fn(),
    };
    const authService = {
      loginWithDeveloperCode: jest.fn().mockResolvedValue({ accessToken: 'token-1' }),
    };
    const controller = new DeveloperController(modulesService as never, authService as never);

    const result = await controller.login({ code: 'dev_local_access' });

    expect(result.accessToken).toBe('token-1');
    expect(authService.loginWithDeveloperCode).toHaveBeenCalledWith({ code: 'dev_local_access' });
  });

  it('criar plano usa contrato atual', async () => {
    const modulesService = {
      listPlans: jest.fn(),
      createPlan: jest.fn().mockResolvedValue({ id: 'p1', key: 'basic' }),
      updatePlan: jest.fn(),
      listCurrentCompanyModules: jest.fn(),
      updateCompanyModuleOverride: jest.fn(),
    };
    const authService = {
      loginWithDeveloperCode: jest.fn(),
    };
    const controller = new DeveloperController(modulesService as never, authService as never);

    const created = await controller.createPlan({
      key: 'basic',
      name: 'Plano Basic',
    });

    expect(created.id).toBe('p1');
    expect(modulesService.createPlan).toHaveBeenCalledWith({
      key: 'basic',
      name: 'Plano Basic',
    });
  });
});
