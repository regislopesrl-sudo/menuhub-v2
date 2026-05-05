import type { ModuleKey } from '@delivery-futuro/shared-types';
import { ModulesController } from './modules.controller';

describe('ModulesController', () => {
  const service = {
    listAvailableModules: jest.fn(),
    listCurrentCompanyModules: jest.fn(),
    updateCurrentCompanyModule: jest.fn(),
  };
  const controller = new ModulesController(service as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('atualiza modulo com contexto da company atual', async () => {
    service.updateCurrentCompanyModule.mockResolvedValueOnce({ moduleKey: 'delivery', enabled: true });
    await controller.updateCurrentCompanyModule(
      'delivery' as ModuleKey,
      { enabled: true },
      { companyId: 'c1', userRole: 'developer', requestId: 'r1', permissions: [] },
    );
    expect(service.updateCurrentCompanyModule).toHaveBeenCalledWith({
      companyId: 'c1',
      moduleKey: 'delivery',
      enabled: true,
    });
  });
});
