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

  it('exige branchId para operacoes de mesas e comandas', async () => {
    const { service } = makeService();
    const ctxWithoutBranch = { ...ctx, branchId: undefined };

    await expect(service.listTables(ctxWithoutBranch)).rejects.toThrow('branchId obrigatorio para mesas e comandas.');
    await expect(service.createTable(ctxWithoutBranch, { name: 'Mesa 1' })).rejects.toThrow(
      'branchId obrigatorio para mesas e comandas.',
    );
    await expect(service.listOpenCommands(ctxWithoutBranch)).rejects.toThrow(
      'branchId obrigatorio para mesas e comandas.',
    );
  });

  it('listTables filtra sempre pela filial atual', async () => {
    const { service, prisma } = makeService();

    await service.listTables(ctx);

    expect(prisma.tableRestaurant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { branchId: 'b1', branch: { companyId: 'c1' } },
      }),
    );
  });

  it('updateTable bloqueia mesa de outra filial', async () => {
    const { service, prisma } = makeService();

    await service.updateTable(ctx, 't1', { name: 'Mesa VIP' });

    expect(prisma.tableRestaurant.findFirst).toHaveBeenCalledWith({
      where: { id: 't1', branchId: 'b1', branch: { companyId: 'c1' } },
    });
  });

  it('openSession bloqueia mesa ocupada', async () => {
    const { service, prisma } = makeService();
    prisma.tableSession.findFirst.mockResolvedValue({ id: 's-open' });
    await expect(service.openSession(ctx, 't1', {})).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.tableRestaurant.findFirst).toHaveBeenCalledWith({
      where: { id: 't1', branchId: 'b1', branch: { companyId: 'c1' } },
    });
    expect(prisma.tableSession.findFirst).toHaveBeenCalledWith({ where: { tableId: 't1', branchId: 'b1', status: 'OPEN' } });
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
    expect(prisma.tableSession.findFirst).toHaveBeenCalledWith({
      where: { id: 's1', branchId: 'b1', branch: { companyId: 'c1' } },
      include: { table: true },
    });
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

  it('mergeCommands valida comandas abertas somente da filial atual', async () => {
    const { service, prisma } = makeService();
    prisma.command.findMany.mockResolvedValue([{ id: 'cmd1', code: 'CMD-1' }, { id: 'cmd2', code: 'CMD-2' }]);

    await service.mergeCommands(ctx, ['cmd1', 'cmd2']);

    expect(prisma.command.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['cmd1', 'cmd2'] }, branchId: 'b1', branch: { companyId: 'c1' }, status: 'OPEN' },
      select: { id: true, code: true },
    });
  });

  it('splitCommand falha com comanda inexistente', async () => {
    const { service, prisma } = makeService();
    prisma.command.findFirst.mockResolvedValue(null);
    await expect(service.splitCommand(ctx, 'missing', true)).rejects.toBeInstanceOf(NotFoundException);
  });
});

