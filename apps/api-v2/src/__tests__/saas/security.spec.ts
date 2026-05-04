import { ForbiddenException } from '@nestjs/common';
import { assertSameCompany } from '../../common/assert-same-company';
import { ModulesController } from '../../modules/modules.controller';

describe('SaaS Security', () => {
  it('acessar outra empresa -> 403', async () => {
    const service = {
      listAvailableModules: jest.fn(),
      listCurrentCompanyModules: jest.fn(),
      updateCurrentCompanyModule: jest.fn(),
      getCompanyModulesView: jest.fn(),
    };
    const runtimeService = { getRuntimeModules: jest.fn() };
    const controller = new ModulesController(service as never, runtimeService as never);

    await expect(
      controller.listCompanyModules('company-b', {
        companyId: 'company-a',
        userRole: 'developer',
        requestId: 'r1',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('alterar modulo de outra empresa -> 403', () => {
    expect(() => assertSameCompany('company-a', 'company-b')).toThrow(ForbiddenException);
  });
});
