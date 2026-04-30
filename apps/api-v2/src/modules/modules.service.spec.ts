import { ModulesService } from './modules.service';

describe('ModulesService', () => {
  const service = new ModulesService();

  it('enabledByDefault permite quando nao ha override da empresa', async () => {
    const result = await service.checkAccess({
      companyId: 'company-sem-plano',
      moduleKey: 'orders',
      isAdmin: false,
    });

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('ALLOWED_DEFAULT');
    expect(result.source).toBe('default');
  });

  it('override da empresa tem prioridade sobre plano/default', async () => {
    const result = await service.checkAccess({
      companyId: 'company-pro',
      moduleKey: 'whatsapp',
      isAdmin: false,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('BLOCKED_COMPANY_OVERRIDE');
    expect(result.source).toBe('company_override');
  });
});

