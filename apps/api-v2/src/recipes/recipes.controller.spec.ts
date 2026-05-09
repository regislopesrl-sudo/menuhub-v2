import { RecipesController } from './recipes.controller';

describe('RecipesController', () => {
  const service = {
    listCompanyRecipes: jest.fn(),
    getRecipeById: jest.fn(),
    createRecipe: jest.fn(),
    updateRecipe: jest.fn(),
    replaceRecipeItems: jest.fn(),
    listProductCompositions: jest.fn(),
    getProductComposition: jest.fn(),
    setProductRecipe: jest.fn(),
    estimateRecipePortioning: jest.fn(),
    getRecipeCostBreakdown: jest.fn(),
    getProductSoldCost: jest.fn(),
    listProductionOrders: jest.fn(),
    createProductionOrder: jest.fn(),
    startProductionOrder: jest.fn(),
    finishProductionOrder: jest.fn(),
    cancelProductionOrder: jest.fn(),
    listProductionLosses: jest.fn(),
    registerProductionLoss: jest.fn(),
    previewRecipeSubstitution: jest.fn(),
    applyRecipeSubstitution: jest.fn(),
    listProductMargins: jest.fn(),
  };
  const controller = new RecipesController(service as never);
  const ctx = { companyId: 'c1', branchId: 'b1', userRole: 'admin', requestId: 'r1' } as any;

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

  it('lista composicao por produto', async () => {
    service.listProductCompositions.mockResolvedValueOnce([]);
    await controller.listProductCompositions(ctx);
    expect(service.listProductCompositions).toHaveBeenCalledWith(ctx);
  });

  it('atualiza vinculacao produto x receita', async () => {
    service.setProductRecipe.mockResolvedValueOnce({ productId: 'p1', recipeId: 'r1' });
    await controller.patchProductComposition(ctx, 'p1', { recipeId: 'r1' });
    expect(service.setProductRecipe).toHaveBeenCalledWith(ctx, 'p1', 'r1');
  });

  it('estima porcionamento da ficha tecnica', async () => {
    service.estimateRecipePortioning.mockResolvedValueOnce({ portionsCount: 4 });
    await controller.estimatePortioning(ctx, 'r1', { portionQuantity: 0.25, portionUnit: 'kg' });
    expect(service.estimateRecipePortioning).toHaveBeenCalledWith(ctx, 'r1', {
      portionQuantity: 0.25,
      portionUnit: 'kg',
    });
  });

  it('retorna breakdown de custo da ficha tecnica', async () => {
    service.getRecipeCostBreakdown.mockResolvedValueOnce({ summary: { totalCost: 10 } });
    await controller.getRecipeCostBreakdown(ctx, 'r1');
    expect(service.getRecipeCostBreakdown).toHaveBeenCalledWith(ctx, 'r1');
  });

  it('retorna custo por produto vendido', async () => {
    service.getProductSoldCost.mockResolvedValueOnce({ productId: 'p1', cost: { soldCost: 12 } });
    await controller.getProductSoldCost(ctx, 'p1', '1');
    expect(service.getProductSoldCost).toHaveBeenCalledWith(ctx, 'p1', { portionQuantity: 1 });
  });

  it('cria ordem de producao interna', async () => {
    service.createProductionOrder.mockResolvedValueOnce({ id: 'po1' });
    await controller.createProductionOrder(ctx, { stockItemId: 's1', recipeId: 'r1', plannedQuantity: 10 });
    expect(service.createProductionOrder).toHaveBeenCalledWith(ctx, {
      stockItemId: 's1',
      recipeId: 'r1',
      plannedQuantity: 10,
    });
  });

  it('finaliza ordem de producao', async () => {
    service.finishProductionOrder.mockResolvedValueOnce({ id: 'po1', status: 'FINISHED' });
    await controller.finishProductionOrder(ctx, 'po1', { actualQuantity: 9.5 });
    expect(service.finishProductionOrder).toHaveBeenCalledWith(ctx, 'po1', 9.5);
  });

  it('registra perda de preparo', async () => {
    service.registerProductionLoss.mockResolvedValueOnce({ id: 'loss1' });
    await controller.registerProductionLoss(ctx, 'po1', { quantity: 1.5, reason: 'Queima no forno' });
    expect(service.registerProductionLoss).toHaveBeenCalledWith(ctx, 'po1', 1.5, 'Queima no forno');
  });

  it('gera preview de substituicao de insumo', async () => {
    service.previewRecipeSubstitution.mockResolvedValueOnce({ impact: { deltaTotalCost: 2 } });
    await controller.previewRecipeSubstitution(ctx, 'r1', {
      fromStockItemId: 's-old',
      toStockItemId: 's-new',
      quantityRatio: 1.1,
    });
    expect(service.previewRecipeSubstitution).toHaveBeenCalledWith(ctx, 'r1', 's-old', 's-new', 1.1);
  });

  it('lista margem por produto com filtro opcional', async () => {
    service.listProductMargins.mockResolvedValueOnce({ summary: { total: 0 }, items: [] });
    await controller.listProductMargins(ctx, '30');
    expect(service.listProductMargins).toHaveBeenCalledWith(ctx, { minMarginPercent: 30 });
  });
});

