import { ForbiddenException } from '@nestjs/common';
import { BiImportsBackendService } from './bi-imports-backend.service';
import type { RequestContext } from '../common/request-context';
import { TENANT_PERMISSIONS } from '../common/rbac';

const ctx: RequestContext = {
  companyId: 'company-a',
  branchId: 'branch-a',
  allowedBranchIds: ['branch-a'],
  userRole: 'owner',
  requestId: 'req-a',
  permissions: [TENANT_PERMISSIONS.REPORTS_BI, TENANT_PERMISSIONS.REPORTS_SALES],
};

describe('BiImportsBackendService', () => {
  it('cria importacao de vendas com empresa, filial e linhas normalizadas', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'import-a', rows: [] });
    const service = new BiImportsBackendService(
      {
        branchSalesImport: {
          findFirst: jest.fn().mockResolvedValue(null),
          create,
        },
      } as any,
      { recordFromContext: jest.fn() } as any,
    );

    await service.createSalesImport(ctx, {
      fileHash: 'hash-a',
      rows: [{ rowNumber: 1, rawData: { order: '1' } }],
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: 'company-a',
          branchId: 'branch-a',
          fileHash: 'hash-a',
          totalRows: 1,
        }),
      }),
    );
  });

  it('lista historico importado somente de filiais permitidas', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new BiImportsBackendService(
      { importedSalesHistory: { findMany } } as any,
      { recordFromContext: jest.fn() } as any,
    );

    await service.listImportedSalesHistory(ctx);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 'company-a', branchId: 'branch-a' },
      }),
    );
  });

  it('bloqueia importacao sem permissao de BI ou vendas', async () => {
    const service = new BiImportsBackendService({} as any, { recordFromContext: jest.fn() } as any);

    await expect(
      service.createSalesImport({ ...ctx, permissions: [] }, { rows: [] }),
    ).rejects.toThrow(new ForbiddenException('Sem permissao para importar vendas.'));
  });
});
