import { StockController } from './stock.controller';

describe('StockController', () => {
  const service = {
    getDashboard: jest.fn(),
    listCategories: jest.fn(),
    createCategory: jest.fn(),
    updateCategory: jest.fn(),
    updateCategoryStatus: jest.fn(),
    listItems: jest.fn(),
    createItem: jest.fn(),
    getItem: jest.fn(),
    updateItem: jest.fn(),
    updateItemStatus: jest.fn(),
    listMovements: jest.fn(),
    manualEntry: jest.fn(),
    manualExit: jest.fn(),
    applyInventoryCount: jest.fn(),
    applyBatchInventoryCount: jest.fn(),
    listBatches: jest.fn(),
    createBatch: jest.fn(),
    updateBatchStatus: jest.fn(),
    estimateUnitConversion: jest.fn(),
    listBreakageAlerts: jest.fn(),
    registerLoss: jest.fn(),
  };

  const controller = new StockController(service as any);
  const ctx = { companyId: 'c1', branchId: 'b1', userRole: 'owner', requestId: 'r1' } as any;

  beforeEach(() => jest.clearAllMocks());

  it('lista itens', async () => {
    service.listItems.mockResolvedValueOnce([{ id: 's1' }]);
    const result = await controller.listItems(ctx);
    expect(result).toEqual([{ id: 's1' }]);
    expect(service.listItems).toHaveBeenCalledWith(ctx, { includeInactive: false });
  });

  it('lista categorias de estoque', async () => {
    service.listCategories.mockResolvedValueOnce([{ id: 'cat-1' }]);
    const result = await controller.listCategories(ctx);
    expect(result).toEqual([{ id: 'cat-1' }]);
    expect(service.listCategories).toHaveBeenCalledWith(ctx, { includeInactive: false });
  });

  it('cria categoria de estoque', async () => {
    const payload = { name: 'Hortifruti', sortOrder: 1 };
    service.createCategory.mockResolvedValueOnce({ id: 'cat-1' });
    const result = await controller.createCategory(ctx, payload);
    expect(result).toEqual({ id: 'cat-1' });
    expect(service.createCategory).toHaveBeenCalledWith(ctx, payload);
  });

  it('retorna dashboard de estoque', async () => {
    service.getDashboard.mockResolvedValueOnce({ totalItems: 1 });
    const result = await controller.getDashboard(ctx);
    expect(result).toEqual({ totalItems: 1 });
  });

  it('registra entrada manual', async () => {
    service.manualEntry.mockResolvedValueOnce({ movement: { id: 'm1' } });
    const payload = { stockItemId: 's1', quantity: 2 };
    const result = await controller.manualEntry(ctx, payload);
    expect(result).toEqual({ movement: { id: 'm1' } });
    expect(service.manualEntry).toHaveBeenCalledWith(ctx, payload);
  });

  it('busca detalhe do item', async () => {
    service.getItem.mockResolvedValueOnce({ id: 's1' });
    const result = await controller.getItem(ctx, 's1');
    expect(result).toEqual({ id: 's1' });
    expect(service.getItem).toHaveBeenCalledWith(ctx, 's1');
  });

  it('altera status do item', async () => {
    service.updateItemStatus.mockResolvedValueOnce({ id: 's1', isActive: false });
    const result = await controller.updateItemStatus(ctx, 's1', { isActive: false });
    expect(result).toEqual({ id: 's1', isActive: false });
    expect(service.updateItemStatus).toHaveBeenCalledWith(ctx, 's1', { isActive: false });
  });

  it('aplica inventario', async () => {
    service.applyInventoryCount.mockResolvedValueOnce({ changedItems: 1 });
    const payload = { counts: [{ stockItemId: 's1', countedQuantity: 3 }] };
    const result = await controller.applyInventoryCount(ctx, payload);
    expect(result).toEqual({ changedItems: 1 });
    expect(service.applyInventoryCount).toHaveBeenCalledWith(ctx, payload);
  });

  it('lista alertas de ruptura', async () => {
    service.listBreakageAlerts.mockResolvedValueOnce([{ stockItemId: 's1' }]);
    const result = await controller.listBreakageAlerts(ctx);
    expect(result).toEqual([{ stockItemId: 's1' }]);
  });

  it('lista lotes de item', async () => {
    service.listBatches.mockResolvedValueOnce([{ id: 'b1' }]);
    const result = await controller.listBatches(ctx, 's1');
    expect(result).toEqual([{ id: 'b1' }]);
    expect(service.listBatches).toHaveBeenCalledWith(ctx, 's1');
  });

  it('cria lote de item', async () => {
    const payload = { initialQuantity: 4, unitCost: 2 };
    service.createBatch.mockResolvedValueOnce({ id: 'b1' });
    const result = await controller.createBatch(ctx, 's1', payload as any);
    expect(result).toEqual({ id: 'b1' });
    expect(service.createBatch).toHaveBeenCalledWith(ctx, { ...payload, stockItemId: 's1' });
  });

  it('aplica inventario por lote', async () => {
    service.applyBatchInventoryCount.mockResolvedValueOnce({ batchId: 'b1', delta: -1 });
    const payload = { stockItemId: 's1', batchId: 'b1', countedQuantity: 2 };
    const result = await controller.applyBatchInventoryCount(ctx, payload);
    expect(result).toEqual({ batchId: 'b1', delta: -1 });
    expect(service.applyBatchInventoryCount).toHaveBeenCalledWith(ctx, payload);
  });

  it('lista movimentos com filtros premium', async () => {
    service.listMovements.mockResolvedValueOnce([{ id: 'm1' }]);
    const result = await controller.listMovements(ctx, 's1', 'b1', 'ENTRY', '2026-05-01', '2026-05-11');
    expect(result).toEqual([{ id: 'm1' }]);
    expect(service.listMovements).toHaveBeenCalledWith(ctx, {
      stockItemId: 's1',
      batchId: 'b1',
      movementType: 'ENTRY',
      from: '2026-05-01',
      to: '2026-05-11',
    });
  });

  it('atualiza status operacional de lote', async () => {
    service.updateBatchStatus.mockResolvedValueOnce({ batch: { id: 'b1', status: 'QUARANTINED' } });
    const result = await controller.updateBatchStatus(ctx, 's1', 'b1', { status: 'QUARANTINED', notes: 'Analise sanitaria' });
    expect(result).toEqual({ batch: { id: 'b1', status: 'QUARANTINED' } });
    expect(service.updateBatchStatus).toHaveBeenCalledWith(ctx, {
      stockItemId: 's1',
      batchId: 'b1',
      status: 'QUARANTINED',
      notes: 'Analise sanitaria',
    });
  });

  it('estima conversao de unidade', async () => {
    const payload = { stockItemId: 's1', quantity: 2, fromUnit: 'cx', toUnit: 'un' };
    service.estimateUnitConversion.mockResolvedValueOnce({ convertedQuantity: 24 });
    const result = await controller.estimateConversion(ctx, payload);
    expect(result).toEqual({ convertedQuantity: 24 });
    expect(service.estimateUnitConversion).toHaveBeenCalledWith(ctx, payload);
  });
});
