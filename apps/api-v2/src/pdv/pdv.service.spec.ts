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
    expect(summary.totalSales).toBe(60);
    expect(summary.totalsByMethod.cash).toBe(40);
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
    expect(summary.movementTotals.withdrawal).toBe(15);
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
