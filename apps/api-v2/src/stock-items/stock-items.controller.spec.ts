import { StockItemsController } from './stock-items.controller';

describe('StockItemsController', () => {
  const service = {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const controller = new StockItemsController(service as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lista insumos da company atual', async () => {
    service.list.mockResolvedValueOnce([]);
    await controller.list({
      companyId: 'c1',
      userRole: 'admin',
      requestId: 'r1',
      permissions: ['catalog.read'],
    });
    expect(service.list).toHaveBeenCalledWith('c1');
  });

  it('cria insumo na company atual', async () => {
    service.create.mockResolvedValueOnce({ id: 's1' });
    await controller.create(
      { companyId: 'c1', userRole: 'admin', requestId: 'r1', permissions: ['catalog.manage'] },
      { name: 'Tomate' },
    );
    expect(service.create).toHaveBeenCalledWith('c1', expect.objectContaining({ name: 'Tomate' }));
  });
});
