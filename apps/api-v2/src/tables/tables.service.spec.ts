import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TablesService } from './tables.service';

describe('TablesService', () => {
  const ctx = { companyId: 'c1', branchId: 'b1', userId: 'u1', role: 'admin', permissions: ['*'] } as any;

  function makeService(overrides?: Record<string, any>) {
    const prisma: any = {
      tableRestaurant: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 't1' }),
        findFirst: jest.fn().mockResolvedValue({ id: 't1', branchId: 'b1' }),
        update: jest.fn().mockResolvedValue({ id: 't1' }),
      },
      tableSession: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 's1' }),
        update: jest.fn().mockResolvedValue({ id: 's1', status: 'CLOSED' }),
      },
      command: {
        create: jest.fn().mockResolvedValue({ id: 'cmd1', code: 'CMD-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ id: 'cmd1', guestCount: 2 }),
      },
      branch: { findFirst: jest.fn().mockResolvedValue({ id: 'b1', companyId: 'c1' }) },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
      ...overrides,
    };

    return { service: new TablesService(prisma), prisma };
  }

  it('createTable valida name', async () => {
    const { service } = makeService();
    await expect(service.createTable(ctx, { name: '  ' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('openSession bloqueia mesa ocupada', async () => {
    const { service, prisma } = makeService();
    prisma.tableSession.findFirst.mockResolvedValue({ id: 's-open' });
    await expect(service.openSession(ctx, 't1', {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('closeSession fecha sessao e libera mesa', async () => {
    const { service, prisma } = makeService({
      tableSession: {
        findFirst: jest.fn().mockResolvedValue({ id: 's1', tableId: 't1', status: 'OPEN', table: { id: 't1' } }),
        update: jest.fn().mockResolvedValue({ id: 's1', status: 'CLOSED' }),
      },
    });

    const result = await service.closeSession(ctx, 's1');
    expect(result.status).toBe('CLOSED');
    expect(prisma.command.updateMany).toHaveBeenCalled();
  });

  it('transferSession exige mesa destino', async () => {
    const { service } = makeService();
    await expect(service.transferSession(ctx, 's1', '')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('mergeCommands exige ao menos duas comandas', async () => {
    const { service } = makeService();
    await expect(service.mergeCommands(ctx, ['cmd1'])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('splitCommand falha com comanda inexistente', async () => {
    const { service, prisma } = makeService();
    prisma.command.findFirst.mockResolvedValue(null);
    await expect(service.splitCommand(ctx, 'missing', true)).rejects.toBeInstanceOf(NotFoundException);
  });
});

