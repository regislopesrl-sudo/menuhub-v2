import { StockController } from './stock.controller';

describe('StockController', () => {
  const service = {
    listItems: jest.fn(),
    createItem: jest.fn(),
    updateItem: jest.fn(),
    listMovements: jest.fn(),
    manualEntry: jest.fn(),
    manualExit: jest.fn(),
    applyInventoryCount: jest.fn(),
    listBatches: jest.fn(),
    createBatch: jest.fn(),
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
    expect(service.listItems).toHaveBeenCalledWith(ctx);
  });

  it('registra entrada manual', async () => {
    service.manualEntry.mockResolvedValueOnce({ movement: { id: 'm1' } });
    const payload = { stockItemId: 's1', quantity: 2 };
    const result = await controller.manualEntry(ctx, payload);
    expect(result).toEqual({ movement: { id: 'm1' } });
    expect(service.manualEntry).toHaveBeenCalledWith(ctx, payload);
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

  it('estima conversao de unidade', async () => {
    const payload = { stockItemId: 's1', quantity: 2, fromUnit: 'cx', toUnit: 'un' };
    service.estimateUnitConversion.mockResolvedValueOnce({ convertedQuantity: 24 });
    const result = await controller.estimateConversion(ctx, payload);
    expect(result).toEqual({ convertedQuantity: 24 });
    expect(service.estimateUnitConversion).toHaveBeenCalledWith(ctx, payload);
  });
});
