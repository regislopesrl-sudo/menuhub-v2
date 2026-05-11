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
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    order: {
      findFirst: jest.fn(),
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
        order: prisma.order,
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

  it('consome lotes em ordem FEFO na saida manual', async () => {
    prisma.stockItem.findUnique.mockResolvedValue({
      id: 's1',
      companyId: 'company-demo',
      currentQuantity: 10,
      allowNegativeStock: false,
      controlsBatch: true,
      requiresFefo: true,
    });
    prisma.stockBatch.findMany.mockResolvedValue([
      {
        id: 'b-new',
        quantityRemaining: 8,
        expirationDate: new Date('2026-06-01T00:00:00.000Z'),
        receivedDate: new Date('2026-05-01T00:00:00.000Z'),
        unitCost: 5,
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
      },
      {
        id: 'b-old',
        quantityRemaining: 3,
        expirationDate: new Date('2026-05-20T00:00:00.000Z'),
        receivedDate: new Date('2026-05-01T00:00:00.000Z'),
        unitCost: 4,
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
      },
    ]);
    prisma.stockItem.update.mockResolvedValue({ id: 's1', currentQuantity: 5 });
    prisma.stockMovement.create
      .mockResolvedValueOnce({ id: 'm-old', batchId: 'b-old' })
      .mockResolvedValueOnce({ id: 'm-new', batchId: 'b-new' });

    const result = await service.manualExit(ctx, { stockItemId: 's1', quantity: 5 });

    expect(result.movements).toHaveLength(2);
    expect(prisma.stockBatch.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'b-old' },
      data: { quantityRemaining: 0, status: 'EXHAUSTED' },
    });
    expect(prisma.stockBatch.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'b-new' },
      data: { quantityRemaining: 6, status: 'OPENED' },
    });
    expect(prisma.stockMovement.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({ batchId: 'b-old', quantity: 3, unitCost: 4, totalCost: 12 }),
    });
    expect(prisma.stockMovement.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({ batchId: 'b-new', quantity: 2, unitCost: 5, totalCost: 10 }),
    });
  });

  it('bloqueia saida FEFO quando lotes nao cobrem quantidade', async () => {
    prisma.stockItem.findUnique.mockResolvedValue({
      id: 's1',
      companyId: 'company-demo',
      currentQuantity: 10,
      allowNegativeStock: false,
      controlsBatch: true,
      requiresFefo: true,
    });
    prisma.stockBatch.findMany.mockResolvedValue([{ id: 'b1', quantityRemaining: 1, unitCost: 2, createdAt: new Date() }]);
    prisma.stockItem.update.mockResolvedValue({ id: 's1', currentQuantity: 5 });

    await expect(service.manualExit(ctx, { stockItemId: 's1', quantity: 5 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('respeita lote escolhido na saida manual quando informado', async () => {
    prisma.stockItem.findUnique.mockResolvedValue({
      id: 's1',
      companyId: 'company-demo',
      currentQuantity: 10,
      allowNegativeStock: false,
      controlsBatch: true,
      requiresFefo: true,
    });
    prisma.stockBatch.findMany.mockResolvedValue([
      { id: 'b-selected', quantityRemaining: 4, unitCost: 6, createdAt: new Date() },
    ]);
    prisma.stockItem.update.mockResolvedValue({ id: 's1', currentQuantity: 8 });
    prisma.stockMovement.create.mockResolvedValue({ id: 'm1', batchId: 'b-selected' });

    await service.manualExit(ctx, { stockItemId: 's1', quantity: 2, batchId: 'b-selected' });

    expect(prisma.stockBatch.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'b-selected' }),
    }));
    expect(prisma.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ batchId: 'b-selected', quantity: 2, unitCost: 6 }),
    });
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

  it('coloca lote em quarentena sem baixar saldo', async () => {
    prisma.stockBatch.findUnique.mockResolvedValue({
      id: 'b1',
      stockItemId: 's1',
      branchId: 'branch-demo',
      quantityRemaining: 4,
      sanitaryNotes: null,
      stockItem: { id: 's1', companyId: 'company-demo', currentQuantity: 10, allowNegativeStock: false },
    });
    prisma.stockBatch.update.mockResolvedValue({ id: 'b1', status: 'QUARANTINED' });

    const result = await service.updateBatchStatus(ctx, {
      stockItemId: 's1',
      batchId: 'b1',
      status: 'QUARANTINED',
      notes: 'Analise sanitaria',
    });

    expect(result).toEqual({ id: 'b1', status: 'QUARANTINED' });
    expect(prisma.stockItem.update).not.toHaveBeenCalled();
    expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    expect(prisma.stockBatch.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { status: 'QUARANTINED', sanitaryNotes: 'Analise sanitaria' },
    });
  });

  it('descarta lote e gera baixa operacional com movimento', async () => {
    prisma.stockBatch.findUnique.mockResolvedValue({
      id: 'b1',
      stockItemId: 's1',
      branchId: 'branch-demo',
      quantityRemaining: 4,
      unitCost: 3,
      sanitaryNotes: null,
      stockItem: { id: 's1', companyId: 'company-demo', currentQuantity: 10, allowNegativeStock: false },
    });
    prisma.stockBatch.update.mockResolvedValue({ id: 'b1', status: 'DISCARDED', quantityRemaining: 0 });
    prisma.stockItem.update.mockResolvedValue({ id: 's1', currentQuantity: 6 });
    prisma.stockMovement.create.mockResolvedValue({ id: 'm1' });

    const result = await service.updateBatchStatus(ctx, {
      stockItemId: 's1',
      batchId: 'b1',
      status: 'DISCARDED',
      notes: 'Embalagem violada',
    });

    expect(result).toEqual({ batch: { id: 'b1', status: 'DISCARDED', quantityRemaining: 0 }, item: { id: 's1', currentQuantity: 6 } });
    expect(prisma.stockBatch.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { quantityRemaining: 0, status: 'DISCARDED', sanitaryNotes: 'Embalagem violada' },
    });
    expect(prisma.stockItem.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { currentQuantity: 6 },
    });
    expect(prisma.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        batchId: 'b1',
        movementType: 'LOSS',
        movementTypeDetailed: 'batch_discard_writeoff',
        quantity: 4,
        unitCost: 3,
        totalCost: 12,
      }),
    });
  });

  it('baixa estoque por venda usando lote FEFO', async () => {
    prisma.stockMovement.findFirst.mockResolvedValue(null);
    prisma.order.findFirst.mockResolvedValue({
      id: 'order-1',
      items: [
        {
          id: 'oi-1',
          quantity: 2,
          product: {
            controlsStock: true,
            recipe: { items: [{ stockItemId: 's1', quantity: 1.5 }] },
          },
        },
      ],
    });
    prisma.stockItem.findUnique.mockResolvedValue({
      id: 's1',
      companyId: 'company-demo',
      currentQuantity: 10,
      averageCost: 3,
      allowNegativeStock: false,
      controlsBatch: true,
      requiresFefo: true,
    });
    prisma.stockBatch.findMany.mockResolvedValue([
      { id: 'b1', quantityRemaining: 5, expirationDate: new Date('2026-05-20T00:00:00.000Z'), unitCost: 3, createdAt: new Date() },
    ]);
    prisma.stockItem.update.mockResolvedValue({ id: 's1', currentQuantity: 7, averageCost: 3 });
    prisma.stockMovement.create.mockResolvedValue({ id: 'm1' });

    const result = await service.consumeByOrder(ctx, 'order-1');

    expect(result).toEqual({ orderId: 'order-1', consumed: true, movementsCreated: 1 });
    expect(prisma.stockBatch.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { quantityRemaining: 2, status: 'OPENED' },
    });
    expect(prisma.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ batchId: 'b1', movementType: 'SALE_CONSUMPTION', quantity: 3 }),
    });
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
