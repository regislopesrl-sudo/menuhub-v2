import { RecipesController } from './recipes.controller';

describe('RecipesController', () => {
  const service = {
    listCompanyRecipes: jest.fn(),
    getRecipeById: jest.fn(),
    createRecipe: jest.fn(),
    updateRecipe: jest.fn(),
    replaceRecipeItems: jest.fn(),
  };
  const controller = new RecipesController(service as never);
  const ctx = { companyId: 'c1', userRole: 'admin', requestId: 'r1' } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lista fichas tecnicas por empresa', async () => {
    service.listCompanyRecipes.mockResolvedValueOnce([]);
    await controller.listRecipes(ctx);
    expect(service.listCompanyRecipes).toHaveBeenCalledWith(ctx);
  });

  it('cria ficha tecnica', async () => {
    service.createRecipe.mockResolvedValueOnce({ id: 'r1' });
    await controller.createRecipe(ctx, {
      name: 'Pizza',
      type: 'SALE',
      yieldQuantity: 1,
      yieldUnit: 'un',
      items: [{ stockItemId: 's1', quantity: 1, unit: 'un' }],
    });
    expect(service.createRecipe).toHaveBeenCalled();
  });
});

