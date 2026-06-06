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
const receivingCtx: RequestContext = {
  ...ctx,
  permissions: [TENANT_PERMISSIONS.PURCHASES_RECEIVE],
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

  it('cria recebimento ligado ao estoque, movimento e custo medio', async () => {
    const receipt = {
      id: 'receipt-a',
      items: [
        {
          id: 'receipt-item-a',
          stockItemId: 'item-a',
          quantityReceived: 2,
          unitCost: 7,
          notes: null,
        },
      ],
    };
    const tx = {
      purchaseReceipt: { create: jest.fn().mockResolvedValue(receipt) },
      inventoryItem: {
        findFirst: jest.fn().mockResolvedValue({ id: 'item-a', averageCost: 5 }),
        update: jest.fn().mockResolvedValue({ id: 'item-a' }),
      },
      inventoryStockBalance: {
        findUnique: jest.fn().mockResolvedValue({ quantity: 8 }),
        upsert: jest.fn().mockResolvedValue({}),
      },
      inventoryMovement: { create: jest.fn().mockResolvedValue({ id: 'movement-a' }) },
      averageCostHistory: { create: jest.fn().mockResolvedValue({ id: 'cost-a' }) },
    };
    const auditLog = { recordFromContext: jest.fn() };
    const service = new PurchasesBackendService(
      {
        inventoryItem: { findFirst: jest.fn().mockResolvedValue({ id: 'item-a' }) },
        $transaction: jest.fn(async (callback: any) => callback(tx)),
      } as any,
      auditLog as any,
    );

    const result = await service.createReceipt(receivingCtx, {
      documentNumber: 'NF-10',
      items: [{ stockItemId: 'item-a', quantityReceived: 2, unitOfMeasure: 'KG', unitCost: 7 }],
    });

    expect(result).toEqual(receipt);
    expect(tx.purchaseReceipt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'RECEIVED',
          branchId: 'branch-a',
          companyId: 'company-a',
          receivedAt: expect.any(Date),
        }),
        include: { items: true },
      }),
    );
    expect(tx.inventoryStockBalance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { quantity: { increment: 2 } },
        create: expect.objectContaining({ quantity: 2, stockItemId: 'item-a' }),
      }),
    );
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stockItemId: 'item-a',
          type: 'IN',
          quantity: 2,
          unitCost: 7,
          totalCost: 14,
          sourceType: 'PURCHASE_RECEIPT',
          sourceId: 'receipt-a',
        }),
      }),
    );
    expect(tx.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: 'item-a' },
      data: { averageCost: 5.4 },
    });
    expect(tx.averageCostHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stockItemId: 'item-a',
          previousCost: 5,
          newCost: 5.4,
          sourceType: 'PURCHASE_RECEIPT',
          sourceId: 'receipt-a',
        }),
      }),
    );
    expect(auditLog.recordFromContext).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ stockLinkedItems: 1 }),
      }),
    );
  });
});
