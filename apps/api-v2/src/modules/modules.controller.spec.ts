import { ForbiddenException } from '@nestjs/common';
import type { ModuleKey } from '@delivery-futuro/shared-types';
import { ModulesController } from './modules.controller';

describe('ModulesController', () => {
  const service = {
    listAvailableModules: jest.fn(),
    listCurrentCompanyModules: jest.fn(),
    updateCurrentCompanyModule: jest.fn(),
    getCompanyModulesView: jest.fn(),
  };
  const runtimeService = {
    getRuntimeModules: jest.fn(),
  };
  const controller = new ModulesController(service as never, runtimeService as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('developer acessa toggle de modulos', async () => {
    service.updateCurrentCompanyModule.mockResolvedValueOnce({ moduleKey: 'delivery', enabled: true });
    await controller.updateCurrentCompanyModule(
      'delivery' as ModuleKey,
      { enabled: true },
      { companyId: 'c1', userRole: 'developer', requestId: 'r1' },
    );
    expect(service.updateCurrentCompanyModule).toHaveBeenCalledWith({
      companyId: 'c1',
      moduleKey: 'delivery',
      enabled: true,
      reason: undefined,
    });
  });

  it('admin e master sao bloqueados no PATCH', async () => {
    await expect(
      controller.updateCurrentCompanyModule('delivery' as ModuleKey, { enabled: true }, { companyId: 'c1', userRole: 'admin', requestId: 'r1' }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.updateCurrentCompanyModule('delivery' as ModuleKey, { enabled: true }, { companyId: 'c1', userRole: 'master', requestId: 'r1' }),
    ).rejects.toThrow(ForbiddenException);
  });
});
