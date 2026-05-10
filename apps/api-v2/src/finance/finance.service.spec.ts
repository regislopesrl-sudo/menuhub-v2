import { BadRequestException } from '@nestjs/common';
import { FinanceService } from './finance.service';

describe('FinanceService', () => {
  const ctx = { companyId: 'company_1', branchId: 'branch_1', userId: 'user_1', userRole: 'finance', requestId: 'req_1' } as any;

  function build() {
    const prisma = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: 'branch_1' }),
      },
      order: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'order_1',
            branchId: 'branch_1',
            status: 'DELIVERED',
            paymentStatus: 'PAID',
            totalAmount: 100,
            createdAt: new Date('2026-05-01T12:00:00.000Z'),
          },
        ]),
      },
      financialLedgerEntry: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'ledger_1',
            branchId: 'branch_1',
            entryType: 'EXPENSE',
            originType: 'MANUAL',
            amount: 20,
            reasonCode: 'marketing',
            reasonText: 'Campanha local',
            externalReference: null,
            createdAt: new Date('2026-05-02T12:00:00.000Z'),
            metadata: null,
          },
        ]),
        create: jest.fn().mockImplementation(async ({ data }: any) => ({
          id: 'ledger_new',
          createdAt: new Date('2026-05-03T12:00:00.000Z'),
          originId: null,
          ...data,
        })),
      },
      accountsPayable: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'pay_1',
            branchId: 'branch_1',
            description: 'Fornecedor',
            amount: 50,
            paidAmount: 0,
            dueDate: new Date('2026-05-01T00:00:00.000Z'),
            status: 'PENDING',
            supplier: { id: 'sup_1', name: 'Fornecedor A' },
          },
        ]),
      },
      accountsReceivable: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'rec_1',
            branchId: 'branch_1',
            description: 'Pedido balcao',
            amount: 100,
            paidAmount: 0,
            dueDate: new Date('2026-05-01T00:00:00.000Z'),
            status: 'PENDING',
            orderId: null,
            paymentId: null,
          },
        ]),
      },
    } as any;

    return { prisma, service: new FinanceService(prisma) };
  }

  it('calcula fluxo de caixa separando realizado e previsto', async () => {
    const { service } = build();

    const result = await service.getCashFlow(ctx, {
      from: '2026-05-01T00:00:00.000Z',
      to: '2026-05-31T23:59:59.999Z',
    });

    expect(result.realized).toEqual({ inflow: 100, outflow: 20, balance: 80 });
    expect(result.forecast).toEqual({ receivables: 100, payables: 50, balance: 50 });
  });

  it('gera DRE simplificada sem inventar CMV quando ficha/estoque nao fecham custo', async () => {
    const { service } = build();

    const result = await service.getDre(ctx, {
      from: '2026-05-01T00:00:00.000Z',
      to: '2026-05-31T23:59:59.999Z',
    });

    expect(result.netRevenue).toBe(100);
    expect(result.cogs).toBe(0);
    expect(result.cogsSource).toBe('pending_recipe_stock_integration');
    expect(result.operatingProfit).toBe(80);
  });

  it('cria lancamento manual com branch da company atual', async () => {
    const { service, prisma } = build();

    const result = await service.createManualLedgerEntry(ctx, {
      entryType: 'REVENUE',
      amount: 35,
      category: 'ajuste',
      costCenter: 'salao',
      description: 'Ajuste manual',
    });

    expect(result.id).toBe('ledger_new');
    expect(prisma.financialLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          branchId: 'branch_1',
          entryType: 'REVENUE',
          amount: 35,
          reasonCode: 'ajuste',
          reasonText: 'Ajuste manual',
        }),
      }),
    );
  });

  it('bloqueia lancamento manual com valor invalido', async () => {
    const { service } = build();

    await expect(
      service.createManualLedgerEntry(ctx, { entryType: 'EXPENSE', amount: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('bloqueia branch fora da company', async () => {
    const { service, prisma } = build();
    prisma.branch.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.createManualLedgerEntry(ctx, { entryType: 'EXPENSE', amount: 10, branchId: 'branch_other' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('aponta divergencias de pedido pago sem recebivel e contas vencidas', async () => {
    const { service } = build();

    const result = await service.getReconciliation(ctx, {
      from: '2026-05-01T00:00:00.000Z',
      to: '2026-05-31T23:59:59.999Z',
    });

    expect(result.summary.totalItems).toBeGreaterThanOrEqual(3);
    expect(result.items.map((item) => item.type)).toEqual(
      expect.arrayContaining(['ORDER_WITHOUT_RECEIVABLE', 'OVERDUE_RECEIVABLE', 'OVERDUE_PAYABLE']),
    );
  });
});
