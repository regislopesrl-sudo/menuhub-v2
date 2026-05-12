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
        create: jest.fn().mockImplementation(async ({ data }: any) => ({
          id: 'pay_new',
          paidAmount: 0,
          status: 'PENDING',
          supplier: null,
          ...data,
        })),
        findFirst: jest.fn().mockResolvedValue({
          id: 'pay_1',
          branchId: 'branch_1',
          description: 'Fornecedor',
          amount: 50,
          paidAmount: 0,
          dueDate: new Date('2026-05-01T00:00:00.000Z'),
          status: 'PENDING',
          settledAt: null,
          reasonCode: 'compras',
          supplier: { id: 'sup_1', name: 'Fornecedor A' },
        }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'pay_1',
            branchId: 'branch_1',
            description: 'Fornecedor',
            amount: 50,
            paidAmount: 0,
            dueDate: new Date('2026-05-01T00:00:00.000Z'),
            status: 'PENDING',
            reasonCode: 'compras',
            reasonText: 'cozinha',
            supplier: { id: 'sup_1', name: 'Fornecedor A' },
          },
        ]),
        update: jest.fn().mockImplementation(async ({ data }: any) => ({
          id: 'pay_1',
          branchId: 'branch_1',
          description: 'Fornecedor',
          amount: 50,
          paidAmount: data.paidAmount,
          dueDate: new Date('2026-05-01T00:00:00.000Z'),
          status: data.status,
          reasonCode: 'compras',
          reasonText: 'cozinha',
          supplier: { id: 'sup_1', name: 'Fornecedor A' },
        })),
      },
      accountsReceivable: {
        create: jest.fn().mockImplementation(async ({ data }: any) => ({
          id: 'rec_new',
          paidAmount: 0,
          status: 'PENDING',
          orderId: null,
          paymentId: null,
          ...data,
        })),
        findFirst: jest.fn().mockResolvedValue({
          id: 'rec_1',
          branchId: 'branch_1',
          description: 'Pedido balcao',
          amount: 100,
          paidAmount: 0,
          dueDate: new Date('2026-05-01T00:00:00.000Z'),
          status: 'PENDING',
          settledAt: null,
          reasonCode: 'vendas',
          orderId: null,
          paymentId: null,
        }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'rec_1',
            branchId: 'branch_1',
            description: 'Pedido balcao',
            amount: 100,
            paidAmount: 0,
            dueDate: new Date('2026-05-01T00:00:00.000Z'),
            status: 'PENDING',
            reasonCode: 'vendas',
            reasonText: 'salao',
            orderId: null,
            paymentId: null,
          },
        ]),
        update: jest.fn().mockImplementation(async ({ data }: any) => ({
          id: 'rec_1',
          branchId: 'branch_1',
          description: 'Pedido balcao',
          amount: 100,
          paidAmount: data.paidAmount,
          dueDate: new Date('2026-05-01T00:00:00.000Z'),
          status: data.status,
          reasonCode: 'vendas',
          reasonText: 'salao',
          orderId: null,
          paymentId: null,
        })),
      },
      payableSettlement: {
        create: jest.fn().mockResolvedValue({ id: 'pay_settlement_1' }),
      },
      receivableSettlement: {
        create: jest.fn().mockResolvedValue({ id: 'rec_settlement_1' }),
      },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    } as any;

    return { prisma, service: new FinanceService(prisma) };
  }

  it('gera relatorio financeiro consolidado com breakdowns premium', async () => {
    const { service } = build();

    const result = await service.getReport(ctx, {
      from: '2026-05-01T00:00:00.000Z',
      to: '2026-05-31T23:59:59.999Z',
    });

    expect(result.generatedAt).toBeTruthy();
    expect(result.overview.openPayables).toBe(1);
    expect(result.cashFlow.realized.balance).toBe(80);
    expect(result.dre.operatingProfit).toBe(80);
    expect(result.reconciliation.summary.totalItems).toBeGreaterThanOrEqual(3);
    expect(result.ledger).toHaveLength(1);
    expect(result.payables).toHaveLength(1);
    expect(result.receivables).toHaveLength(1);
    expect(result.breakdowns.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'compras', pendingPayable: 50 }),
        expect.objectContaining({ key: 'vendas', pendingReceivable: 100 }),
      ]),
    );
    expect(result.breakdowns.costCenters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'cozinha', pendingPayable: 50 }),
        expect.objectContaining({ key: 'salao', pendingReceivable: 100 }),
      ]),
    );
    expect(result.totals).toEqual({
      ledgerEntries: 1,
      payables: 1,
      receivables: 1,
      openPayables: 1,
      openReceivables: 1,
    });
  });
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

  it('cria conta a pagar manual com categoria e centro de custo', async () => {
    const { service, prisma } = build();

    const result = await service.createManualPayable(ctx, {
      description: 'Aluguel',
      amount: 200,
      dueDate: '2026-05-10T00:00:00.000Z',
      category: 'aluguel',
      costCenter: 'administrativo',
    });

    expect(result.id).toBe('pay_new');
    expect(prisma.accountsPayable.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          branchId: 'branch_1',
          amount: 200,
          reasonCode: 'aluguel',
          reasonText: 'administrativo',
        }),
      }),
    );
  });

  it('baixa conta a pagar parcialmente e cria ledger de despesa', async () => {
    const { service, prisma } = build();

    const result = await service.settlePayable(ctx, 'pay_1', { amount: 25, settlementMethod: 'PIX' });

    expect(result.status).toBe('PARTIALLY_PAID');
    expect(prisma.payableSettlement.create).toHaveBeenCalled();
    expect(prisma.financialLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entryType: 'EXPENSE',
          accountsPayableId: 'pay_1',
          amount: 25,
        }),
      }),
    );
  });

  it('baixa conta a receber e cria ledger de receita', async () => {
    const { service, prisma } = build();

    const result = await service.settleReceivable(ctx, 'rec_1', { amount: 100, settlementMethod: 'CARD' });

    expect(result.status).toBe('PAID');
    expect(prisma.receivableSettlement.create).toHaveBeenCalled();
    expect(prisma.financialLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entryType: 'REVENUE',
          accountsReceivableId: 'rec_1',
          amount: 100,
        }),
      }),
    );
  });

  it('lista categorias e centros de custo consolidados', async () => {
    const { service } = build();

    await expect(service.listCategories(ctx)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'compras' }), expect.objectContaining({ key: 'vendas' })]),
    );
    await expect(service.listCostCenters(ctx)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'salao' })]),
    );
  });
});
