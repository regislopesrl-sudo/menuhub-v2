import { RecipesController } from './recipes.controller';

describe('RecipesController', () => {
  const service = {
    list: jest.fn(),
    getById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    addItem: jest.fn(),
    updateItem: jest.fn(),
  };
  const controller = new RecipesController(service as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lista receitas da company atual', async () => {
    service.list.mockResolvedValueOnce([]);
    await controller.list({ companyId: 'c1', userRole: 'admin', requestId: 'r1', permissions: ['catalog.read'] });
    expect(service.list).toHaveBeenCalledWith('c1');
  });

  it('cria receita na company atual', async () => {
    service.create.mockResolvedValueOnce({ id: 'r1' });
    await controller.create(
      { companyId: 'c1', userRole: 'admin', requestId: 'r1', permissions: ['catalog.manage'] },
      { name: 'Molho', type: 'PRODUCTION', yieldQuantity: 2, yieldUnit: 'L' },
    );
    expect(service.create).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ name: 'Molho', type: 'PRODUCTION' }),
    );
  });
});
