import { BadRequestException, Injectable } from '@nestjs/common';
import type { RequestContext } from '../common/request-context';
import { PrismaService } from '../database/prisma.service';

export type FinanceQuery = {
  from?: string;
  to?: string;
  branchId?: string;
};

export type ManualLedgerInput = {
  entryType: 'REVENUE' | 'EXPENSE';
  amount: number;
  description?: string;
  category?: string;
  costCenter?: string;
  occurredAt?: string;
  branchId?: string;
  externalReference?: string;
};

export type ManualAccountInput = {
  description: string;
  amount: number;
  dueDate?: string;
  category?: string;
  costCenter?: string;
  branchId?: string;
  externalReference?: string;
};

export type AccountSettlementInput = {
  amount: number;
  settlementMethod?: 'CASH' | 'PIX' | 'CARD' | 'BANK_TRANSFER' | 'BOLETO' | 'EXTERNAL' | 'OTHER';
  settledAt?: string;
  reasonText?: string;
  externalReference?: string;
};

type Period = {
  from: Date;
  to: Date;
};

type BranchScope = {
  branchId?: string;
  whereBranch: { companyId: string; id?: string };
};

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(ctx: RequestContext, query: FinanceQuery = {}) {
    const period = this.resolvePeriod(query);
    const scope = await this.resolveBranchScope(ctx, query.branchId);
    const [dre, cashFlow, reconciliation, payables, receivables] = await Promise.all([
      this.getDre(ctx, query),
      this.getCashFlow(ctx, query),
      this.getReconciliation(ctx, query),
      this.listPayables(ctx, query),
      this.listReceivables(ctx, query),
    ]);

    return {
      period: this.mapPeriod(period),
      branchId: scope.branchId ?? null,
      cashFlow,
      dre,
      reconciliationSummary: reconciliation.summary,
      openPayables: payables.filter((item) => item.status !== 'PAID' && item.status !== 'CANCELED').length,
      openReceivables: receivables.filter((item) => item.status !== 'PAID' && item.status !== 'CANCELED').length,
    };
  }

  async getCashFlow(ctx: RequestContext, query: FinanceQuery = {}) {
    const period = this.resolvePeriod(query);
    const scope = await this.resolveBranchScope(ctx, query.branchId);
    const [orders, ledger, payables, receivables] = await Promise.all([
      this.findPaidOrders(period, scope),
      this.findLedger(period, scope),
      this.findPayables(period, scope),
      this.findReceivables(period, scope),
    ]);

    const salesRevenue = this.sum(orders.map((order) => order.totalAmount));
    const manualRevenue = this.sum(
      ledger.filter((entry) => entry.entryType === 'REVENUE').map((entry) => entry.amount),
    );
    const manualExpenses = this.sum(
      ledger.filter((entry) => entry.entryType === 'EXPENSE').map((entry) => entry.amount),
    );
    const realizedPayables = this.sum(
      payables.filter((item) => item.status === 'PAID' || Number(item.paidAmount) > 0).map((item) => item.paidAmount),
    );
    const forecastPayables = this.sum(
      payables.filter((item) => item.status === 'PENDING' || item.status === 'PARTIALLY_PAID').map((item) => item.amount),
    );
    const forecastReceivables = this.sum(
      receivables.filter((item) => item.status === 'PENDING' || item.status === 'PARTIALLY_PAID').map((item) => item.amount),
    );

    const realizedInflow = this.money(salesRevenue + manualRevenue);
    const realizedOutflow = this.money(manualExpenses + realizedPayables);

    return {
      period: this.mapPeriod(period),
      branchId: scope.branchId ?? null,
      realized: {
        inflow: realizedInflow,
        outflow: realizedOutflow,
        balance: this.money(realizedInflow - realizedOutflow),
      },
      forecast: {
        receivables: this.money(forecastReceivables),
        payables: this.money(forecastPayables),
        balance: this.money(forecastReceivables - forecastPayables),
      },
      sources: {
        paidOrders: orders.length,
        ledgerEntries: ledger.length,
        payables: payables.length,
        receivables: receivables.length,
      },
    };
  }

  async getDre(ctx: RequestContext, query: FinanceQuery = {}) {
    const period = this.resolvePeriod(query);
    const scope = await this.resolveBranchScope(ctx, query.branchId);
    const [orders, ledger, payables] = await Promise.all([
      this.findPaidOrders(period, scope),
      this.findLedger(period, scope),
      this.findPayables(period, scope),
    ]);

    const grossRevenue = this.money(
      this.sum(orders.map((order) => order.totalAmount)) +
        this.sum(ledger.filter((entry) => entry.entryType === 'REVENUE').map((entry) => entry.amount)),
    );
    const canceledAmount = this.sum(
      orders.filter((order) => order.status === 'CANCELED').map((order) => order.totalAmount),
    );
    const netRevenue = this.money(grossRevenue - canceledAmount);
    const cogs = 0;
    const grossMargin = this.money(netRevenue - cogs);
    const operatingExpenses = this.money(
      this.sum(ledger.filter((entry) => entry.entryType === 'EXPENSE').map((entry) => entry.amount)) +
        this.sum(payables.filter((item) => item.status === 'PAID').map((item) => item.paidAmount)),
    );
    const operatingProfit = this.money(grossMargin - operatingExpenses);

    return {
      period: this.mapPeriod(period),
      branchId: scope.branchId ?? null,
      grossRevenue,
      canceledAmount: this.money(canceledAmount),
      netRevenue,
      cogs,
      cogsSource: 'pending_recipe_stock_integration',
      grossMargin,
      grossMarginPercent: netRevenue > 0 ? this.money((grossMargin / netRevenue) * 100) : 0,
      operatingExpenses,
      operatingProfit,
      operatingProfitPercent: netRevenue > 0 ? this.money((operatingProfit / netRevenue) * 100) : 0,
    };
  }

  async getReconciliation(ctx: RequestContext, query: FinanceQuery = {}) {
    const period = this.resolvePeriod(query);
    const scope = await this.resolveBranchScope(ctx, query.branchId);
    const [orders, receivables, payables] = await Promise.all([
      this.findPaidOrders(period, scope),
      this.findReceivables(period, scope),
      this.findPayables(period, scope),
    ]);

    const receivableOrderIds = new Set(receivables.map((item) => item.orderId).filter(Boolean));
    const now = new Date();
    const items = [
      ...orders
        .filter((order) => !receivableOrderIds.has(order.id))
        .map((order) => ({
          type: 'ORDER_WITHOUT_RECEIVABLE',
          referenceId: order.id,
          expectedAmount: this.money(order.totalAmount),
          actualAmount: 0,
          differenceAmount: this.money(order.totalAmount),
          status: 'DIVERGENT',
        })),
      ...receivables
        .filter((item) => item.status !== 'PAID' && item.dueDate && item.dueDate < now)
        .map((item) => ({
          type: 'OVERDUE_RECEIVABLE',
          referenceId: item.id,
          expectedAmount: this.money(item.amount),
          actualAmount: this.money(item.paidAmount),
          differenceAmount: this.money(Number(item.amount) - Number(item.paidAmount)),
          status: 'PENDING',
        })),
      ...payables
        .filter((item) => item.status !== 'PAID' && item.dueDate < now)
        .map((item) => ({
          type: 'OVERDUE_PAYABLE',
          referenceId: item.id,
          expectedAmount: this.money(item.amount),
          actualAmount: this.money(item.paidAmount),
          differenceAmount: this.money(Number(item.amount) - Number(item.paidAmount)),
          status: 'PENDING',
        })),
    ];

    return {
      period: this.mapPeriod(period),
      branchId: scope.branchId ?? null,
      summary: {
        totalItems: items.length,
        divergent: items.filter((item) => item.status === 'DIVERGENT').length,
        pending: items.filter((item) => item.status === 'PENDING').length,
      },
      items,
    };
  }

  async listPayables(ctx: RequestContext, query: FinanceQuery = {}) {
    const period = this.resolvePeriod(query);
    const scope = await this.resolveBranchScope(ctx, query.branchId);
    const rows = await this.findPayables(period, scope);
    return rows.map((item) => this.mapPayable(item));
  }

  async listReceivables(ctx: RequestContext, query: FinanceQuery = {}) {
    const period = this.resolvePeriod(query);
    const scope = await this.resolveBranchScope(ctx, query.branchId);
    const rows = await this.findReceivables(period, scope);
    return rows.map((item) => this.mapReceivable(item));
  }

  async listLedger(ctx: RequestContext, query: FinanceQuery = {}) {
    const period = this.resolvePeriod(query);
    const scope = await this.resolveBranchScope(ctx, query.branchId);
    const rows = await this.findLedger(period, scope);
    return rows.map((item) => this.mapLedgerEntry(item));
  }

  async listCategories(ctx: RequestContext, query: FinanceQuery = {}) {
    const period = this.resolvePeriod(query);
    const scope = await this.resolveBranchScope(ctx, query.branchId);
    const [ledger, payables, receivables] = await Promise.all([
      this.findLedger(period, scope),
      this.findPayables(period, scope),
      this.findReceivables(period, scope),
    ]);
    const values = new Set(['vendas', 'delivery', 'compras', 'fornecedores', 'taxas', 'marketing', 'ajustes']);
    for (const row of ledger) if (row.reasonCode) values.add(row.reasonCode);
    for (const row of payables) if (row.reasonCode) values.add(row.reasonCode);
    for (const row of receivables) if (row.reasonCode) values.add(row.reasonCode);
    return Array.from(values).sort().map((key) => ({ key, label: this.toLabel(key) }));
  }

  async listCostCenters(ctx: RequestContext, query: FinanceQuery = {}) {
    const period = this.resolvePeriod(query);
    const scope = await this.resolveBranchScope(ctx, query.branchId);
    const ledger = await this.findLedger(period, scope);
    const values = new Set(['salao', 'delivery', 'cozinha', 'administrativo', 'marketing']);
    for (const row of ledger) {
      const metadata = row.metadata as { costCenter?: unknown } | null;
      const costCenter = String(metadata?.costCenter ?? '').trim();
      if (costCenter) values.add(costCenter);
    }
    return Array.from(values).sort().map((key) => ({ key, label: this.toLabel(key) }));
  }

  async createManualLedgerEntry(ctx: RequestContext, body: ManualLedgerInput) {
    const branchId = await this.resolveRequiredBranchId(ctx, body.branchId);
    const entryType = String(body.entryType ?? '').toUpperCase();
    if (entryType !== 'REVENUE' && entryType !== 'EXPENSE') {
      throw new BadRequestException('entryType deve ser REVENUE ou EXPENSE.');
    }
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Valor do lancamento deve ser maior que zero.');
    }

    const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException('occurredAt invalido.');
    }

    const created = await this.prisma.financialLedgerEntry.create({
      data: {
        branchId,
        actorUserId: ctx.userId ?? null,
        entryType,
        originType: 'MANUAL',
        amount,
        reasonCode: this.clean(body.category),
        reasonText: this.clean(body.description),
        externalReference: this.clean(body.externalReference),
        requestId: ctx.requestId,
        metadata: {
          category: this.clean(body.category),
          costCenter: this.clean(body.costCenter),
          occurredAt: occurredAt.toISOString(),
        },
      },
    });

    return this.mapLedgerEntry(created);
  }

  async createManualPayable(ctx: RequestContext, body: ManualAccountInput) {
    const branchId = await this.resolveRequiredBranchId(ctx, body.branchId);
    const description = this.requireText(body.description, 'description');
    const amount = this.requirePositiveAmount(body.amount, 'amount');
    const dueDate = this.resolveDate(body.dueDate, 'dueDate', true);

    const created = await this.prisma.accountsPayable.create({
      data: {
        branchId,
        createdById: ctx.userId ?? null,
        description,
        amount,
        dueDate,
        originType: 'MANUAL',
        externalReference: this.clean(body.externalReference),
        reasonCode: this.clean(body.category),
        reasonText: this.clean(body.costCenter),
      },
      include: { supplier: { select: { id: true, name: true } } },
    });

    return this.mapPayable(created);
  }

  async createManualReceivable(ctx: RequestContext, body: ManualAccountInput) {
    const branchId = await this.resolveRequiredBranchId(ctx, body.branchId);
    const description = this.requireText(body.description, 'description');
    const amount = this.requirePositiveAmount(body.amount, 'amount');
    const dueDate = this.resolveDate(body.dueDate, 'dueDate', false);

    const created = await this.prisma.accountsReceivable.create({
      data: {
        branchId,
        createdById: ctx.userId ?? null,
        description,
        amount,
        dueDate,
        originType: 'MANUAL',
        externalReference: this.clean(body.externalReference),
        reasonCode: this.clean(body.category),
        reasonText: this.clean(body.costCenter),
      },
    });

    return this.mapReceivable(created);
  }

  async settlePayable(ctx: RequestContext, id: string, body: AccountSettlementInput) {
    const amount = this.requirePositiveAmount(body.amount, 'amount');
    const settledAt = this.resolveDate(body.settledAt, 'settledAt', false) ?? new Date();

    return this.prisma.$transaction(async (tx) => {
      const payable = await tx.accountsPayable.findFirst({
        where: { id, branch: { companyId: ctx.companyId } },
        include: { supplier: { select: { id: true, name: true } } },
      });
      if (!payable) throw new BadRequestException(`Conta a pagar '${id}' nao encontrada para a empresa atual.`);
      if (payable.status === 'CANCELED') throw new BadRequestException('Conta a pagar cancelada nao pode ser baixada.');

      const paidBefore = Number(payable.paidAmount ?? 0);
      const total = Number(payable.amount ?? 0);
      const nextPaid = this.money(paidBefore + amount);
      if (nextPaid > total) throw new BadRequestException('Valor de baixa excede saldo da conta a pagar.');

      const settlement = await tx.payableSettlement.create({
        data: {
          accountsPayableId: payable.id,
          branchId: payable.branchId,
          createdById: ctx.userId ?? null,
          settlementMethod: body.settlementMethod ?? 'EXTERNAL',
          amount,
          settledAt,
          externalReference: this.clean(body.externalReference),
          reasonText: this.clean(body.reasonText),
          requestId: ctx.requestId,
        },
      });
      const status = nextPaid >= total ? 'PAID' : 'PARTIALLY_PAID';
      const updated = await tx.accountsPayable.update({
        where: { id: payable.id },
        data: {
          paidAmount: nextPaid,
          status,
          settledAt: status === 'PAID' ? settledAt : payable.settledAt,
          updatedById: ctx.userId ?? null,
        },
        include: { supplier: { select: { id: true, name: true } } },
      });
      await tx.financialLedgerEntry.create({
        data: {
          branchId: payable.branchId,
          actorUserId: ctx.userId ?? null,
          entryType: 'EXPENSE',
          originType: 'MANUAL',
          accountsPayableId: payable.id,
          payableSettlementId: settlement.id,
          amount,
          reasonCode: payable.reasonCode,
          reasonText: body.reasonText ?? payable.description,
          requestId: ctx.requestId,
          metadata: { settlementMethod: body.settlementMethod ?? 'EXTERNAL' },
        },
      });
      return this.mapPayable(updated);
    });
  }

  async settleReceivable(ctx: RequestContext, id: string, body: AccountSettlementInput) {
    const amount = this.requirePositiveAmount(body.amount, 'amount');
    const settledAt = this.resolveDate(body.settledAt, 'settledAt', false) ?? new Date();

    return this.prisma.$transaction(async (tx) => {
      const receivable = await tx.accountsReceivable.findFirst({
        where: { id, branch: { companyId: ctx.companyId } },
      });
      if (!receivable) throw new BadRequestException(`Conta a receber '${id}' nao encontrada para a empresa atual.`);
      if (receivable.status === 'CANCELED') throw new BadRequestException('Conta a receber cancelada nao pode ser baixada.');

      const paidBefore = Number(receivable.paidAmount ?? 0);
      const total = Number(receivable.amount ?? 0);
      const nextPaid = this.money(paidBefore + amount);
      if (nextPaid > total) throw new BadRequestException('Valor de baixa excede saldo da conta a receber.');

      const settlement = await tx.receivableSettlement.create({
        data: {
          accountsReceivableId: receivable.id,
          branchId: receivable.branchId,
          paymentId: receivable.paymentId ?? null,
          createdById: ctx.userId ?? null,
          settlementMethod: body.settlementMethod ?? 'EXTERNAL',
          amount,
          settledAt,
          externalReference: this.clean(body.externalReference),
          reasonText: this.clean(body.reasonText),
          requestId: ctx.requestId,
        },
      });
      const status = nextPaid >= total ? 'PAID' : 'PARTIALLY_PAID';
      const updated = await tx.accountsReceivable.update({
        where: { id: receivable.id },
        data: {
          paidAmount: nextPaid,
          status,
          settledAt: status === 'PAID' ? settledAt : receivable.settledAt,
          updatedById: ctx.userId ?? null,
        },
      });
      await tx.financialLedgerEntry.create({
        data: {
          branchId: receivable.branchId,
          actorUserId: ctx.userId ?? null,
          entryType: 'REVENUE',
          originType: 'MANUAL',
          accountsReceivableId: receivable.id,
          receivableSettlementId: settlement.id,
          paymentId: receivable.paymentId ?? null,
          orderId: receivable.orderId ?? null,
          amount,
          reasonCode: receivable.reasonCode,
          reasonText: body.reasonText ?? receivable.description,
          requestId: ctx.requestId,
          metadata: { settlementMethod: body.settlementMethod ?? 'EXTERNAL' },
        },
      });
      return this.mapReceivable(updated);
    });
  }

  private async findPaidOrders(period: Period, scope: BranchScope) {
    return this.prisma.order.findMany({
      where: {
        branch: scope.whereBranch,
        createdAt: { gte: period.from, lte: period.to },
        paymentStatus: { in: ['PAID', 'PARTIALLY_PAID'] },
        deletedAt: null,
      },
      select: {
        id: true,
        branchId: true,
        status: true,
        paymentStatus: true,
        totalAmount: true,
        createdAt: true,
      },
    });
  }

  private async findLedger(period: Period, scope: BranchScope) {
    return this.prisma.financialLedgerEntry.findMany({
      where: {
        branch: scope.whereBranch,
        createdAt: { gte: period.from, lte: period.to },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  private async findPayables(period: Period, scope: BranchScope) {
    return this.prisma.accountsPayable.findMany({
      where: {
        branch: scope.whereBranch,
        dueDate: { gte: period.from, lte: period.to },
        canceledAt: null,
      },
      include: { supplier: { select: { id: true, name: true } } },
      orderBy: { dueDate: 'asc' },
      take: 200,
    });
  }

  private async findReceivables(period: Period, scope: BranchScope) {
    return this.prisma.accountsReceivable.findMany({
      where: {
        branch: scope.whereBranch,
        OR: [
          { dueDate: { gte: period.from, lte: period.to } },
          { settledAt: { gte: period.from, lte: period.to } },
        ],
        canceledAt: null,
      },
      orderBy: { dueDate: 'asc' },
      take: 200,
    });
  }

  private resolvePeriod(query: FinanceQuery): Period {
    const now = new Date();
    const from = query.from ? new Date(query.from) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to = query.to ? new Date(query.to) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      throw new BadRequestException('Periodo financeiro invalido.');
    }
    return { from, to };
  }

  private async resolveBranchScope(ctx: RequestContext, branchId?: string): Promise<BranchScope> {
    if (!branchId) {
      return { whereBranch: { companyId: ctx.companyId } };
    }
    await this.assertBranchBelongsToCompany(ctx.companyId, branchId);
    return { branchId, whereBranch: { companyId: ctx.companyId, id: branchId } };
  }

  private async resolveRequiredBranchId(ctx: RequestContext, branchId?: string): Promise<string> {
    if (branchId) {
      await this.assertBranchBelongsToCompany(ctx.companyId, branchId);
      return branchId;
    }
    if (ctx.branchId) {
      await this.assertBranchBelongsToCompany(ctx.companyId, ctx.branchId);
      return ctx.branchId;
    }
    const fallback = await this.prisma.branch.findFirst({
      where: { companyId: ctx.companyId },
      select: { id: true },
    });
    if (!fallback) {
      throw new BadRequestException(`Nenhuma filial encontrada para company '${ctx.companyId}'.`);
    }
    return fallback.id;
  }

  private async assertBranchBelongsToCompany(companyId: string, branchId: string): Promise<void> {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, companyId },
      select: { id: true },
    });
    if (!branch) {
      throw new BadRequestException(`Branch '${branchId}' nao pertence a company '${companyId}'.`);
    }
  }

  private mapLedgerEntry(item: {
    id: string;
    branchId: string;
    entryType: string;
    originType: string;
    originId?: string | null;
    amount: number | { toString(): string };
    reasonCode?: string | null;
    reasonText?: string | null;
    externalReference?: string | null;
    createdAt: Date;
    metadata?: unknown;
  }) {
    return {
      id: item.id,
      branchId: item.branchId,
      entryType: item.entryType,
      originType: item.originType,
      originId: item.originId ?? null,
      amount: this.money(item.amount),
      category: item.reasonCode ?? null,
      description: item.reasonText ?? null,
      externalReference: item.externalReference ?? null,
      createdAt: item.createdAt.toISOString(),
      metadata: item.metadata ?? null,
    };
  }

  private mapPayable(item: {
    id: string;
    branchId: string;
    description: string;
    amount: number | { toString(): string };
    paidAmount: number | { toString(): string };
    dueDate: Date;
    status: string;
    reasonCode?: string | null;
    reasonText?: string | null;
    supplier?: { id: string; name: string } | null;
  }) {
    return {
      id: item.id,
      branchId: item.branchId,
      description: item.description,
      amount: this.money(item.amount),
      paidAmount: this.money(item.paidAmount),
      dueDate: item.dueDate.toISOString(),
      status: item.status,
      category: item.reasonCode ?? null,
      costCenter: item.reasonText ?? null,
      supplier: item.supplier ? { id: item.supplier.id, name: item.supplier.name } : null,
    };
  }

  private mapReceivable(item: {
    id: string;
    branchId: string;
    description: string;
    amount: number | { toString(): string };
    paidAmount: number | { toString(): string };
    dueDate?: Date | null;
    status: string;
    reasonCode?: string | null;
    reasonText?: string | null;
    orderId?: string | null;
    paymentId?: string | null;
  }) {
    return {
      id: item.id,
      branchId: item.branchId,
      description: item.description,
      amount: this.money(item.amount),
      paidAmount: this.money(item.paidAmount),
      dueDate: item.dueDate?.toISOString() ?? null,
      status: item.status,
      category: item.reasonCode ?? null,
      costCenter: item.reasonText ?? null,
      orderId: item.orderId ?? null,
      paymentId: item.paymentId ?? null,
    };
  }

  private mapPeriod(period: Period) {
    return {
      from: period.from.toISOString(),
      to: period.to.toISOString(),
    };
  }

  private clean(value?: string): string | undefined {
    const normalized = String(value ?? '').trim();
    return normalized || undefined;
  }

  private requireText(value: string | undefined, fieldName: string): string {
    const normalized = this.clean(value);
    if (!normalized) {
      throw new BadRequestException(`${fieldName} e obrigatorio.`);
    }
    return normalized;
  }

  private requirePositiveAmount(value: number, fieldName: string): number {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException(`${fieldName} deve ser maior que zero.`);
    }
    return this.money(amount);
  }

  private resolveDate(value: string | undefined, fieldName: string, required: true): Date;
  private resolveDate(value: string | undefined, fieldName: string, required: false): Date | null;
  private resolveDate(value: string | undefined, fieldName: string, required: boolean): Date | null {
    if (!value) {
      if (required) throw new BadRequestException(`${fieldName} e obrigatorio.`);
      return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} invalido.`);
    }
    return parsed;
  }

  private toLabel(key: string): string {
    return key
      .split(/[_\-\s]+/g)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private sum(values: Array<number | { toString(): string }>): number {
    return values.reduce<number>((acc, value) => acc + Number(value ?? 0), 0);
  }

  private money(value: number | { toString(): string }): number {
    return Number(Number(value ?? 0).toFixed(2));
  }
}
