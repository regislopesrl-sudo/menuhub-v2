import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProcurementService } from './procurement.service';

describe('ProcurementService', () => {
  const prisma = {
    supplier: { findMany: jest.fn(), create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    purchaseOrder: { findMany: jest.fn(), create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    goodsReceipt: { findMany: jest.fn(), create: jest.fn(), findUnique: jest.fn() },
    goodsReceiptItem: { create: jest.fn(), findMany: jest.fn() },
    purchaseOrderItem: { findMany: jest.fn() },
    stockItem: { findUnique: jest.fn(), update: jest.fn() },
    stockLocationBalance: { upsert: jest.fn() },
    stockMovement: { create: jest.fn() },
    accountsPayable: { create: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(),
  } as any;
  const service = new ProcurementService(prisma);
  const ctx = { companyId: 'company-demo', branchId: 'branch-demo', userId: 'u1', requestId: 'r1' } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (cb: any) =>
      cb({
        goodsReceipt: prisma.goodsReceipt,
        goodsReceiptItem: prisma.goodsReceiptItem,
        stockItem: prisma.stockItem,
        stockLocationBalance: prisma.stockLocationBalance,
        stockMovement: prisma.stockMovement,
        accountsPayable: prisma.accountsPayable,
        purchaseOrder: prisma.purchaseOrder,
      }),
    );
  });

  it('cria fornecedor com nome obrigatorio', async () => {
    prisma.supplier.create.mockResolvedValue({ id: 's1' });
    const created = await service.createSupplier(ctx, { name: 'Fornecedor A' });
    expect(created.id).toBe('s1');
  });

  it('bloqueia fornecedor sem nome', async () => {
    await expect(service.createSupplier(ctx, { name: '' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cria pedido de compra', async () => {
    prisma.supplier.findUnique.mockResolvedValue({ id: 'sup1', companyId: 'company-demo' });
    prisma.purchaseOrder.create.mockResolvedValue({ id: 'po1' });
    const created = await service.createPurchaseOrder(ctx, {
      supplierId: 'sup1',
      items: [{ stockItemId: 'st1', quantity: 2, unitCost: 10 }],
    });
    expect(created.id).toBe('po1');
  });

  it('bloqueia pedido com fornecedor fora da empresa', async () => {
    prisma.supplier.findUnique.mockResolvedValue({ id: 'sup1', companyId: 'other' });
    await expect(
      service.createPurchaseOrder(ctx, { supplierId: 'sup1', items: [{ stockItemId: 'st1', quantity: 1, unitCost: 1 }] }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

