import { DeveloperController } from './developer.controller';

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

  const controller = new DeveloperController(modulesService as any, authService as any);

  it('login tecnico usa codigo e retorna sessao', async () => {
    authService.loginWithDeveloperCode.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresInSec: 900 });

    const result = await controller.login({ code: 'abc123' });

    expect(authService.loginWithDeveloperCode).toHaveBeenCalledWith({ code: 'abc123' });
    expect(result).toEqual({ accessToken: 'a', refreshToken: 'r', expiresInSec: 900 });
  });
});
