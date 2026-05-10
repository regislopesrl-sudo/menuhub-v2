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
    return rows.map((item) => ({
      id: item.id,
      branchId: item.branchId,
      description: item.description,
      amount: this.money(item.amount),
      paidAmount: this.money(item.paidAmount),
      dueDate: item.dueDate.toISOString(),
      status: item.status,
      supplier: item.supplier ? { id: item.supplier.id, name: item.supplier.name } : null,
    }));
  }

  async listReceivables(ctx: RequestContext, query: FinanceQuery = {}) {
    const period = this.resolvePeriod(query);
    const scope = await this.resolveBranchScope(ctx, query.branchId);
    const rows = await this.findReceivables(period, scope);
    return rows.map((item) => ({
      id: item.id,
      branchId: item.branchId,
      description: item.description,
      amount: this.money(item.amount),
      paidAmount: this.money(item.paidAmount),
      dueDate: item.dueDate?.toISOString() ?? null,
      status: item.status,
      orderId: item.orderId ?? null,
      paymentId: item.paymentId ?? null,
    }));
  }

  async listLedger(ctx: RequestContext, query: FinanceQuery = {}) {
    const period = this.resolvePeriod(query);
    const scope = await this.resolveBranchScope(ctx, query.branchId);
    const rows = await this.findLedger(period, scope);
    return rows.map((item) => this.mapLedgerEntry(item));
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

  private sum(values: Array<number | { toString(): string }>): number {
    return values.reduce<number>((acc, value) => acc + Number(value ?? 0), 0);
  }

  private money(value: number | { toString(): string }): number {
    return Number(Number(value ?? 0).toFixed(2));
  }
}
