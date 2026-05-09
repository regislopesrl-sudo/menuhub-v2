import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StockItemsService } from './stock-items.service';

describe('StockItemsService', () => {
  function createService() {
    const prisma = {
      stockItem: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({
          id: 's1',
          companyId: 'c1',
          name: 'Tomate',
          code: 'TMT',
          stockType: 'RAW_MATERIAL',
          purchaseUnit: 'CX',
          stockUnit: 'KG',
          productionUnit: 'G',
          conversionFactor: 10,
          currentQuantity: 0,
          minimumQuantity: 2,
          reorderPoint: 3,
          averageCost: 6.5,
          standardCost: 7,
          controlsStock: true,
          controlsBatch: false,
          controlsExpiry: false,
          isPerishable: true,
          isFractionable: true,
          isCritical: false,
          isActive: true,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
        findFirst: jest.fn().mockResolvedValue({ id: 's1' }),
        update: jest.fn().mockResolvedValue({
          id: 's1',
          companyId: 'c1',
          name: 'Tomate Italiano',
          code: 'TMT',
          stockType: 'RAW_MATERIAL',
          purchaseUnit: 'CX',
          stockUnit: 'KG',
          productionUnit: 'G',
          conversionFactor: 10,
          currentQuantity: 0,
          minimumQuantity: 2,
          reorderPoint: 3,
          averageCost: 6.5,
          standardCost: 7,
          controlsStock: true,
          controlsBatch: false,
          controlsExpiry: false,
          isPerishable: true,
          isFractionable: true,
          isCritical: false,
          isActive: true,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      },
    };
    return { service: new StockItemsService(prisma as never), prisma };
  }

  it('cria insumo com validacoes minimas', async () => {
    const { service, prisma } = createService();
    const result = await service.create('c1', { name: 'Tomate', conversionFactor: 10, minimumQuantity: 2 });
    expect(prisma.stockItem.create).toHaveBeenCalled();
    expect(result.name).toBe('Tomate');
  });

  it('bloqueia create com nome vazio', async () => {
    const { service } = createService();
    await expect(service.create('c1', { name: '   ' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('bloqueia update quando insumo nao existe na empresa', async () => {
    const { service, prisma } = createService();
    prisma.stockItem.findFirst.mockResolvedValueOnce(null);
    await expect(service.update('c1', 'x', { name: 'Novo' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('bloqueia update com payload vazio', async () => {
    const { service } = createService();
    await expect(service.update('c1', 's1', {})).rejects.toBeInstanceOf(BadRequestException);
  });
});
