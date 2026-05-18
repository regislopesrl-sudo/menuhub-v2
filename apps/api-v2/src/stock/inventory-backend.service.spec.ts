import { ForbiddenException } from '@nestjs/common';
import { InventoryBackendService } from './inventory-backend.service';
import type { RequestContext } from '../common/request-context';
import { TENANT_PERMISSIONS } from '../common/rbac';

const ctx: RequestContext = {
  companyId: 'company-a',
  branchId: 'branch-a',
  allowedBranchIds: ['branch-a', 'branch-b'],
  userRole: 'owner',
  requestId: 'req-a',
  permissions: [TENANT_PERMISSIONS.INVENTORY_READ],
};

describe('InventoryBackendService', () => {
  it('lista itens sempre filtrando por empresa e filiais permitidas', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'item-a', averageCost: 10, stockBalances: [] }]);
    const service = new InventoryBackendService(
      { inventoryItem: { findMany } } as any,
      { recordFromContext: jest.fn() } as any,
    );

    const items = await service.listItems(ctx);

    expect(items[0].averageCost).toBeNull();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 'company-a' },
        include: expect.objectContaining({
          stockBalances: { where: { companyId: 'company-a', branchId: { in: ['branch-a', 'branch-b'] } } },
        }),
      }),
    );
  });

  it('mantem custo quando usuario tem permissao de custo', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'item-a', averageCost: 10 }]);
    const service = new InventoryBackendService(
      { inventoryItem: { findMany } } as any,
      { recordFromContext: jest.fn() } as any,
    );

    const items = await service.listItems({
      ...ctx,
      permissions: [TENANT_PERMISSIONS.INVENTORY_READ, TENANT_PERMISSIONS.INVENTORY_COST_READ],
    });

    expect(items[0].averageCost).toBe(10);
  });

  it('bloqueia movimentacao sem permissao operacional', async () => {
    const service = new InventoryBackendService({} as any, { recordFromContext: jest.fn() } as any);

    await expect(
      service.registerMovement(ctx, {
        stockItemId: 'item-a',
        type: 'IN',
        quantity: 1,
      }),
    ).rejects.toThrow(new ForbiddenException('Sem permissao para movimentar estoque.'));
  });
});
