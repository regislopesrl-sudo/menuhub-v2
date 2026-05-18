import { ForbiddenException } from '@nestjs/common';
import { FinanceBackendService } from './finance-backend.service';
import type { RequestContext } from '../common/request-context';
import { TENANT_PERMISSIONS } from '../common/rbac';

const ctx: RequestContext = {
  companyId: 'company-a',
  branchId: 'branch-a',
  allowedBranchIds: ['branch-a', 'branch-b'],
  userRole: 'owner',
  requestId: 'req-a',
  permissions: [TENANT_PERMISSIONS.FINANCE_READ],
};

describe('FinanceBackendService', () => {
  it('lista lancamentos filtrando pela empresa da filial e escopo de filiais', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new FinanceBackendService(
      { financialLedgerEntry: { findMany } } as any,
      { recordFromContext: jest.fn() } as any,
    );

    await service.listLedgerEntries(ctx);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          branchId: { in: ['branch-a', 'branch-b'] },
          branch: { companyId: 'company-a' },
        },
      }),
    );
  });

  it('bloqueia lancamento sem permissao de gestao financeira', async () => {
    const service = new FinanceBackendService({} as any, { recordFromContext: jest.fn() } as any);

    await expect(
      service.createLedgerEntry(ctx, {
        entryType: 'DEBIT',
        amount: 10,
      }),
    ).rejects.toThrow(new ForbiddenException('Sem permissao para lancar financeiro.'));
  });

  it('usa idempotencyKey para retornar lancamento existente na filial', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'entry-a' });
    const service = new FinanceBackendService(
      { financialLedgerEntry: { findFirst } } as any,
      { recordFromContext: jest.fn() } as any,
    );

    const entry = await service.createLedgerEntry(
      { ...ctx, permissions: [TENANT_PERMISSIONS.FINANCE_MANAGE] },
      {
        entryType: 'CREDIT',
        amount: 10,
        idempotencyKey: 'idem-a',
      },
    );

    expect(entry).toEqual({ id: 'entry-a' });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        branchId: 'branch-a',
        idempotencyKey: 'idem-a',
        branch: { companyId: 'company-a' },
      },
    });
  });
});
