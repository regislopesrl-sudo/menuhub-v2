import { BadRequestException } from '@nestjs/common';
import { PdvService } from './pdv.service';

describe('PdvService', () => {
  const prismaMock: any = {
    branch: { findFirst: jest.fn() },
    cashRegister: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    cashMovement: { findMany: jest.fn(), create: jest.fn() },
  };
  const orderRepoMock: any = {
    findPdvOrdersForSession: jest.fn(),
  };

  const ctx = {
    companyId: 'company_1',
    branchId: 'branch_1',
    userRole: 'admin' as const,
    requestId: 'req_1',
  };

  let service: PdvService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PdvService(prismaMock, orderRepoMock);
    prismaMock.branch.findFirst.mockResolvedValue({ id: 'branch_1' });
    prismaMock.cashMovement.findMany.mockResolvedValue([]);
  });

  it('does not allow opening two sessions for same branch', async () => {
    prismaMock.cashRegister.findFirst.mockResolvedValueOnce({ id: 'open_session' });

    await expect(service.openSession(ctx)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('opens session and summarizes sales', async () => {
    prismaMock.cashRegister.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'session_1',
        branchId: 'branch_1',
        status: 'OPEN',
        openedAt: new Date('2026-04-30T10:00:00.000Z'),
        closedAt: null,
        openingBalance: 0,
        declaredClosingBalance: null,
        differenceAmount: null,
      });
    prismaMock.cashRegister.create.mockResolvedValue({
      id: 'session_1',
      branchId: 'branch_1',
      status: 'OPEN',
      openedAt: new Date('2026-04-30T10:00:00.000Z'),
      openingBalance: 0,
    });
    orderRepoMock.findPdvOrdersForSession.mockResolvedValue([
      {
        id: 'o1',
        totalAmount: 40,
        internalNotes: JSON.stringify({ payment: { method: 'CASH' } }),
        createdAt: new Date(),
      },
      {
        id: 'o2',
        totalAmount: 20,
        internalNotes: JSON.stringify({ payment: { method: 'PIX' } }),
        createdAt: new Date(),
      },
    ]);

    const opened = await service.openSession(ctx);
    const summary = await service.getSessionSummary('session_1', ctx);

    expect(opened.id).toBe('session_1');
    expect(summary.totalOrders).toBe(2);
    expect(summary.ordersCount).toBe(2);
    expect(summary.totalSales).toBe(60);
    expect(summary.averageTicket).toBe(30);
    expect(summary.totalsByMethod.cash).toBe(40);
    expect(summary.totalByPaymentMethod.CASH).toBe(40);
    expect(summary.totalsByMethod.pix).toBe(20);
    expect(summary.expectedCashAmount).toBe(40);
  });

  it('closes session returning summary', async () => {
    prismaMock.cashRegister.findFirst.mockResolvedValue({
      id: 'session_1',
      branchId: 'branch_1',
      status: 'OPEN',
      openedAt: new Date('2026-04-30T10:00:00.000Z'),
      closedAt: null,
      openingBalance: 10,
      declaredClosingBalance: null,
      differenceAmount: null,
    });
    orderRepoMock.findPdvOrdersForSession.mockResolvedValue([
      {
        id: 'o1',
        totalAmount: 50,
        internalNotes: JSON.stringify({ payment: { method: 'CREDIT_CARD' } }),
        createdAt: new Date(),
      },
    ]);
    prismaMock.cashRegister.update.mockResolvedValue({});

    const closed = await service.closeSession('session_1', ctx, { declaredCashAmount: 60 });

    expect(closed.status).toBe('CLOSED');
    expect(closed.totalSales).toBe(50);
    expect(closed.expectedCashAmount).toBe(10);
    expect(closed.cashDifference).toBe(50);
  });

  it('supply increases expected cash and withdrawal reduces it', async () => {
    prismaMock.cashRegister.findFirst.mockResolvedValue({
      id: 'session_1',
      branchId: 'branch_1',
      status: 'OPEN',
      openedAt: new Date('2026-04-30T10:00:00.000Z'),
      closedAt: null,
      openingBalance: 100,
      declaredClosingBalance: null,
      differenceAmount: null,
    });
    orderRepoMock.findPdvOrdersForSession.mockResolvedValue([]);
    prismaMock.cashMovement.create
      .mockResolvedValueOnce({
        id: 'm1',
        cashRegisterId: 'session_1',
        branchId: 'branch_1',
        movementType: 'DEPOSIT',
        amount: 20,
        notes: 'Troco',
        createdAt: new Date('2026-04-30T10:10:00.000Z'),
      })
      .mockResolvedValueOnce({
        id: 'm2',
        cashRegisterId: 'session_1',
        branchId: 'branch_1',
        movementType: 'WITHDRAWAL',
        amount: 15,
        notes: 'Sangria',
        createdAt: new Date('2026-04-30T10:20:00.000Z'),
      });
    prismaMock.cashMovement.findMany.mockResolvedValue([
      { movementType: 'DEPOSIT', amount: 20 },
      { movementType: 'WITHDRAWAL', amount: 15 },
    ]);

    await service.createMovement('session_1', ctx, { type: 'SUPPLY', amount: 20, reason: 'Troco' });
    await service.createMovement('session_1', ctx, { type: 'WITHDRAWAL', amount: 15, reason: 'Sangria' });
    const summary = await service.getSessionSummary('session_1', ctx);

    expect(summary.expectedCashAmount).toBe(105);
    expect(summary.movementTotals.supply).toBe(20);
    expect(summary.supplies).toBe(20);
    expect(summary.movementTotals.withdrawal).toBe(15);
    expect(summary.withdrawals).toBe(15);
  });

  it('returns current summary and movements for open session', async () => {
    prismaMock.cashRegister.findFirst
      .mockResolvedValueOnce({
        id: 'session_current',
        branchId: 'branch_1',
        status: 'OPEN',
        openedAt: new Date('2026-04-30T10:00:00.000Z'),
        openingBalance: 50,
      })
      .mockResolvedValueOnce({
        id: 'session_current',
        branchId: 'branch_1',
        status: 'OPEN',
        openedAt: new Date('2026-04-30T10:00:00.000Z'),
        closedAt: null,
        openingBalance: 50,
        declaredClosingBalance: null,
        differenceAmount: null,
      })
      .mockResolvedValueOnce({
        id: 'session_current',
        branchId: 'branch_1',
        status: 'OPEN',
        openedAt: new Date('2026-04-30T10:00:00.000Z'),
        openingBalance: 50,
      })
      .mockResolvedValueOnce({
        id: 'session_current',
        branchId: 'branch_1',
        status: 'OPEN',
        openedAt: new Date('2026-04-30T10:00:00.000Z'),
        closedAt: null,
        openingBalance: 50,
        declaredClosingBalance: null,
        differenceAmount: null,
      });
    orderRepoMock.findPdvOrdersForSession.mockResolvedValue([
      { id: 'o1', totalAmount: 30, internalNotes: JSON.stringify({ payment: { method: 'CASH' } }) },
    ]);
    prismaMock.cashMovement.findMany
      .mockResolvedValueOnce([{ movementType: 'DEPOSIT', amount: 10 }])
      .mockResolvedValueOnce([
        {
          id: 'm1',
          cashRegisterId: 'session_current',
          branchId: 'branch_1',
          movementType: 'DEPOSIT',
          amount: 10,
          notes: 'Troco',
          createdAt: new Date('2026-04-30T10:05:00.000Z'),
        },
      ]);

    const summary = await service.getCurrentSessionSummary(ctx);
    const movements = await service.listCurrentMovements(ctx);

    expect(summary?.sessionId).toBe('session_current');
    expect(summary?.expectedCashAmount).toBe(90);
    expect(movements).toHaveLength(1);
    expect(movements[0].type).toBe('SUPPLY');
  });

  it('current summary retorna null e movements vazio sem caixa aberto', async () => {
    prismaMock.cashRegister.findFirst.mockResolvedValue(null);

    await expect(service.getCurrentSessionSummary(ctx)).resolves.toBeNull();
    await expect(service.listCurrentMovements(ctx)).resolves.toEqual([]);
  });

  it('blocks movements for closed session', async () => {
    prismaMock.cashRegister.findFirst.mockResolvedValue({
      id: 'session_closed',
      branchId: 'branch_1',
      status: 'CLOSED',
      openedAt: new Date('2026-04-30T10:00:00.000Z'),
      closedAt: new Date('2026-04-30T12:00:00.000Z'),
      openingBalance: 0,
      declaredClosingBalance: 0,
      differenceAmount: 0,
    });

    await expect(
      service.createMovement('session_closed', ctx, { type: 'WITHDRAWAL', amount: 10 }),
    ).rejects.toThrow('Nao e permitido lancar movimentacao em caixa fechado.');
  });

  it('lists movements for session', async () => {
    prismaMock.cashRegister.findFirst.mockResolvedValue({
      id: 'session_1',
      branchId: 'branch_1',
      status: 'OPEN',
      openedAt: new Date('2026-04-30T10:00:00.000Z'),
      closedAt: null,
      openingBalance: 0,
    });
    prismaMock.cashMovement.findMany.mockResolvedValue([
      {
        id: 'm1',
        cashRegisterId: 'session_1',
        branchId: 'branch_1',
        movementType: 'DEPOSIT',
        amount: 30,
        notes: 'Suprimento',
        createdAt: new Date('2026-04-30T10:00:00.000Z'),
      },
    ]);

    const movements = await service.listMovements('session_1', ctx);
    expect(movements).toHaveLength(1);
    expect(movements[0].type).toBe('SUPPLY');
  });
});
