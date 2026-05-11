import { BadRequestException } from '@nestjs/common';
import { StockService } from './stock.service';

describe('StockService', () => {
  const ctx = {
    companyId: 'company-demo',
    branchId: 'branch-demo',
    requestId: 'req-1',
    userRole: 'owner' as const,
    userId: 'user-1',
  };

  const prisma = {
    stockItem: {
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    stockMovement: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    stockLocationBalance: {
      upsert: jest.fn(),
    },
    stockBatch: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  } as any;

  const service = new StockService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (cb: any) =>
      cb({
        stockItem: prisma.stockItem,
        stockMovement: prisma.stockMovement,
        stockLocationBalance: prisma.stockLocationBalance,
        stockBatch: prisma.stockBatch,
      }),
    );
    prisma.stockBatch.findMany.mockResolvedValue([]);
  });

  it('cria item com name obrigatorio', async () => {
    prisma.stockItem.create.mockResolvedValue({ id: 's1' });
    await service.createItem(ctx, {
      name: 'Farinha',
      code: 'FAR-001',
      stockUnit: 'kg',
      purchaseUnit: 'sc',
      productionUnit: 'g',
      conversionFactor: 25,
      minimumQuantity: 5,
      reorderPoint: 10,
      leadTimeDays: 3,
      controlsBatch: true,
      controlsExpiry: true,
      requiresFefo: true,
      isPerishable: true,
      isFractionable: true,
      isCritical: true,
      isHighTurnover: true,
    });
    expect(prisma.stockItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        code: 'FAR-001',
        purchaseUnit: 'sc',
        productionUnit: 'g',
        conversionFactor: 25,
        minimumQuantity: 5,
        reorderPoint: 10,
        leadTimeDays: 3,
        controlsBatch: true,
        controlsExpiry: true,
        requiresFefo: true,
        isPerishable: true,
        isFractionable: true,
        isCritical: true,
        isHighTurnover: true,
      }),
    }));
  });

  it('bloqueia item sem nome', async () => {
    await expect(service.createItem(ctx, { name: '' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('faz entrada manual e atualiza saldo', async () => {
    prisma.stockItem.findUnique.mockResolvedValue({ id: 's1', companyId: 'company-demo', currentQuantity: 10, allowNegativeStock: false });
    prisma.stockItem.update.mockResolvedValue({ id: 's1', currentQuantity: 15 });
    prisma.stockMovement.create.mockResolvedValue({ id: 'm1', movementType: 'ENTRY' });

    const result = await service.manualEntry(ctx, { stockItemId: 's1', quantity: 5, unitCost: 2 });
    expect(result.movement.id).toBe('m1');
    expect(prisma.stockItem.update).toHaveBeenCalled();
    expect(prisma.stockLocationBalance.upsert).toHaveBeenCalled();
  });

  it('bloqueia saida sem estoque quando nao permite negativo', async () => {
    prisma.stockItem.findUnique.mockResolvedValue({ id: 's1', companyId: 'company-demo', currentQuantity: 1, allowNegativeStock: false });
    await expect(service.manualExit(ctx, { stockItemId: 's1', quantity: 5 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('aplica inventario e gera ajuste quando ha diferenca', async () => {
    prisma.stockItem.findUnique.mockResolvedValue({ id: 's1', companyId: 'company-demo', currentQuantity: 10, averageCost: 3 });
    prisma.stockItem.update.mockResolvedValue({ id: 's1', currentQuantity: 8, averageCost: 3 });
    prisma.stockMovement.create.mockResolvedValue({ id: 'adj1' });
    const result = await service.applyInventoryCount(ctx, {
      counts: [{ stockItemId: 's1', countedQuantity: 8 }],
    });
    expect(result.changedItems).toBe(1);
    expect(prisma.stockMovement.create).toHaveBeenCalled();
  });

  it('ignora nova baixa automatica se pedido ja consumido', async () => {
    prisma.stockMovement.findFirst.mockResolvedValue({ id: 'm1' });
    const result = await service.consumeByOrder(ctx, 'order-1');
    expect(result).toEqual({ orderId: 'order-1', consumed: false, reason: 'already_consumed' });
  });

  it('gera alertas de ruptura', async () => {
    prisma.stockItem.findMany.mockResolvedValue([
      { id: 's1', name: 'A', stockUnit: 'kg', currentQuantity: 0, minimumQuantity: 2, reorderPoint: 5, isCritical: false },
      { id: 's2', name: 'B', stockUnit: 'kg', currentQuantity: 3, minimumQuantity: 4, reorderPoint: 10, isCritical: false },
    ]);
    const alerts = await service.listBreakageAlerts(ctx);
    expect(alerts.length).toBe(2);
    expect(alerts[0].type).toBe('stockout');
  });

  it('gera alertas de validade de lote', async () => {
    prisma.stockItem.findMany.mockResolvedValue([]);
    prisma.stockBatch.findMany.mockResolvedValue([
      {
        id: 'b1',
        stockItemId: 's1',
        batchNumber: 'L-001',
        expirationDate: new Date('2026-05-10T00:00:00.000Z'),
        quantityRemaining: 2,
        stockItem: {
          name: 'Queijo',
          stockUnit: 'kg',
          minimumQuantity: 1,
          reorderPoint: 2,
          isCritical: false,
        },
      },
    ]);
    const alerts = await service.listBreakageAlerts(ctx);
    expect(alerts).toEqual([
      expect.objectContaining({
        stockItemId: 's1',
        batchId: 'b1',
        batchNumber: 'L-001',
        type: 'batch_expired',
        severity: 'critical',
      }),
    ]);
  });

  it('bloqueia dados invalidos de item premium', async () => {
    await expect(service.createItem(ctx, { name: 'Farinha', conversionFactor: 0 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createItem(ctx, { name: 'Farinha', minimumQuantity: -1 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createItem(ctx, { name: 'Farinha', leadTimeDays: 1.5 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cria lote e gera movimento de entrada', async () => {
    prisma.stockItem.findUnique.mockResolvedValue({ id: 's1', companyId: 'company-demo', currentQuantity: 2, averageCost: 3 });
    prisma.stockBatch.create.mockResolvedValue({ id: 'b1', stockItemId: 's1' });
    prisma.stockItem.update.mockResolvedValue({ id: 's1' });
    prisma.stockMovement.create.mockResolvedValue({ id: 'm1' });

    const result = await service.createBatch(ctx, { stockItemId: 's1', initialQuantity: 5, unitCost: 4 });
    expect(result.id).toBe('b1');
    expect(prisma.stockBatch.create).toHaveBeenCalled();
    expect(prisma.stockMovement.create).toHaveBeenCalled();
  });

  it('lista lotes do item', async () => {
    prisma.stockItem.findUnique.mockResolvedValue({ id: 's1', companyId: 'company-demo' });
    prisma.stockBatch.findMany.mockResolvedValue([{ id: 'b1' }]);
    const batches = await service.listBatches(ctx, 's1');
    expect(batches).toEqual([{ id: 'b1' }]);
  });

  it('estima conversao entre unidades', async () => {
    prisma.stockItem.findUnique.mockResolvedValue({
      id: 's1',
      companyId: 'company-demo',
      purchaseUnit: 'cx',
      stockUnit: 'un',
      productionUnit: 'un',
      conversionFactor: 12,
    });

    const result = await service.estimateUnitConversion(ctx, {
      stockItemId: 's1',
      quantity: 2,
      fromUnit: 'cx',
      toUnit: 'un',
    });
    expect(result.convertedQuantity).toBe(24);
  });
});
