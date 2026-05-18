import { ForbiddenException } from '@nestjs/common';
import { PurchasesBackendService } from './purchases-backend.service';
import type { RequestContext } from '../common/request-context';
import { TENANT_PERMISSIONS } from '../common/rbac';

const ctx: RequestContext = {
  companyId: 'company-a',
  branchId: 'branch-a',
  allowedBranchIds: ['branch-a'],
  userRole: 'owner',
  requestId: 'req-a',
  permissions: [TENANT_PERMISSIONS.PURCHASES_READ, TENANT_PERMISSIONS.SUPPLIERS_READ],
};

describe('PurchasesBackendService', () => {
  it('lista fornecedores somente da empresa atual', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new PurchasesBackendService(
      { supplier: { findMany } } as any,
      { recordFromContext: jest.fn() } as any,
    );

    await service.listSuppliers(ctx);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 'company-a' },
      }),
    );
  });

  it('lista recebimentos somente das filiais permitidas', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new PurchasesBackendService(
      { purchaseReceipt: { findMany } } as any,
      { recordFromContext: jest.fn() } as any,
    );

    await service.listReceipts(ctx);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 'company-a', branchId: 'branch-a' },
      }),
    );
  });

  it('bloqueia criacao de fornecedor sem permissao de gestao', async () => {
    const service = new PurchasesBackendService({} as any, { recordFromContext: jest.fn() } as any);

    await expect(service.createSupplier(ctx, { name: 'Fornecedor' })).rejects.toThrow(
      new ForbiddenException('Sem permissao para criar fornecedor.'),
    );
  });
});
