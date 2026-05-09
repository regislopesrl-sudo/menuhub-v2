import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RecipesService } from './recipes.service';

describe('RecipesService', () => {
  function createService() {
    const prisma = {
      recipe: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({
          id: 'r1',
          companyId: 'c1',
          name: 'Molho base',
          type: 'PRODUCTION',
          yieldQuantity: 2,
          yieldUnit: 'L',
          lossPercent: 10,
          active: true,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          items: [],
        }),
        create: jest.fn().mockResolvedValue({
          id: 'r1',
          companyId: 'c1',
          name: 'Molho base',
          type: 'PRODUCTION',
          yieldQuantity: 2,
          yieldUnit: 'L',
          lossPercent: 0,
          active: true,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          items: [],
        }),
        update: jest.fn().mockResolvedValue({
          id: 'r1',
          companyId: 'c1',
          name: 'Molho base',
          type: 'PRODUCTION',
          yieldQuantity: 2,
          yieldUnit: 'L',
          lossPercent: 0,
          active: true,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          items: [],
        }),
      },
      stockItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 's1',
          companyId: 'c1',
          name: 'Tomate',
          averageCost: 5,
          standardCost: 6,
          lastCost: 4,
        }),
      },
      recipeItem: {
        create: jest.fn().mockResolvedValue({
          id: 'ri1',
          recipeId: 'r1',
          stockItemId: 's1',
          quantity: 1.5,
          unit: 'KG',
          optional: false,
          affectsStock: true,
          affectsCost: true,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          stockItem: {
            id: 's1',
            name: 'Tomate',
            averageCost: 5,
            standardCost: 6,
            lastCost: 4,
          },
        }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'ri1',
          recipeId: 'r1',
          recipe: { companyId: 'c1' },
        }),
        update: jest.fn().mockResolvedValue({
          id: 'ri1',
          recipeId: 'r1',
          stockItemId: 's1',
          quantity: 2,
          unit: 'KG',
          optional: false,
          affectsStock: true,
          affectsCost: true,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          stockItem: {
            id: 's1',
            name: 'Tomate',
            averageCost: 5,
            standardCost: 6,
            lastCost: 4,
          },
        }),
      },
    };
    return { service: new RecipesService(prisma as never), prisma };
  }

  it('cria ficha tecnica valida', async () => {
    const { service, prisma } = createService();
    const result = await service.create('c1', {
      name: 'Molho base',
      type: 'PRODUCTION',
      yieldQuantity: 2,
      yieldUnit: 'L',
    });
    expect(prisma.recipe.create).toHaveBeenCalled();
    expect(result.name).toBe('Molho base');
  });

  it('bloqueia create com yield invalido', async () => {
    const { service } = createService();
    await expect(
      service.create('c1', {
        name: 'Molho base',
        type: 'PRODUCTION',
        yieldQuantity: 0,
        yieldUnit: 'L',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('getById retorna not found quando receita nao existe', async () => {
    const { service, prisma } = createService();
    prisma.recipe.findFirst.mockResolvedValueOnce(null);
    await expect(service.getById('c1', 'x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('adiciona item com custo calculado', async () => {
    const { service } = createService();
    const result = await service.addItem('c1', 'r1', {
      stockItemId: 's1',
      quantity: 1.5,
      unit: 'KG',
    });
    expect(result.unitCost).toBe(6);
    expect(result.costContribution).toBe(9);
  });

  it('bloqueia addItem com stock item fora da empresa', async () => {
    const { service, prisma } = createService();
    prisma.stockItem.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.addItem('c1', 'r1', {
        stockItemId: 's2',
        quantity: 1,
        unit: 'KG',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
