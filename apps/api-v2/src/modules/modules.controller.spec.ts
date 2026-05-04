import type { ModuleKey } from '@delivery-futuro/shared-types';
import { ModulesController } from './modules.controller';
import { UnauthorizedException } from '@nestjs/common';
import { signTechnicalToken } from '../common/technical-auth';

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
  const devHeaders = {
    'x-developer-session': signTechnicalToken({ sub: 'developer-code', email: 'developer@local', role: 'DEVELOPER_SESSION' }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('developer acessa toggle de modulos', async () => {
    service.updateCurrentCompanyModule.mockResolvedValueOnce({ moduleKey: 'delivery', enabled: true });
    await controller.updateCurrentCompanyModule(
      'delivery' as ModuleKey,
      { enabled: true },
      { companyId: 'c1', userRole: 'developer', requestId: 'r1' },
      devHeaders,
    );
    expect(service.updateCurrentCompanyModule).toHaveBeenCalledWith({
      companyId: 'c1',
      moduleKey: 'delivery',
      enabled: true,
      reason: undefined,
    });
  });

  it('bloqueia sem sessao tecnica', async () => {
    await expect(
      controller.updateCurrentCompanyModule(
        'delivery' as ModuleKey,
        { enabled: true },
        { companyId: 'c1', userRole: 'admin', requestId: 'r1' },
        {},
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('technical admin via bearer acessa rotas developer', async () => {
    service.getCompanyModulesView.mockResolvedValueOnce({ company: { id: 'c1' }, modules: [] });
    const authHeaders = {
      authorization: `Bearer ${signTechnicalToken({ sub: 'u-tech', email: 'tecnico@menuhub.local', role: 'TECHNICAL_ADMIN' })}`,
    };
    await controller.listCompanyModules('c1', { companyId: 'c1', userRole: 'user', requestId: 'r1' }, authHeaders);
    expect(service.getCompanyModulesView).toHaveBeenCalledWith('c1');
  });
});
