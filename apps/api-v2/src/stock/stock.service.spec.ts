import { BadRequestException } from '@nestjs/common';
import { StockService } from './stock.service';

describe('StockService', () => {
  const ctx = {
    companyId: 'company-demo',
    branchId: 'branch-demo',
    requestId: 'req-1',
    userRole: 'owner' as const,
    userId: 'user-1',
  };

  const prisma = {
    stockItem: {
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    stockMovement: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    stockLocationBalance: {
      upsert: jest.fn(),
    },
    $transaction: jest.fn(),
  } as any;

  const service = new StockService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (cb: any) =>
      cb({
        stockItem: prisma.stockItem,
        stockMovement: prisma.stockMovement,
        stockLocationBalance: prisma.stockLocationBalance,
      }),
    );
  });

  it('cria item com name obrigatorio', async () => {
    prisma.stockItem.create.mockResolvedValue({ id: 's1' });
    await service.createItem(ctx, { name: 'Farinha', stockUnit: 'kg' });
    expect(prisma.stockItem.create).toHaveBeenCalled();
  });

  it('bloqueia item sem nome', async () => {
    await expect(service.createItem(ctx, { name: '' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('faz entrada manual e atualiza saldo', async () => {
    prisma.stockItem.findUnique.mockResolvedValue({ id: 's1', companyId: 'company-demo', currentQuantity: 10, allowNegativeStock: false });
    prisma.stockItem.update.mockResolvedValue({ id: 's1', currentQuantity: 15 });
    prisma.stockMovement.create.mockResolvedValue({ id: 'm1', movementType: 'ENTRY' });

    const result = await service.manualEntry(ctx, { stockItemId: 's1', quantity: 5, unitCost: 2 });
    expect(result.movement.id).toBe('m1');
    expect(prisma.stockItem.update).toHaveBeenCalled();
    expect(prisma.stockLocationBalance.upsert).toHaveBeenCalled();
  });

  it('bloqueia saida sem estoque quando nao permite negativo', async () => {
    prisma.stockItem.findUnique.mockResolvedValue({ id: 's1', companyId: 'company-demo', currentQuantity: 1, allowNegativeStock: false });
    await expect(service.manualExit(ctx, { stockItemId: 's1', quantity: 5 })).rejects.toBeInstanceOf(BadRequestException);
  });
});
