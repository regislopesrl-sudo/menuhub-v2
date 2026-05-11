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
    stockBatch: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
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
        stockBatch: prisma.stockBatch,
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

  it('recebe pedido e vincula lote operacional ao estoque', async () => {
    prisma.purchaseOrder.findUnique.mockResolvedValue({
      id: 'po1',
      branchId: 'branch-demo',
      supplierId: 'sup1',
      supplier: { id: 'sup1', companyId: 'company-demo' },
      items: [{ stockItemId: 'st1', quantity: 3 }],
    });
    prisma.goodsReceipt.create.mockResolvedValue({ id: 'gr1' });
    prisma.stockItem.findUnique.mockResolvedValue({
      id: 'st1',
      companyId: 'company-demo',
      currentQuantity: 2,
      controlsExpiry: false,
    });
    prisma.stockBatch.findFirst.mockResolvedValue(null);
    prisma.stockBatch.create.mockResolvedValue({ id: 'batch-1' });
    prisma.stockItem.update.mockResolvedValue({ id: 'st1', currentQuantity: 5 });
    prisma.stockMovement.create.mockResolvedValue({ id: 'mov1' });
    prisma.accountsPayable.create.mockResolvedValue({ id: 'ap1' });
    prisma.purchaseOrder.update.mockResolvedValue({ id: 'po1', status: 'RECEIVED' });

    const result = await service.receivePurchaseOrder(ctx, 'po1', {
      items: [{
        stockItemId: 'st1',
        receivedQuantity: 3,
        unitCost: 7,
        orderedQuantity: 3,
        batchNumber: 'L-001',
        expirationDate: '2026-06-30',
      }],
    });

    expect(result).toEqual(expect.objectContaining({ receiptId: 'gr1', payableId: 'ap1', hasDivergence: false, totalReceived: 21 }));
    expect(prisma.stockBatch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stockItemId: 'st1',
        branchId: 'branch-demo',
        supplierId: 'sup1',
        batchNumber: 'L-001',
        quantityRemaining: 3,
        unitCost: 7,
      }),
    });
    expect(prisma.goodsReceiptItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ batchId: 'batch-1', batchNumber: 'L-001' }),
    });
    expect(prisma.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ batchId: 'batch-1', movementType: 'ENTRY', movementTypeDetailed: 'purchase_receipt_entry' }),
    });
  });
});

