import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RecipesService } from './recipes.service';

describe('RecipesService', () => {
  const ctx = { companyId: 'c1', userRole: 'admin', requestId: 'r1' } as any;

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
});

