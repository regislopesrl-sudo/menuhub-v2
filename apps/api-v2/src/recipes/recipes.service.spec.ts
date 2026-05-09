import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RecipesService } from './recipes.service';

describe('RecipesService', () => {
  const ctx = { companyId: 'c1', branchId: 'b1', userId: 'u1', userRole: 'admin', requestId: 'r1' } as any;

  function createService() {
    const prisma = {
      recipe: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      recipeItem: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      stockItem: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      product: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      productionOrder: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      stockMovement: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    } as any;

    return { prisma, service: new RecipesService(prisma) };
  }

  it('cria ficha tecnica e calcula custo', async () => {
    const { service, prisma } = createService();
    prisma.stockItem.findMany.mockResolvedValue([{ id: 's1' }]);
    prisma.recipe.create.mockResolvedValue({
      id: 'r1',
      companyId: 'c1',
      name: 'Pizza',
      type: 'SALE',
      yieldQuantity: 2,
      yieldUnit: 'un',
      lossPercent: 10,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [
        {
          id: 'ri1',
          stockItemId: 's1',
          quantity: 2,
          unit: 'kg',
          optional: false,
          affectsStock: true,
          affectsCost: true,
          stockItem: { name: 'Queijo', averageCost: 5 },
        },
      ],
    });

    const result = await service.createRecipe(ctx, {
      name: 'Pizza',
      type: 'SALE',
      yieldQuantity: 2,
      yieldUnit: 'un',
      lossPercent: 10,
      items: [{ stockItemId: 's1', quantity: 2, unit: 'kg' }],
    });

    expect(result.cost.totalCost).toBeCloseTo(11);
    expect(result.cost.costPerYieldUnit).toBeCloseTo(5.5);
  });

  it('bloqueia item de outra empresa', async () => {
    const { service, prisma } = createService();
    prisma.stockItem.findMany.mockResolvedValue([]);
    await expect(
      service.createRecipe(ctx, {
        name: 'X',
        type: 'SALE',
        yieldQuantity: 1,
        yieldUnit: 'un',
        items: [{ stockItemId: 's-nope', quantity: 1, unit: 'un' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('retorna not found quando receita nao pertence a empresa', async () => {
    const { service, prisma } = createService();
    prisma.recipe.findUnique.mockResolvedValue({ id: 'r2', companyId: 'c2' });
    await expect(service.getRecipeById(ctx, 'r2')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('bloqueia vinculo com receita de outra empresa', async () => {
    const { service, prisma } = createService();
    prisma.product.findUnique.mockResolvedValueOnce({ id: 'p1', companyId: 'c1' });
    prisma.recipe.findUnique.mockResolvedValueOnce({ id: 'r2', companyId: 'c2' });
    await expect(service.setProductRecipe(ctx, 'p1', 'r2')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('retorna composicao do produto apos atualizar recipeId', async () => {
    const { service, prisma } = createService();
    prisma.product.findUnique
      .mockResolvedValueOnce({ id: 'p1', companyId: 'c1' })
      .mockResolvedValueOnce({
        id: 'p1',
        companyId: 'c1',
        name: 'Pizza',
        sku: 'PZ-1',
        recipeId: 'r1',
        recipe: {
          id: 'r1',
          companyId: 'c1',
          name: 'Ficha Pizza',
          type: 'SALE',
          yieldQuantity: 1,
          yieldUnit: 'un',
          lossPercent: null,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          items: [],
        },
      });
    prisma.recipe.findUnique.mockResolvedValueOnce({ id: 'r1', companyId: 'c1' });
    prisma.product.update.mockResolvedValueOnce({});

    const result = await service.setProductRecipe(ctx, 'p1', 'r1');
    expect(result.productId).toBe('p1');
    expect(result.recipeId).toBe('r1');
  });

  it('estima custo por porcao', async () => {
    const { service, prisma } = createService();
    prisma.recipe.findUnique.mockResolvedValueOnce({
      id: 'r1',
      companyId: 'c1',
      name: 'Molho',
      type: 'PRODUCTION',
      yieldQuantity: 2,
      yieldUnit: 'kg',
      lossPercent: 10,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [
        {
          id: 'ri1',
          stockItemId: 's1',
          quantity: 1,
          unit: 'kg',
          optional: false,
          affectsStock: true,
          affectsCost: true,
          stockItem: { name: 'Tomate', averageCost: 20 },
        },
      ],
    });

    const result = await service.estimateRecipePortioning(ctx, 'r1', { portionQuantity: 0.25, extraLossPercent: 5 });
    expect(result.portionsCount).toBeCloseTo(8);
    expect(result.cost.costPerPortion).toBeGreaterThan(0);
  });

  it('bloqueia porcionamento com quantidade invalida', async () => {
    const { service, prisma } = createService();
    prisma.recipe.findUnique.mockResolvedValueOnce({
      id: 'r1',
      companyId: 'c1',
      name: 'Molho',
      type: 'PRODUCTION',
      yieldQuantity: 2,
      yieldUnit: 'kg',
      lossPercent: 0,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [],
    });

    await expect(service.estimateRecipePortioning(ctx, 'r1', { portionQuantity: 0 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('retorna breakdown de custo ordenado por impacto', async () => {
    const { service, prisma } = createService();
    prisma.recipe.findUnique.mockResolvedValueOnce({
      id: 'r1',
      companyId: 'c1',
      name: 'Pizza',
      type: 'SALE',
      yieldQuantity: 1,
      yieldUnit: 'un',
      lossPercent: 0,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [
        {
          id: 'ri1',
          stockItemId: 's1',
          quantity: 2,
          unit: 'kg',
          optional: false,
          affectsStock: true,
          affectsCost: true,
          stockItem: { name: 'Queijo', averageCost: 10 },
        },
        {
          id: 'ri2',
          stockItemId: 's2',
          quantity: 1,
          unit: 'kg',
          optional: false,
          affectsStock: true,
          affectsCost: true,
          stockItem: { name: 'Molho', averageCost: 5 },
        },
      ],
    });

    const result = await service.getRecipeCostBreakdown(ctx, 'r1');
    expect(result.items[0].stockItemId).toBe('s1');
    expect(result.summary.grossCost).toBeCloseTo(25);
    expect(result.summary.totalCost).toBeCloseTo(25);
  });

  it('calcula custo e margem por produto vendido', async () => {
    const { service, prisma } = createService();
    prisma.product.findUnique.mockResolvedValueOnce({
      id: 'p1',
      companyId: 'c1',
      name: 'Pizza',
      salePrice: 50,
      promotionalPrice: null,
      recipe: {
        id: 'r1',
        companyId: 'c1',
        name: 'Ficha Pizza',
        type: 'SALE',
        yieldQuantity: 2,
        yieldUnit: 'un',
        lossPercent: 0,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [
          {
            id: 'ri1',
            stockItemId: 's1',
            quantity: 1,
            unit: 'kg',
            optional: false,
            affectsStock: true,
            affectsCost: true,
            stockItem: { name: 'Queijo', averageCost: 20 },
          },
        ],
      },
    });

    const result = await service.getProductSoldCost(ctx, 'p1', { portionQuantity: 1 });
    expect(result.cost.soldCost).toBeCloseTo(10);
    expect(result.margin.grossMarginValue).toBeCloseTo(40);
  });

  it('bloqueia produto sem ficha tecnica no calculo de custo vendido', async () => {
    const { service, prisma } = createService();
    prisma.product.findUnique.mockResolvedValueOnce({
      id: 'p1',
      companyId: 'c1',
      name: 'Pizza',
      salePrice: 50,
      promotionalPrice: null,
      recipe: null,
    });
    await expect(service.getProductSoldCost(ctx, 'p1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cria ordem de producao com escopo de empresa/filial', async () => {
    const { service, prisma } = createService();
    prisma.stockItem.findUnique = jest.fn().mockResolvedValueOnce({ id: 's1', companyId: 'c1' });
    prisma.recipe.findUnique.mockResolvedValueOnce({ id: 'r1', companyId: 'c1' });
    prisma.productionOrder.create.mockResolvedValueOnce({ id: 'po1', status: 'PLANNED' });

    const result = await service.createProductionOrder(ctx, {
      stockItemId: 's1',
      recipeId: 'r1',
      plannedQuantity: 10,
    });
    expect(result.id).toBe('po1');
  });

  it('inicia e finaliza ordem de producao aberta', async () => {
    const { service, prisma } = createService();
    prisma.productionOrder.findUnique
      .mockResolvedValueOnce({
        id: 'po1',
        status: 'PLANNED',
        branchId: 'b1',
        plannedQuantity: 10,
        branch: { id: 'b1', companyId: 'c1' },
      })
      .mockResolvedValueOnce({
        id: 'po1',
        status: 'IN_PROGRESS',
        branchId: 'b1',
        plannedQuantity: 10,
        branch: { id: 'b1', companyId: 'c1' },
      })
      .mockResolvedValueOnce({
        id: 'po1',
        status: 'FINISHED',
        branchId: 'b1',
        plannedQuantity: 10,
        branch: { id: 'b1', companyId: 'c1' },
      });
    prisma.productionOrder.update.mockResolvedValue({ id: 'po1' });

    await service.startProductionOrder(ctx, 'po1');
    const done = await service.finishProductionOrder(ctx, 'po1', 9.5);
    expect(done?.id).toBe('po1');
  });

  it('registra perda de preparo com custo estimado da receita', async () => {
    const { service, prisma } = createService();
    prisma.productionOrder.findUnique.mockResolvedValueOnce({
      id: 'po1',
      status: 'IN_PROGRESS',
      branchId: 'b1',
      stockItemId: 's-out',
      recipeId: 'r1',
      branch: { id: 'b1', companyId: 'c1' },
    });
    prisma.recipe.findUnique.mockResolvedValueOnce({
      id: 'r1',
      companyId: 'c1',
      name: 'Massa',
      type: 'PRODUCTION',
      yieldQuantity: 10,
      yieldUnit: 'kg',
      lossPercent: 0,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [
        {
          id: 'ri1',
          stockItemId: 's1',
          quantity: 2,
          unit: 'kg',
          optional: false,
          affectsStock: true,
          affectsCost: true,
          stockItem: { name: 'Farinha', averageCost: 10 },
        },
      ],
    });
    prisma.stockMovement.create.mockResolvedValueOnce({ id: 'loss1', quantity: 1 });

    const result = await service.registerProductionLoss(ctx, 'po1', 1, 'teste');
    expect(result.id).toBe('loss1');
    expect(prisma.stockMovement.create).toHaveBeenCalled();
  });
});

