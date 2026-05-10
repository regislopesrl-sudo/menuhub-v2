import { StockController } from './stock.controller';

describe('StockController', () => {
  const service = {
    listItems: jest.fn(),
    createItem: jest.fn(),
    updateItem: jest.fn(),
    listMovements: jest.fn(),
    manualEntry: jest.fn(),
    manualExit: jest.fn(),
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
});
