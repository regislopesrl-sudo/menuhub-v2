import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AUDIT_ACTIONS } from '../common/audit-log';
import { recordAuditFromContext } from '../common/audit-log-recorder';
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
  categoryId?: string;
  costCenter?: string;
  costCenterId?: string;
  financialAccountId?: string;
  occurredAt?: string;
  branchId?: string;
  externalReference?: string;
};

export type ManualAccountInput = {
  description: string;
  amount: number;
  dueDate?: string;
  category?: string;
  categoryId?: string;
  costCenter?: string;
  costCenterId?: string;
  financialAccountId?: string;
  branchId?: string;
  externalReference?: string;
};

export type FinanceCategoryInput = {
  type?: 'REVENUE' | 'EXPENSE' | 'BOTH';
  name?: string;
  description?: string;
  parentId?: string | null;
  status?: string;
  sortOrder?: number;
};

export type CostCenterInput = {
  name?: string;
  description?: string;
  branchId?: string | null;
  status?: string;
};

export type FinancialAccountInput = {
  type?: 'CASH' | 'BANK' | 'PIX' | 'CARD' | 'MARKETPLACE' | 'TRANSITORY' | 'OTHER';
  name?: string;
  description?: string;
  branchId?: string | null;
  openingBalance?: number;
  currentBalance?: number;
  status?: string;
};

export type AccountPatchInput = Partial<ManualAccountInput> & {
  status?: string;
};

export type LedgerCancelInput = {
  reason?: string;
};

export type ReconciliationActionInput = {
  reason?: string;
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

type DreReport = {
  period: { from: string; to: string };
  branchId: string | null;
  grossRevenue: number;
  canceledAmount: number;
  netRevenue: number;
  cogs: number;
  cogsSource: string;
  cogsStatus?: string;
  grossMargin: number;
  grossMarginPercent: number;
  operatingExpenses: number;
  operatingProfit: number;
  operatingProfitPercent: number;
};

type CogsSummary = {
  totalCogs: number;
  dataStatus: 'COMPLETE' | 'PARTIAL_DATA' | 'NO_DATA';
  source: string;
  soldItems: number;
  itemsWithoutCost: number;
  fallbackCostItems: number;
};

type CmvProductRow = {
  productId: string | null;
  productName: string;
  categoryName: string | null;
  quantitySold: number;
  revenue: number;
  cogs: number;
  grossMargin: number;
  grossMarginPercent: number;
  averageUnitCost: number;
  itemsWithoutCost: number;
  hasRecipe: boolean;
  dataStatus: 'COMPLETE' | 'PARTIAL_DATA' | 'NO_DATA';
};

type DailyCashFlowDraft = {
  date: string;
  salesRevenue: number;
  manualRevenue: number;
  receivedReceivables: number;
  manualExpenses: number;
  paidPayables: number;
  forecastReceivables: number;
  forecastPayables: number;
};

@Injectable()
export class FinanceService {
  private readonly defaultSetupCompanies = new Set<string>();

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

  async getReport(ctx: RequestContext, query: FinanceQuery = {}) {
    const period = this.resolvePeriod(query);
    const previousPeriod = this.resolvePreviousPeriod(period);
    const previousQuery = {
      ...query,
      from: previousPeriod.from.toISOString(),
      to: previousPeriod.to.toISOString(),
    };
    const [
      overview,
      cashFlow,
      dre,
      previousDre,
      dailyCashFlow,
      cmv,
      reconciliation,
      ledger,
      payables,
      receivables,
      categories,
      costCenters,
      financialAccounts,
      paymentFees,
      receivableSchedules,
    ] = await Promise.all([
      this.getOverview(ctx, query),
      this.getCashFlow(ctx, query),
      this.getDre(ctx, query),
      this.getDre(ctx, previousQuery),
      this.getDailyCashFlow(ctx, query),
      this.getCmv(ctx, query),
      this.getReconciliation(ctx, query),
      this.listLedger(ctx, query),
      this.listPayables(ctx, query),
      this.listReceivables(ctx, query),
      this.listCategories(ctx, query),
      this.listCostCenters(ctx, query),
      this.listFinancialAccounts(ctx, query),
      this.listPaymentFees(ctx, query),
      this.listReceivableSchedules(ctx, query),
    ]);

    const categoryBreakdown = this.buildCategoryBreakdown(ledger, payables, receivables);
    const costCenterBreakdown = this.buildCostCenterBreakdown(ledger, payables, receivables);

    return {
      generatedAt: new Date().toISOString(),
      period: overview.period,
      branchId: overview.branchId,
      overview,
      cashFlow,
      dre,
      dreComparison: this.buildDreComparison(dre, previousDre),
      dailyCashFlow,
      cmv,
      executiveAlerts: this.buildExecutiveAlerts(cashFlow, dre, cmv, reconciliation, payables, receivables),
      financeHealth: this.buildFinanceHealth(cashFlow, dre, cmv, reconciliation, payables, receivables),
      reconciliation,
      ledger,
      payables,
      receivables,
      categories,
      costCenters,
      financialAccounts,
      paymentFees,
      receivableSchedules,
      breakdowns: {
        categories: categoryBreakdown,
        costCenters: costCenterBreakdown,
      },
      totals: {
        ledgerEntries: ledger.length,
        payables: payables.length,
        receivables: receivables.length,
        openPayables: overview.openPayables,
        openReceivables: overview.openReceivables,
      },
    };
  }

  async createSnapshots(ctx: RequestContext, query: FinanceQuery = {}) {
    const period = this.resolvePeriod(query);
    const scope = await this.resolveBranchScope(ctx, query.branchId);
    const report = await this.getReport(ctx, query);
    const branchId = scope.branchId ?? null;
    const cmvProducts = report.cmv?.products ?? [];

    await this.prisma.$transaction(async (tx) => {
      await tx.cashFlowSnapshot.deleteMany({
        where: { companyId: ctx.companyId, branchId, periodStart: period.from, periodEnd: period.to },
      });
      await tx.dreSnapshot.deleteMany({
        where: { companyId: ctx.companyId, branchId, periodStart: period.from, periodEnd: period.to },
      });
      await tx.cmvSnapshot.deleteMany({
        where: { companyId: ctx.companyId, branchId, periodStart: period.from, periodEnd: period.to },
      });
      await tx.cashFlowSnapshot.create({
        data: {
          companyId: ctx.companyId,
          branchId,
          periodStart: period.from,
          periodEnd: period.to,
          totalRevenue: report.cashFlow.realized.inflow,
          totalExpense: report.cashFlow.realized.outflow,
          netCashFlow: report.cashFlow.realized.balance,
          projectedRevenue: report.cashFlow.forecast.receivables,
          projectedExpense: report.cashFlow.forecast.payables,
          projectedBalance: report.cashFlow.forecast.balance,
          dataStatus: 'COMPLETE',
          metadata: { sources: report.cashFlow.sources, generatedAt: report.generatedAt },
        },
      });
      await tx.dreSnapshot.create({
        data: {
          companyId: ctx.companyId,
          branchId,
          periodStart: period.from,
          periodEnd: period.to,
          grossRevenue: report.dre.grossRevenue,
          cancellationsRefunds: report.dre.canceledAmount,
          netRevenue: report.dre.netRevenue,
          cmv: report.dre.cogs,
          grossMargin: report.dre.grossMargin,
          operationalExpenses: report.dre.operatingExpenses,
          operationalProfit: report.dre.operatingProfit,
          dataStatus: report.dre.cogsStatus === 'COMPLETE' ? 'COMPLETE' : 'PARTIAL_DATA',
          metadata: { cogsSource: report.dre.cogsSource, generatedAt: report.generatedAt },
        },
      });
      if (cmvProducts.length > 0) {
        await tx.cmvSnapshot.createMany({
          data: cmvProducts.map((product) => ({
            companyId: ctx.companyId,
            branchId,
            periodStart: period.from,
            periodEnd: period.to,
            productId: product.productId,
            quantitySold: product.quantitySold,
            averageCost: product.averageUnitCost,
            totalCost: product.cogs,
            revenue: product.revenue,
            grossMargin: product.grossMargin,
            grossMarginPct: product.grossMarginPercent,
            dataStatus: product.dataStatus,
            metadata: {
              productName: product.productName,
              categoryName: product.categoryName,
              hasRecipe: product.hasRecipe,
              itemsWithoutCost: product.itemsWithoutCost,
            },
          })),
        });
      }
    });

    recordAuditFromContext({
      action: AUDIT_ACTIONS.FINANCE_CASH_FLOW_VIEW,
      outcome: 'success',
      ctx,
      target: { type: 'finance_snapshot', id: `${ctx.companyId}:${branchId ?? 'all'}:${period.from.toISOString()}` },
      metadata: { period: this.mapPeriod(period), cmvProducts: cmvProducts.length },
    });

    return {
      period: this.mapPeriod(period),
      branchId,
      cashFlowSnapshots: 1,
      dreSnapshots: 1,
      cmvSnapshots: cmvProducts.length,
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
    const standaloneLedger = ledger.filter((entry) => this.isStandaloneLedger(entry));
    const manualRevenue = this.sum(
      standaloneLedger.filter((entry) => entry.entryType === 'REVENUE').map((entry) => entry.amount),
    );
    const manualExpenses = this.sum(
      standaloneLedger.filter((entry) => entry.entryType === 'EXPENSE').map((entry) => entry.amount),
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

    const standaloneLedger = ledger.filter((entry) => this.isStandaloneLedger(entry));
    const grossRevenue = this.money(
      this.sum(orders.map((order) => order.totalAmount)) +
        this.sum(standaloneLedger.filter((entry) => entry.entryType === 'REVENUE').map((entry) => entry.amount)),
    );
    const canceledAmount = this.sum(
      orders.filter((order) => order.status === 'CANCELED').map((order) => order.totalAmount),
    );
    const netRevenue = this.money(grossRevenue - canceledAmount);
    const cogsSummary = await this.getCogsForOrders(
      orders.filter((order) => order.status !== 'CANCELED').map((order) => order.id),
    );
    const cogs = cogsSummary.totalCogs;
    const grossMargin = this.money(netRevenue - cogs);
    const operatingExpenses = this.money(
      this.sum(standaloneLedger.filter((entry) => entry.entryType === 'EXPENSE').map((entry) => entry.amount)) +
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
      cogsSource: cogsSummary.source,
      cogsStatus: cogsSummary.dataStatus,
      grossMargin,
      grossMarginPercent: netRevenue > 0 ? this.money((grossMargin / netRevenue) * 100) : 0,
      operatingExpenses,
      operatingProfit,
      operatingProfitPercent: netRevenue > 0 ? this.money((operatingProfit / netRevenue) * 100) : 0,
    };
  }

  async getCmv(ctx: RequestContext, query: FinanceQuery = {}) {
    const period = this.resolvePeriod(query);
    const scope = await this.resolveBranchScope(ctx, query.branchId);
    const items = await this.findSoldOrderItems(period, scope);
    const products = new Map<string, CmvProductRow>();
    let itemsWithoutCost = 0;
    let fallbackCostItems = 0;

    for (const item of items) {
      const productId = item.productId ?? null;
      const key = productId ?? `snapshot:${item.productNameSnapshot}`;
      const unitCost = this.resolveUnitCost(item);
      const quantity = this.money(item.quantity);
      const revenue = this.money(item.totalPrice);
      const cogs = this.money(quantity * unitCost.unitCost);
      if (unitCost.source === 'MISSING') itemsWithoutCost += 1;
      if (unitCost.dataStatus === 'PARTIAL_DATA') fallbackCostItems += 1;

      if (!products.has(key)) {
        products.set(key, {
          productId,
          productName: item.productNameSnapshot,
          categoryName: item.product?.category?.name ?? null,
          quantitySold: 0,
          revenue: 0,
          cogs: 0,
          grossMargin: 0,
          grossMarginPercent: 0,
          averageUnitCost: 0,
          itemsWithoutCost: 0,
          hasRecipe: Boolean(item.product?.recipeId),
          dataStatus: 'COMPLETE',
        });
      }

      const row = products.get(key)!;
      row.quantitySold = this.money(row.quantitySold + quantity);
      row.revenue = this.money(row.revenue + revenue);
      row.cogs = this.money(row.cogs + cogs);
      row.itemsWithoutCost += unitCost.source === 'MISSING' ? 1 : 0;
      if (!item.product?.recipeId || unitCost.dataStatus !== 'COMPLETE') row.dataStatus = 'PARTIAL_DATA';
      if (row.itemsWithoutCost > 0) row.dataStatus = 'NO_DATA';
    }

    const rows = Array.from(products.values()).map((row) => {
      const grossMargin = this.money(row.revenue - row.cogs);
      return {
        ...row,
        grossMargin,
        grossMarginPercent: row.revenue > 0 ? this.money((grossMargin / row.revenue) * 100) : 0,
        averageUnitCost: row.quantitySold > 0 ? this.money(row.cogs / row.quantitySold) : 0,
      };
    });
    const totalRevenue = this.money(this.sum(rows.map((row) => row.revenue)));
    const totalCogs = this.money(this.sum(rows.map((row) => row.cogs)));
    const grossMargin = this.money(totalRevenue - totalCogs);
    const productsWithoutRecipe = rows.filter((row) => !row.hasRecipe).length;
    const dataStatus = rows.length === 0
      ? 'NO_DATA'
      : itemsWithoutCost > 0 || fallbackCostItems > 0 || productsWithoutRecipe > 0
        ? 'PARTIAL_DATA'
        : 'COMPLETE';

    return {
      period: this.mapPeriod(period),
      branchId: scope.branchId ?? null,
      summary: {
        totalRevenue,
        totalCogs,
        grossMargin,
        grossMarginPercent: totalRevenue > 0 ? this.money((grossMargin / totalRevenue) * 100) : 0,
        soldItems: items.length,
        soldProducts: rows.length,
        itemsWithoutCost,
        productsWithoutRecipe,
        fallbackCostItems,
        dataStatus,
      },
      products: rows.sort((a, b) => b.cogs - a.cogs).slice(0, 50),
    };
  }

  async getDailyCashFlow(ctx: RequestContext, query: FinanceQuery = {}) {
    const period = this.resolvePeriod(query);
    const scope = await this.resolveBranchScope(ctx, query.branchId);
    const [orders, ledger, payables, receivables] = await Promise.all([
      this.findPaidOrders(period, scope),
      this.findLedger(period, scope),
      this.findPayables(period, scope),
      this.findReceivables(period, scope),
    ]);
    const rows = this.buildDailyCashFlowRows(period);
    const byDate = new Map(rows.map((row) => [row.date, row]));

    for (const order of orders) {
      const row = byDate.get(this.dayKey(order.createdAt));
      if (row) row.salesRevenue = this.money(row.salesRevenue + Number(order.totalAmount ?? 0));
    }

    for (const entry of ledger.filter((item) => this.isStandaloneLedger(item))) {
      const row = byDate.get(this.dayKey(entry.createdAt));
      if (!row) continue;
      if (entry.entryType === 'REVENUE') row.manualRevenue = this.money(row.manualRevenue + Number(entry.amount ?? 0));
      if (entry.entryType === 'EXPENSE') row.manualExpenses = this.money(row.manualExpenses + Number(entry.amount ?? 0));
    }

    for (const payable of payables) {
      const paidAmount = Number(payable.paidAmount ?? 0);
      if (paidAmount > 0) {
        const paidAt = payable.settledAt ?? payable.dueDate;
        const row = byDate.get(this.dayKey(paidAt));
        if (row) row.paidPayables = this.money(row.paidPayables + paidAmount);
      }
      const openAmount = Math.max(0, Number(payable.amount ?? 0) - paidAmount);
      if (openAmount > 0 && payable.status !== 'PAID' && payable.status !== 'CANCELED') {
        const row = byDate.get(this.dayKey(payable.dueDate));
        if (row) row.forecastPayables = this.money(row.forecastPayables + openAmount);
      }
    }

    for (const receivable of receivables) {
      const paidAmount = Number(receivable.paidAmount ?? 0);
      if (paidAmount > 0 && !receivable.orderId) {
        const paidAt = receivable.settledAt ?? receivable.dueDate ?? period.from;
        const row = byDate.get(this.dayKey(paidAt));
        if (row) row.receivedReceivables = this.money(row.receivedReceivables + paidAmount);
      }
      const openAmount = Math.max(0, Number(receivable.amount ?? 0) - paidAmount);
      if (openAmount > 0 && receivable.status !== 'PAID' && receivable.status !== 'CANCELED' && receivable.dueDate) {
        const row = byDate.get(this.dayKey(receivable.dueDate));
        if (row) row.forecastReceivables = this.money(row.forecastReceivables + openAmount);
      }
    }

    let cumulativeBalance = 0;
    return rows.map((row) => {
      const realizedInflow = this.money(row.salesRevenue + row.manualRevenue + row.receivedReceivables);
      const realizedOutflow = this.money(row.manualExpenses + row.paidPayables);
      const realizedBalance = this.money(realizedInflow - realizedOutflow);
      cumulativeBalance = this.money(cumulativeBalance + realizedBalance);
      const forecastBalance = this.money(row.forecastReceivables - row.forecastPayables);
      return {
        date: row.date,
        salesRevenue: row.salesRevenue,
        manualRevenue: row.manualRevenue,
        receivedReceivables: row.receivedReceivables,
        manualExpenses: row.manualExpenses,
        paidPayables: row.paidPayables,
        realizedInflow,
        realizedOutflow,
        realizedBalance,
        cumulativeBalance,
        forecastReceivables: row.forecastReceivables,
        forecastPayables: row.forecastPayables,
        forecastBalance,
      };
    });
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
    await this.ensureDefaultFinanceSetup(ctx);
    const rows = await this.prisma.financialCategory.findMany({
      where: { companyId: ctx.companyId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      take: 300,
    });
    return rows.map((row) => this.mapFinancialCategory(row));
  }

  async listCostCenters(ctx: RequestContext, query: FinanceQuery = {}) {
    await this.ensureDefaultFinanceSetup(ctx);
    const scope = await this.resolveBranchScope(ctx, query.branchId);
    const rows = await this.prisma.costCenter.findMany({
      where: { companyId: ctx.companyId, OR: [{ branchId: null }, ...(scope.branchId ? [{ branchId: scope.branchId }] : [])] },
      orderBy: [{ name: 'asc' }],
      take: 300,
    });
    return rows.map((row) => this.mapCostCenter(row));
  }

  async listFinancialAccounts(ctx: RequestContext, query: FinanceQuery = {}) {
    await this.ensureDefaultFinanceSetup(ctx);
    const scope = await this.resolveBranchScope(ctx, query.branchId);
    const rows = await this.prisma.financialAccount.findMany({
      where: { companyId: ctx.companyId, OR: [{ branchId: null }, ...(scope.branchId ? [{ branchId: scope.branchId }] : [])] },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      take: 300,
    });
    return rows.map((row) => this.mapFinancialAccount(row));
  }

  async createCategory(ctx: RequestContext, body: FinanceCategoryInput) {
    const name = this.requireText(body.name, 'name');
    const type = this.resolveCategoryType(body.type);
    const parentId = await this.resolveOptionalCategoryParent(ctx, body.parentId);
    const created = await this.prisma.financialCategory.create({
      data: {
        companyId: ctx.companyId,
        parentId,
        type,
        name,
        description: this.clean(body.description),
        status: this.clean(body.status) ?? 'ACTIVE',
        sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
      },
    });
    recordAuditFromContext({
      action: AUDIT_ACTIONS.FINANCE_CATEGORY_CREATE,
      outcome: 'success',
      ctx,
      target: { type: 'financial_category', id: created.id, label: created.name },
      metadata: { type: created.type, status: created.status },
    });
    return this.mapFinancialCategory(created);
  }

  async updateCategory(ctx: RequestContext, id: string, body: FinanceCategoryInput) {
    const existing = await this.prisma.financialCategory.findFirst({ where: { id, companyId: ctx.companyId } });
    if (!existing) throw new NotFoundException('Categoria financeira nao encontrada.');
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = this.requireText(body.name, 'name');
    if (body.type !== undefined) data.type = this.resolveCategoryType(body.type);
    if (body.description !== undefined) data.description = this.clean(body.description) ?? null;
    if (body.status !== undefined) data.status = this.clean(body.status) ?? 'ACTIVE';
    if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder) || 0;
    if (body.parentId !== undefined) data.parentId = await this.resolveOptionalCategoryParent(ctx, body.parentId);
    if (Object.keys(data).length === 0) throw new BadRequestException('Payload vazio.');
    const updated = await this.prisma.financialCategory.update({ where: { id }, data });
    recordAuditFromContext({
      action: AUDIT_ACTIONS.FINANCE_CATEGORY_UPDATE,
      outcome: 'success',
      ctx,
      target: { type: 'financial_category', id: updated.id, label: updated.name },
      metadata: { changedFields: Object.keys(data), status: updated.status },
    });
    return this.mapFinancialCategory(updated);
  }

  async updateCategoryStatus(ctx: RequestContext, id: string, body: { status?: string }) {
    return this.updateCategory(ctx, id, { status: this.clean(body.status) ?? 'INACTIVE' });
  }

  async createCostCenter(ctx: RequestContext, body: CostCenterInput) {
    const name = this.requireText(body.name, 'name');
    const branchId = body.branchId === null ? null : body.branchId ? await this.resolveRequiredBranchId(ctx, body.branchId) : null;
    const created = await this.prisma.costCenter.create({
      data: {
        companyId: ctx.companyId,
        branchId,
        name,
        description: this.clean(body.description),
        status: this.clean(body.status) ?? 'ACTIVE',
      },
    });
    recordAuditFromContext({
      action: AUDIT_ACTIONS.FINANCE_COST_CENTER_CREATE,
      outcome: 'success',
      ctx,
      target: { type: 'cost_center', id: created.id, label: created.name },
      metadata: { branchId: created.branchId, status: created.status },
    });
    return this.mapCostCenter(created);
  }

  async updateCostCenter(ctx: RequestContext, id: string, body: CostCenterInput) {
    const existing = await this.prisma.costCenter.findFirst({ where: { id, companyId: ctx.companyId } });
    if (!existing) throw new NotFoundException('Centro de custo nao encontrado.');
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = this.requireText(body.name, 'name');
    if (body.description !== undefined) data.description = this.clean(body.description) ?? null;
    if (body.status !== undefined) data.status = this.clean(body.status) ?? 'ACTIVE';
    if (body.branchId !== undefined) data.branchId = body.branchId === null ? null : await this.resolveRequiredBranchId(ctx, body.branchId);
    if (Object.keys(data).length === 0) throw new BadRequestException('Payload vazio.');
    const updated = await this.prisma.costCenter.update({ where: { id }, data });
    recordAuditFromContext({
      action: AUDIT_ACTIONS.FINANCE_COST_CENTER_UPDATE,
      outcome: 'success',
      ctx,
      target: { type: 'cost_center', id: updated.id, label: updated.name },
      metadata: { changedFields: Object.keys(data), status: updated.status },
    });
    return this.mapCostCenter(updated);
  }

  async createFinancialAccount(ctx: RequestContext, body: FinancialAccountInput) {
    const name = this.requireText(body.name, 'name');
    const type = this.resolveFinancialAccountType(body.type);
    const branchId = body.branchId === null ? null : body.branchId ? await this.resolveRequiredBranchId(ctx, body.branchId) : null;
    const openingBalance = this.money(Number(body.openingBalance ?? 0));
    const currentBalance = this.money(Number(body.currentBalance ?? openingBalance));
    const created = await this.prisma.financialAccount.create({
      data: {
        companyId: ctx.companyId,
        branchId,
        type,
        name,
        description: this.clean(body.description),
        openingBalance,
        currentBalance,
        status: this.clean(body.status) ?? 'ACTIVE',
      },
    });
    recordAuditFromContext({
      action: AUDIT_ACTIONS.FINANCE_ACCOUNT_CREATE,
      outcome: 'success',
      ctx,
      target: { type: 'financial_account', id: created.id, label: created.name },
      metadata: { type: created.type, branchId: created.branchId, openingBalance },
    });
    return this.mapFinancialAccount(created);
  }

  async updateFinancialAccount(ctx: RequestContext, id: string, body: FinancialAccountInput) {
    const existing = await this.prisma.financialAccount.findFirst({ where: { id, companyId: ctx.companyId } });
    if (!existing) throw new NotFoundException('Conta financeira nao encontrada.');
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = this.requireText(body.name, 'name');
    if (body.type !== undefined) data.type = this.resolveFinancialAccountType(body.type);
    if (body.description !== undefined) data.description = this.clean(body.description) ?? null;
    if (body.status !== undefined) data.status = this.clean(body.status) ?? 'ACTIVE';
    if (body.branchId !== undefined) data.branchId = body.branchId === null ? null : await this.resolveRequiredBranchId(ctx, body.branchId);
    if (body.openingBalance !== undefined) data.openingBalance = this.money(Number(body.openingBalance ?? 0));
    if (body.currentBalance !== undefined) data.currentBalance = this.money(Number(body.currentBalance ?? 0));
    if (Object.keys(data).length === 0) throw new BadRequestException('Payload vazio.');
    const updated = await this.prisma.financialAccount.update({ where: { id }, data });
    recordAuditFromContext({
      action: AUDIT_ACTIONS.FINANCE_ACCOUNT_UPDATE,
      outcome: 'success',
      ctx,
      target: { type: 'financial_account', id: updated.id, label: updated.name },
      metadata: { changedFields: Object.keys(data), status: updated.status },
    });
    return this.mapFinancialAccount(updated);
  }

  async listPaymentFees(ctx: RequestContext, query: FinanceQuery = {}) {
    const period = this.resolvePeriod(query);
    const scope = await this.resolveBranchScope(ctx, query.branchId);
    const rows = await this.prisma.paymentFee.findMany({
      where: {
        companyId: ctx.companyId,
        ...(scope.branchId ? { branchId: scope.branchId } : {}),
        occurredAt: { gte: period.from, lte: period.to },
      },
      orderBy: { occurredAt: 'desc' },
      take: 500,
    });
    return rows.map((row) => this.mapPaymentFee(row));
  }

  async listReceivableSchedules(ctx: RequestContext, query: FinanceQuery = {}) {
    const period = this.resolvePeriod(query);
    const scope = await this.resolveBranchScope(ctx, query.branchId);
    const rows = await this.prisma.receivableSchedule.findMany({
      where: {
        companyId: ctx.companyId,
        ...(scope.branchId ? { branchId: scope.branchId } : {}),
        expectedDate: { gte: period.from, lte: period.to },
      },
      orderBy: { expectedDate: 'asc' },
      take: 500,
    });
    return rows.map((row) => this.mapReceivableSchedule(row));
  }

  async updatePayable(ctx: RequestContext, id: string, body: AccountPatchInput) {
    const existing = await this.prisma.accountsPayable.findFirst({
      where: { id, branch: { companyId: ctx.companyId } },
    });
    if (!existing) throw new NotFoundException('Conta a pagar nao encontrada.');
    if (existing.status === 'CANCELED') throw new BadRequestException('Conta cancelada nao pode ser editada.');
    const data = await this.buildAccountPatch(ctx, body, 'EXPENSE');
    if (Object.keys(data).length === 0) throw new BadRequestException('Payload vazio.');
    const updated = await this.prisma.accountsPayable.update({
      where: { id },
      data: { ...data, updatedById: ctx.userId ?? null },
      include: this.payableInclude(),
    });
    recordAuditFromContext({
      action: AUDIT_ACTIONS.FINANCE_PAYABLE_UPDATE,
      outcome: 'success',
      ctx,
      target: { type: 'account_payable', id: updated.id, label: updated.description },
      metadata: { changedFields: Object.keys(data), status: updated.status },
    });
    return this.mapPayable(updated);
  }

  async updateReceivable(ctx: RequestContext, id: string, body: AccountPatchInput) {
    const existing = await this.prisma.accountsReceivable.findFirst({
      where: { id, branch: { companyId: ctx.companyId } },
    });
    if (!existing) throw new NotFoundException('Conta a receber nao encontrada.');
    if (existing.status === 'CANCELED') throw new BadRequestException('Conta cancelada nao pode ser editada.');
    const data = await this.buildAccountPatch(ctx, body, 'REVENUE');
    if (Object.keys(data).length === 0) throw new BadRequestException('Payload vazio.');
    const updated = await this.prisma.accountsReceivable.update({
      where: { id },
      data: { ...data, updatedById: ctx.userId ?? null },
      include: this.accountInclude(),
    });
    recordAuditFromContext({
      action: AUDIT_ACTIONS.FINANCE_RECEIVABLE_UPDATE,
      outcome: 'success',
      ctx,
      target: { type: 'account_receivable', id: updated.id, label: updated.description },
      metadata: { changedFields: Object.keys(data), status: updated.status },
    });
    return this.mapReceivable(updated);
  }

  async cancelPayable(ctx: RequestContext, id: string, body: { reason?: string } = {}) {
    const existing = await this.prisma.accountsPayable.findFirst({ where: { id, branch: { companyId: ctx.companyId } } });
    if (!existing) throw new NotFoundException('Conta a pagar nao encontrada.');
    if (existing.status === 'PAID') throw new BadRequestException('Conta paga nao pode ser cancelada por esta rotina.');
    const updated = await this.prisma.accountsPayable.update({
      where: { id },
      data: {
        status: 'CANCELED',
        canceledAt: new Date(),
        updatedById: ctx.userId ?? null,
        reasonText: this.clean(body.reason) ?? existing.reasonText,
      },
      include: this.payableInclude(),
    });
    recordAuditFromContext({
      action: AUDIT_ACTIONS.FINANCE_PAYABLE_CANCEL,
      outcome: 'success',
      ctx,
      target: { type: 'account_payable', id: updated.id, label: updated.description },
      metadata: { reason: body.reason },
    });
    return this.mapPayable(updated);
  }

  async cancelReceivable(ctx: RequestContext, id: string, body: { reason?: string } = {}) {
    const existing = await this.prisma.accountsReceivable.findFirst({ where: { id, branch: { companyId: ctx.companyId } } });
    if (!existing) throw new NotFoundException('Conta a receber nao encontrada.');
    if (existing.status === 'PAID') throw new BadRequestException('Conta recebida nao pode ser cancelada por esta rotina.');
    const updated = await this.prisma.accountsReceivable.update({
      where: { id },
      data: {
        status: 'CANCELED',
        canceledAt: new Date(),
        updatedById: ctx.userId ?? null,
        reasonText: this.clean(body.reason) ?? existing.reasonText,
      },
      include: this.accountInclude(),
    });
    recordAuditFromContext({
      action: AUDIT_ACTIONS.FINANCE_RECEIVABLE_CANCEL,
      outcome: 'success',
      ctx,
      target: { type: 'account_receivable', id: updated.id, label: updated.description },
      metadata: { reason: body.reason },
    });
    return this.mapReceivable(updated);
  }

  async cancelLedgerEntry(ctx: RequestContext, id: string, body: LedgerCancelInput = {}) {
    const existing = await this.prisma.financialLedgerEntry.findFirst({
      where: { id, branch: { companyId: ctx.companyId } },
    });
    if (!existing) throw new NotFoundException('Lancamento nao encontrado.');
    if (existing.status === 'CANCELED') return this.mapLedgerEntry(existing);
    const updated = await this.prisma.financialLedgerEntry.update({
      where: { id },
      data: {
        status: 'CANCELED',
        canceledAt: new Date(),
        canceledById: ctx.userId ?? null,
        cancellationReason: this.clean(body.reason) ?? 'Cancelado manualmente',
      },
      include: this.ledgerInclude(),
    });
    recordAuditFromContext({
      action: AUDIT_ACTIONS.FINANCE_ENTRY_CANCEL,
      outcome: 'success',
      ctx,
      target: { type: 'financial_ledger_entry', id: updated.id },
      metadata: { reason: body.reason },
    });
    return this.mapLedgerEntry(updated);
  }

  async confirmReconciliationItem(ctx: RequestContext, id: string) {
    return this.resolveReconciliationItem(ctx, id, 'RECONCILED', AUDIT_ACTIONS.FINANCE_RECONCILIATION_CONFIRM);
  }

  async ignoreReconciliationItem(ctx: RequestContext, id: string, body: ReconciliationActionInput = {}) {
    if (!this.clean(body.reason)) throw new BadRequestException('Motivo obrigatorio para ignorar conciliacao.');
    return this.resolveReconciliationItem(ctx, id, 'IGNORED', AUDIT_ACTIONS.FINANCE_RECONCILIATION_IGNORE, body.reason);
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

    const category = await this.resolveFinancialCategory(ctx, body.categoryId ?? body.category, entryType === 'REVENUE' ? 'REVENUE' : 'EXPENSE');
    const costCenter = await this.resolveCostCenter(ctx, body.costCenterId ?? body.costCenter);
    const financialAccountId = await this.resolveFinancialAccountId(ctx, body.financialAccountId);
    const created = await this.prisma.financialLedgerEntry.create({
      data: {
        branchId,
        actorUserId: ctx.userId ?? null,
        financialAccountId,
        categoryId: category?.id ?? null,
        costCenterId: costCenter?.id ?? null,
        entryType,
        status: 'POSTED',
        originType: 'MANUAL',
        amount,
        reasonCode: category?.name ?? this.clean(body.category),
        reasonText: this.clean(body.description),
        externalReference: this.clean(body.externalReference),
        requestId: ctx.requestId,
        metadata: {
          category: category?.name ?? this.clean(body.category),
          costCenter: costCenter?.name ?? this.clean(body.costCenter),
          occurredAt: occurredAt.toISOString(),
        },
      },
      include: this.ledgerInclude(),
    });

    recordAuditFromContext({
      action: AUDIT_ACTIONS.FINANCE_ENTRY_CREATE,
      outcome: 'success',
      ctx,
      target: { type: 'financial_ledger_entry', id: created.id },
      metadata: { entryType, amount: this.money(amount), categoryId: category?.id ?? null, costCenterId: costCenter?.id ?? null },
    });
    return this.mapLedgerEntry(created);
  }

  async createManualPayable(ctx: RequestContext, body: ManualAccountInput) {
    const branchId = await this.resolveRequiredBranchId(ctx, body.branchId);
    const description = this.requireText(body.description, 'description');
    const amount = this.requirePositiveAmount(body.amount, 'amount');
    const dueDate = this.resolveDate(body.dueDate, 'dueDate', true);
    const category = await this.resolveFinancialCategory(ctx, body.categoryId ?? body.category, 'EXPENSE');
    const costCenter = await this.resolveCostCenter(ctx, body.costCenterId ?? body.costCenter);
    const financialAccountId = await this.resolveFinancialAccountId(ctx, body.financialAccountId);

    const created = await this.prisma.accountsPayable.create({
      data: {
        branchId,
        financialAccountId,
        categoryId: category?.id ?? null,
        costCenterId: costCenter?.id ?? null,
        createdById: ctx.userId ?? null,
        description,
        amount,
        dueDate,
        originType: 'MANUAL',
        externalReference: this.clean(body.externalReference),
        reasonCode: category?.name ?? this.clean(body.category),
        reasonText: costCenter?.name ?? this.clean(body.costCenter),
      },
      include: this.payableInclude(),
    });

    recordAuditFromContext({
      action: AUDIT_ACTIONS.FINANCE_PAYABLE_CREATE,
      outcome: 'success',
      ctx,
      target: { type: 'account_payable', id: created.id, label: created.description },
      metadata: { amount, dueDate: dueDate.toISOString(), categoryId: category?.id ?? null },
    });

    return this.mapPayable(created);
  }

  async createManualReceivable(ctx: RequestContext, body: ManualAccountInput) {
    const branchId = await this.resolveRequiredBranchId(ctx, body.branchId);
    const description = this.requireText(body.description, 'description');
    const amount = this.requirePositiveAmount(body.amount, 'amount');
    const dueDate = this.resolveDate(body.dueDate, 'dueDate', false);
    const category = await this.resolveFinancialCategory(ctx, body.categoryId ?? body.category, 'REVENUE');
    const costCenter = await this.resolveCostCenter(ctx, body.costCenterId ?? body.costCenter);
    const financialAccountId = await this.resolveFinancialAccountId(ctx, body.financialAccountId);

    const created = await this.prisma.accountsReceivable.create({
      data: {
        branchId,
        financialAccountId,
        categoryId: category?.id ?? null,
        costCenterId: costCenter?.id ?? null,
        createdById: ctx.userId ?? null,
        description,
        amount,
        dueDate,
        originType: 'MANUAL',
        externalReference: this.clean(body.externalReference),
        reasonCode: category?.name ?? this.clean(body.category),
        reasonText: costCenter?.name ?? this.clean(body.costCenter),
      },
      include: this.accountInclude(),
    });

    recordAuditFromContext({
      action: AUDIT_ACTIONS.FINANCE_RECEIVABLE_CREATE,
      outcome: 'success',
      ctx,
      target: { type: 'account_receivable', id: created.id, label: created.description },
      metadata: { amount, dueDate: dueDate?.toISOString() ?? null, categoryId: category?.id ?? null },
    });

    return this.mapReceivable(created);
  }

  async settlePayable(ctx: RequestContext, id: string, body: AccountSettlementInput) {
    const amount = this.requirePositiveAmount(body.amount, 'amount');
    const settledAt = this.resolveDate(body.settledAt, 'settledAt', false) ?? new Date();

    return this.prisma.$transaction(async (tx) => {
      const payable = await tx.accountsPayable.findFirst({
        where: { id, branch: { companyId: ctx.companyId } },
        include: this.payableInclude(),
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
        include: this.payableInclude(),
      });
      await tx.financialLedgerEntry.create({
        data: {
          branchId: payable.branchId,
          actorUserId: ctx.userId ?? null,
          financialAccountId: payable.financialAccountId ?? null,
          categoryId: payable.categoryId ?? null,
          costCenterId: payable.costCenterId ?? null,
          entryType: 'EXPENSE',
          status: 'POSTED',
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
      recordAuditFromContext({
        action: AUDIT_ACTIONS.FINANCE_PAYABLE_PAY,
        outcome: 'success',
        ctx,
        target: { type: 'account_payable', id: updated.id, label: updated.description },
        metadata: { amount, status, settlementMethod: body.settlementMethod ?? 'EXTERNAL' },
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
        include: this.accountInclude(),
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
        include: this.accountInclude(),
      });
      await tx.financialLedgerEntry.create({
        data: {
          branchId: receivable.branchId,
          actorUserId: ctx.userId ?? null,
          financialAccountId: receivable.financialAccountId ?? null,
          categoryId: receivable.categoryId ?? null,
          costCenterId: receivable.costCenterId ?? null,
          entryType: 'REVENUE',
          status: 'POSTED',
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
      await tx.receivableSchedule.updateMany({
        where: { accountReceivableId: receivable.id, status: { not: 'RECEIVED' } },
        data: { status: status === 'PAID' ? 'RECEIVED' : 'PARTIALLY_RECEIVED', receivedAt: settledAt },
      });
      recordAuditFromContext({
        action: AUDIT_ACTIONS.FINANCE_RECEIVABLE_RECEIVE,
        outcome: 'success',
        ctx,
        target: { type: 'account_receivable', id: updated.id, label: updated.description },
        metadata: { amount, status, settlementMethod: body.settlementMethod ?? 'EXTERNAL' },
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

  private async getCogsForOrders(orderIds: string[]): Promise<CogsSummary> {
    if (!orderIds.length) {
      return {
        totalCogs: 0,
        dataStatus: 'NO_DATA',
        source: 'no_paid_sales',
        soldItems: 0,
        itemsWithoutCost: 0,
        fallbackCostItems: 0,
      };
    }
    const rows = await this.prisma.orderItem.findMany({
      where: { orderId: { in: orderIds } },
      select: {
        quantity: true,
        costSnapshot: true,
        theoreticalCostSnapshot: true,
        product: { select: { costPrice: true } },
      },
      take: 10000,
    });
    let itemsWithoutCost = 0;
    let fallbackCostItems = 0;
    const totalCogs = this.money(rows.reduce((sum, item) => {
      const resolved = this.resolveUnitCost(item);
      if (resolved.source === 'MISSING') itemsWithoutCost += 1;
      if (resolved.dataStatus === 'PARTIAL_DATA') fallbackCostItems += 1;
      return sum + Number(item.quantity ?? 0) * resolved.unitCost;
    }, 0));
    const dataStatus = rows.length === 0
      ? 'NO_DATA'
      : itemsWithoutCost > 0 || fallbackCostItems > 0
        ? 'PARTIAL_DATA'
        : 'COMPLETE';
    return {
      totalCogs,
      dataStatus,
      source: dataStatus === 'COMPLETE'
        ? 'order_items.cost_snapshot'
        : totalCogs > 0
          ? 'order_items.theoretical_or_product_cost_partial'
          : 'missing_recipe_stock_cost',
      soldItems: rows.length,
      itemsWithoutCost,
      fallbackCostItems,
    };
  }

  private async findSoldOrderItems(period: Period, scope: BranchScope) {
    return this.prisma.orderItem.findMany({
      where: {
        status: { not: 'CANCELED' },
        order: {
          branch: scope.whereBranch,
          createdAt: { gte: period.from, lte: period.to },
          paymentStatus: { in: ['PAID', 'PARTIALLY_PAID'] },
          status: { not: 'CANCELED' },
          deletedAt: null,
        },
      },
      select: {
        id: true,
        productId: true,
        productNameSnapshot: true,
        quantity: true,
        totalPrice: true,
        costSnapshot: true,
        theoreticalCostSnapshot: true,
        product: {
          select: {
            recipeId: true,
            costPrice: true,
            category: { select: { name: true } },
          },
        },
      },
      take: 10000,
    });
  }

  private resolveUnitCost(item: {
    costSnapshot?: number | { toString(): string } | null;
    theoreticalCostSnapshot?: number | { toString(): string } | null;
    product?: { costPrice?: number | { toString(): string } | null } | null;
  }) {
    const costSnapshot = Number(item.costSnapshot ?? 0);
    if (costSnapshot > 0) return { unitCost: this.money(costSnapshot), source: 'COST_SNAPSHOT', dataStatus: 'COMPLETE' as const };
    const theoreticalCost = Number(item.theoreticalCostSnapshot ?? 0);
    if (theoreticalCost > 0) return { unitCost: this.money(theoreticalCost), source: 'THEORETICAL_COST', dataStatus: 'PARTIAL_DATA' as const };
    const productCost = Number(item.product?.costPrice ?? 0);
    if (productCost > 0) return { unitCost: this.money(productCost), source: 'PRODUCT_COST_PRICE', dataStatus: 'PARTIAL_DATA' as const };
    return { unitCost: 0, source: 'MISSING', dataStatus: 'NO_DATA' as const };
  }

  private async findLedger(period: Period, scope: BranchScope) {
    return this.prisma.financialLedgerEntry.findMany({
      where: {
        branch: scope.whereBranch,
        createdAt: { gte: period.from, lte: period.to },
        status: { not: 'CANCELED' },
      },
      include: this.ledgerInclude(),
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  private async findPayables(period: Period, scope: BranchScope) {
    return this.prisma.accountsPayable.findMany({
      where: {
        branch: scope.whereBranch,
        dueDate: { gte: period.from, lte: period.to },
        canceledAt: null,
      },
      include: this.payableInclude(),
      orderBy: { dueDate: 'asc' },
      take: 500,
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
      include: this.accountInclude(),
      orderBy: { dueDate: 'asc' },
      take: 500,
    });
  }

  private buildCategoryBreakdown(
    ledger: Array<{ entryType: string; amount: number; category?: string | null }>,
    payables: Array<{ amount: number; paidAmount: number; category?: string | null; status: string }>,
    receivables: Array<{ amount: number; paidAmount: number; category?: string | null; status: string }>,
  ) {
    const map = new Map<string, { key: string; label: string; revenue: number; expense: number; pendingReceivable: number; pendingPayable: number }>();
    const ensure = (keyRaw?: string | null) => {
      const key = this.clean(keyRaw ?? undefined) ?? 'uncategorized';
      if (!map.has(key)) {
        map.set(key, { key, label: this.toLabel(key), revenue: 0, expense: 0, pendingReceivable: 0, pendingPayable: 0 });
      }
      return map.get(key)!;
    };

    for (const item of ledger) {
      const row = ensure(item.category);
      if (item.entryType === 'REVENUE') row.revenue = this.money(row.revenue + item.amount);
      if (item.entryType === 'EXPENSE') row.expense = this.money(row.expense + item.amount);
    }
    for (const item of payables) {
      const row = ensure(item.category);
      const openAmount = Math.max(0, item.amount - item.paidAmount);
      row.expense = this.money(row.expense + item.paidAmount);
      if (item.status !== 'PAID' && item.status !== 'CANCELED') row.pendingPayable = this.money(row.pendingPayable + openAmount);
    }
    for (const item of receivables) {
      const row = ensure(item.category);
      const openAmount = Math.max(0, item.amount - item.paidAmount);
      row.revenue = this.money(row.revenue + item.paidAmount);
      if (item.status !== 'PAID' && item.status !== 'CANCELED') row.pendingReceivable = this.money(row.pendingReceivable + openAmount);
    }

    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  private buildCostCenterBreakdown(
    ledger: Array<{ entryType: string; amount: number; metadata?: unknown; costCenter?: string | null }>,
    payables: Array<{ amount: number; paidAmount: number; costCenter?: string | null; status: string }>,
    receivables: Array<{ amount: number; paidAmount: number; costCenter?: string | null; status: string }>,
  ) {
    const map = new Map<string, { key: string; label: string; revenue: number; expense: number; pendingReceivable: number; pendingPayable: number }>();
    const ensure = (keyRaw?: string | null) => {
      const key = this.clean(keyRaw ?? undefined) ?? 'uncategorized';
      if (!map.has(key)) {
        map.set(key, { key, label: this.toLabel(key), revenue: 0, expense: 0, pendingReceivable: 0, pendingPayable: 0 });
      }
      return map.get(key)!;
    };

    for (const item of ledger) {
      const metadata = item.metadata as { costCenter?: unknown } | null;
      const row = ensure(typeof metadata?.costCenter === 'string' ? metadata.costCenter : item.costCenter);
      if (item.entryType === 'REVENUE') row.revenue = this.money(row.revenue + item.amount);
      if (item.entryType === 'EXPENSE') row.expense = this.money(row.expense + item.amount);
    }
    for (const item of payables) {
      const row = ensure(item.costCenter);
      const openAmount = Math.max(0, item.amount - item.paidAmount);
      row.expense = this.money(row.expense + item.paidAmount);
      if (item.status !== 'PAID' && item.status !== 'CANCELED') row.pendingPayable = this.money(row.pendingPayable + openAmount);
    }
    for (const item of receivables) {
      const row = ensure(item.costCenter);
      const openAmount = Math.max(0, item.amount - item.paidAmount);
      row.revenue = this.money(row.revenue + item.paidAmount);
      if (item.status !== 'PAID' && item.status !== 'CANCELED') row.pendingReceivable = this.money(row.pendingReceivable + openAmount);
    }

    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  private buildDreComparison(current: DreReport, previous: DreReport) {
    return {
      previousPeriod: previous.period,
      previous,
      deltas: {
        grossRevenue: this.delta(current.grossRevenue, previous.grossRevenue),
        netRevenue: this.delta(current.netRevenue, previous.netRevenue),
        cogs: this.delta(current.cogs, previous.cogs),
        grossMargin: this.delta(current.grossMargin, previous.grossMargin),
        operatingExpenses: this.delta(current.operatingExpenses, previous.operatingExpenses),
        operatingProfit: this.delta(current.operatingProfit, previous.operatingProfit),
      },
    };
  }

  private buildExecutiveAlerts(
    cashFlow: Awaited<ReturnType<FinanceService['getCashFlow']>>,
    dre: DreReport,
    cmv: Awaited<ReturnType<FinanceService['getCmv']>>,
    reconciliation: Awaited<ReturnType<FinanceService['getReconciliation']>>,
    payables: ReturnType<FinanceService['mapPayable']>[],
    receivables: ReturnType<FinanceService['mapReceivable']>[],
  ) {
    const alerts: Array<{ severity: 'danger' | 'warning' | 'info'; title: string; detail: string; metric: string }> = [];
    const now = new Date();
    const overduePayables = payables.filter((item) => item.status !== 'PAID' && item.dueDate && new Date(item.dueDate) < now);
    const overdueReceivables = receivables.filter((item) => item.status !== 'PAID' && item.dueDate && new Date(item.dueDate) < now);
    if (cashFlow.realized.balance < 0) {
      alerts.push({
        severity: 'danger',
        title: 'Saldo realizado negativo',
        detail: 'As saidas realizadas superaram as entradas no periodo.',
        metric: String(cashFlow.realized.balance),
      });
    }
    if (dre.operatingProfit < 0) {
      alerts.push({
        severity: 'danger',
        title: 'Lucro operacional negativo',
        detail: 'A margem bruta nao esta cobrindo as despesas operacionais.',
        metric: String(dre.operatingProfit),
      });
    }
    if (cmv.summary.dataStatus !== 'COMPLETE') {
      alerts.push({
        severity: 'warning',
        title: 'CMV parcial',
        detail: 'Existem produtos vendidos sem custo completo ou sem ficha tecnica vinculada.',
        metric: cmv.summary.dataStatus,
      });
    }
    if (overduePayables.length > 0 || overdueReceivables.length > 0) {
      alerts.push({
        severity: 'warning',
        title: 'Contas vencidas',
        detail: `${overduePayables.length} a pagar e ${overdueReceivables.length} a receber estao vencidas.`,
        metric: String(overduePayables.length + overdueReceivables.length),
      });
    }
    if (reconciliation.summary.divergent > 0) {
      alerts.push({
        severity: 'warning',
        title: 'Conciliacao pendente',
        detail: 'Ha pedidos, recebiveis ou contas com divergencia para revisar.',
        metric: String(reconciliation.summary.divergent),
      });
    }
    if (alerts.length === 0) {
      alerts.push({
        severity: 'info',
        title: 'Financeiro sem alertas criticos',
        detail: 'DRE, fluxo e conciliacao nao apontaram riscos relevantes no periodo.',
        metric: 'OK',
      });
    }
    return alerts.slice(0, 6);
  }

  private buildFinanceHealth(
    cashFlow: Awaited<ReturnType<FinanceService['getCashFlow']>>,
    dre: DreReport,
    cmv: Awaited<ReturnType<FinanceService['getCmv']>>,
    reconciliation: Awaited<ReturnType<FinanceService['getReconciliation']>>,
    payables: ReturnType<FinanceService['mapPayable']>[],
    receivables: ReturnType<FinanceService['mapReceivable']>[],
  ) {
    const now = new Date();
    let score = 100;
    const penalties: string[] = [];
    if (cashFlow.realized.balance < 0) {
      score -= 25;
      penalties.push('saldo realizado negativo');
    }
    if (dre.operatingProfit < 0) {
      score -= 25;
      penalties.push('lucro operacional negativo');
    }
    if (cmv.summary.dataStatus !== 'COMPLETE') {
      score -= 15;
      penalties.push('CMV parcial');
    }
    if (reconciliation.summary.divergent > 0) {
      score -= 15;
      penalties.push('conciliacao divergente');
    }
    const overdueCount = [
      ...payables.filter((item) => item.status !== 'PAID' && item.dueDate && new Date(item.dueDate) < now),
      ...receivables.filter((item) => item.status !== 'PAID' && item.dueDate && new Date(item.dueDate) < now),
    ].length;
    if (overdueCount > 0) {
      score -= Math.min(20, overdueCount * 5);
      penalties.push('contas vencidas');
    }
    const normalizedScore = Math.max(0, score);
    return {
      score: normalizedScore,
      status: normalizedScore >= 80 ? 'SAUDAVEL' : normalizedScore >= 55 ? 'ATENCAO' : 'CRITICO',
      penalties,
    };
  }

  private delta(current: number, previous: number) {
    const amount = this.money(current - previous);
    return {
      current: this.money(current),
      previous: this.money(previous),
      amount,
      percent: previous !== 0 ? this.money((amount / Math.abs(previous)) * 100) : null,
    };
  }

  private buildDailyCashFlowRows(period: Period): DailyCashFlowDraft[] {
    const rows: DailyCashFlowDraft[] = [];
    const cursor = new Date(Date.UTC(period.from.getUTCFullYear(), period.from.getUTCMonth(), period.from.getUTCDate()));
    const end = this.dayKey(period.to);
    while (this.dayKey(cursor) <= end) {
      rows.push({
        date: this.dayKey(cursor),
        salesRevenue: 0,
        manualRevenue: 0,
        receivedReceivables: 0,
        manualExpenses: 0,
        paidPayables: 0,
        forecastReceivables: 0,
        forecastPayables: 0,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return rows;
  }

  private dayKey(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private isStandaloneLedger(entry: {
    accountsPayableId?: string | null;
    accountsReceivableId?: string | null;
    payableSettlementId?: string | null;
    receivableSettlementId?: string | null;
  }) {
    return !entry.accountsPayableId && !entry.accountsReceivableId && !entry.payableSettlementId && !entry.receivableSettlementId;
  }

  private async ensureDefaultFinanceSetup(ctx: RequestContext) {
    if (this.defaultSetupCompanies.has(ctx.companyId)) return;
    const categories = [
      { type: 'REVENUE' as const, name: 'Vendas', sortOrder: 10 },
      { type: 'REVENUE' as const, name: 'Delivery', sortOrder: 20 },
      { type: 'EXPENSE' as const, name: 'Compras de insumos', sortOrder: 30 },
      { type: 'EXPENSE' as const, name: 'Taxas de pagamento', sortOrder: 40 },
      { type: 'EXPENSE' as const, name: 'Taxas de delivery', sortOrder: 50 },
      { type: 'EXPENSE' as const, name: 'Aluguel', sortOrder: 60 },
      { type: 'EXPENSE' as const, name: 'Energia', sortOrder: 70 },
      { type: 'EXPENSE' as const, name: 'Agua', sortOrder: 80 },
      { type: 'EXPENSE' as const, name: 'Internet', sortOrder: 90 },
      { type: 'EXPENSE' as const, name: 'Marketing', sortOrder: 100 },
      { type: 'EXPENSE' as const, name: 'Manutencao', sortOrder: 110 },
      { type: 'BOTH' as const, name: 'Ajustes', sortOrder: 120 },
      { type: 'BOTH' as const, name: 'Outros', sortOrder: 130 },
    ];
    for (const category of categories) {
      await this.prisma.financialCategory.upsert({
        where: { companyId_type_name: { companyId: ctx.companyId, type: category.type, name: category.name } },
        update: {},
        create: { companyId: ctx.companyId, type: category.type, name: category.name, sortOrder: category.sortOrder },
      });
    }

    const costCenters = ['Cozinha', 'Salao', 'Delivery', 'PDV', 'Administrativo', 'Marketing', 'Bar', 'Producao'];
    for (const name of costCenters) {
      const existing = await this.prisma.costCenter.findFirst({ where: { companyId: ctx.companyId, branchId: null, name } });
      if (!existing) await this.prisma.costCenter.create({ data: { companyId: ctx.companyId, name } });
    }

    const accounts = [
      { type: 'CASH' as const, name: 'Caixa fisico' },
      { type: 'PIX' as const, name: 'PIX' },
      { type: 'CARD' as const, name: 'Cartao' },
      { type: 'BANK' as const, name: 'Conta banco' },
      { type: 'MARKETPLACE' as const, name: 'Marketplace' },
    ];
    for (const account of accounts) {
      const existing = await this.prisma.financialAccount.findFirst({
        where: { companyId: ctx.companyId, branchId: null, type: account.type, name: account.name },
      });
      if (!existing) {
        await this.prisma.financialAccount.create({
          data: { companyId: ctx.companyId, type: account.type, name: account.name },
        });
      }
    }
    this.defaultSetupCompanies.add(ctx.companyId);
  }

  private resolveCategoryType(value?: string) {
    const type = String(value ?? 'BOTH').toUpperCase();
    if (!['REVENUE', 'EXPENSE', 'BOTH'].includes(type)) throw new BadRequestException('Tipo de categoria invalido.');
    return type as 'REVENUE' | 'EXPENSE' | 'BOTH';
  }

  private resolveFinancialAccountType(value?: string) {
    const type = String(value ?? 'OTHER').toUpperCase();
    if (!['CASH', 'BANK', 'PIX', 'CARD', 'MARKETPLACE', 'TRANSITORY', 'OTHER'].includes(type)) {
      throw new BadRequestException('Tipo de conta financeira invalido.');
    }
    return type as 'CASH' | 'BANK' | 'PIX' | 'CARD' | 'MARKETPLACE' | 'TRANSITORY' | 'OTHER';
  }

  private async resolveOptionalCategoryParent(ctx: RequestContext, parentId?: string | null) {
    const cleaned = this.clean(parentId ?? undefined);
    if (!cleaned) return null;
    const parent = await this.prisma.financialCategory.findFirst({ where: { id: cleaned, companyId: ctx.companyId } });
    if (!parent) throw new BadRequestException('Categoria pai nao encontrada.');
    return parent.id;
  }

  private async resolveFinancialCategory(ctx: RequestContext, value?: string, expected?: 'REVENUE' | 'EXPENSE') {
    const cleaned = this.clean(value);
    if (!cleaned) return null;
    await this.ensureDefaultFinanceSetup(ctx);
    const row = await this.prisma.financialCategory.findFirst({
      where: {
        companyId: ctx.companyId,
        OR: [{ id: cleaned }, { name: cleaned }],
      },
    });
    if (!row) return null;
    if (expected && row.type !== expected && row.type !== 'BOTH') {
      throw new BadRequestException(`Categoria '${row.name}' nao aceita lancamento ${expected}.`);
    }
    return row;
  }

  private async resolveCostCenter(ctx: RequestContext, value?: string) {
    const cleaned = this.clean(value);
    if (!cleaned) return null;
    await this.ensureDefaultFinanceSetup(ctx);
    const row = await this.prisma.costCenter.findFirst({
      where: {
        companyId: ctx.companyId,
        OR: [{ id: cleaned }, { name: cleaned }],
      },
    });
    if (!row) return null;
    if (row.branchId) await this.assertBranchBelongsToCompany(ctx.companyId, row.branchId);
    return row;
  }

  private async resolveFinancialAccountId(ctx: RequestContext, id?: string) {
    const cleaned = this.clean(id);
    if (!cleaned) return null;
    const account = await this.prisma.financialAccount.findFirst({ where: { id: cleaned, companyId: ctx.companyId } });
    if (!account) throw new BadRequestException('Conta financeira nao encontrada.');
    if (account.branchId) await this.assertBranchBelongsToCompany(ctx.companyId, account.branchId);
    return account.id;
  }

  private async buildAccountPatch(ctx: RequestContext, body: AccountPatchInput, expectedCategory: 'REVENUE' | 'EXPENSE') {
    const data: Record<string, unknown> = {};
    if (body.description !== undefined) data.description = this.requireText(body.description, 'description');
    if (body.amount !== undefined) data.amount = this.requirePositiveAmount(body.amount, 'amount');
    if (body.dueDate !== undefined) {
      data.dueDate = expectedCategory === 'EXPENSE'
        ? this.resolveDate(body.dueDate, 'dueDate', true)
        : this.resolveDate(body.dueDate, 'dueDate', false);
    }
    if (body.status !== undefined) data.status = this.clean(body.status) ?? undefined;
    const categoryInput = body.categoryId ?? body.category;
    if (categoryInput !== undefined) {
      const category = await this.resolveFinancialCategory(ctx, categoryInput, expectedCategory);
      data.categoryId = category?.id ?? null;
      data.reasonCode = category?.name ?? this.clean(body.category);
    }
    const costCenterInput = body.costCenterId ?? body.costCenter;
    if (costCenterInput !== undefined) {
      const costCenter = await this.resolveCostCenter(ctx, costCenterInput);
      data.costCenterId = costCenter?.id ?? null;
      data.reasonText = costCenter?.name ?? this.clean(body.costCenter);
    }
    if (body.financialAccountId !== undefined) data.financialAccountId = await this.resolveFinancialAccountId(ctx, body.financialAccountId);
    if (body.externalReference !== undefined) data.externalReference = this.clean(body.externalReference) ?? null;
    return data;
  }

  private async resolveReconciliationItem(
    ctx: RequestContext,
    id: string,
    status: 'RECONCILED' | 'IGNORED',
    action: (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS],
    reason?: string,
  ) {
    const item = await this.prisma.financialReconciliationItem.findFirst({
      where: { id, branch: { companyId: ctx.companyId } },
      include: { batch: true },
    });
    if (!item) throw new NotFoundException('Item de conciliacao nao encontrado.');
    const updated = await this.prisma.financialReconciliationItem.update({
      where: { id },
      data: {
        status,
        reasonText: this.clean(reason) ?? item.reasonText,
        resolvedById: ctx.userId ?? null,
        resolvedAt: new Date(),
      },
    });
    recordAuditFromContext({
      action,
      outcome: 'success',
      ctx,
      target: { type: 'financial_reconciliation_item', id: updated.id },
      metadata: { status, reason },
    });
    return {
      id: updated.id,
      type: 'PERSISTED_RECONCILIATION',
      referenceId: updated.orderId ?? updated.paymentId ?? updated.id,
      expectedAmount: this.money(updated.expectedAmount),
      actualAmount: this.money(updated.actualAmount),
      differenceAmount: this.money(updated.differenceAmount),
      status: updated.status,
    };
  }

  private accountInclude() {
    return {
      category: { select: { id: true, name: true, type: true } },
      costCenter: { select: { id: true, name: true } },
      financialAccount: { select: { id: true, name: true, type: true } },
    } as const;
  }

  private payableInclude() {
    return {
      ...this.accountInclude(),
      supplier: { select: { id: true, name: true } },
    } as const;
  }

  private ledgerInclude() {
    return {
      category: { select: { id: true, name: true, type: true } },
      costCenter: { select: { id: true, name: true } },
      financialAccount: { select: { id: true, name: true, type: true } },
    } as const;
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

  private resolvePreviousPeriod(period: Period): Period {
    const durationMs = period.to.getTime() - period.from.getTime();
    const to = new Date(period.from.getTime() - 1);
    const from = new Date(to.getTime() - durationMs);
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
    financialAccountId?: string | null;
    categoryId?: string | null;
    costCenterId?: string | null;
    entryType: string;
    status?: string | null;
    originType: string;
    originId?: string | null;
    amount: number | { toString(): string };
    reasonCode?: string | null;
    reasonText?: string | null;
    externalReference?: string | null;
    createdAt: Date;
    canceledAt?: Date | null;
    cancellationReason?: string | null;
    metadata?: unknown;
    category?: { id: string; name: string; type?: string } | null;
    costCenter?: { id: string; name: string } | null;
    financialAccount?: { id: string; name: string; type?: string } | null;
  }) {
    return {
      id: item.id,
      branchId: item.branchId,
      financialAccountId: item.financialAccountId ?? null,
      categoryId: item.categoryId ?? null,
      costCenterId: item.costCenterId ?? null,
      entryType: item.entryType,
      status: item.status ?? 'POSTED',
      originType: item.originType,
      originId: item.originId ?? null,
      amount: this.money(item.amount),
      category: item.category?.name ?? item.reasonCode ?? null,
      costCenter: item.costCenter?.name ?? null,
      financialAccount: item.financialAccount
        ? { id: item.financialAccount.id, name: item.financialAccount.name, type: item.financialAccount.type ?? null }
        : null,
      description: item.reasonText ?? null,
      externalReference: item.externalReference ?? null,
      createdAt: item.createdAt.toISOString(),
      canceledAt: item.canceledAt?.toISOString() ?? null,
      cancellationReason: item.cancellationReason ?? null,
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
    financialAccountId?: string | null;
    categoryId?: string | null;
    costCenterId?: string | null;
    reasonCode?: string | null;
    reasonText?: string | null;
    externalReference?: string | null;
    settledAt?: Date | null;
    canceledAt?: Date | null;
    supplier?: { id: string; name: string } | null;
    category?: { id: string; name: string; type?: string } | null;
    costCenter?: { id: string; name: string } | null;
    financialAccount?: { id: string; name: string; type?: string } | null;
  }) {
    return {
      id: item.id,
      branchId: item.branchId,
      description: item.description,
      amount: this.money(item.amount),
      paidAmount: this.money(item.paidAmount),
      dueDate: item.dueDate.toISOString(),
      status: item.status,
      financialAccountId: item.financialAccountId ?? null,
      categoryId: item.categoryId ?? null,
      costCenterId: item.costCenterId ?? null,
      category: item.category?.name ?? item.reasonCode ?? null,
      costCenter: item.costCenter?.name ?? item.reasonText ?? null,
      financialAccount: item.financialAccount
        ? { id: item.financialAccount.id, name: item.financialAccount.name, type: item.financialAccount.type ?? null }
        : null,
      externalReference: item.externalReference ?? null,
      settledAt: item.settledAt?.toISOString() ?? null,
      canceledAt: item.canceledAt?.toISOString() ?? null,
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
    financialAccountId?: string | null;
    categoryId?: string | null;
    costCenterId?: string | null;
    reasonCode?: string | null;
    reasonText?: string | null;
    externalReference?: string | null;
    settledAt?: Date | null;
    canceledAt?: Date | null;
    expectedSettlementDate?: Date | null;
    orderId?: string | null;
    paymentId?: string | null;
    category?: { id: string; name: string; type?: string } | null;
    costCenter?: { id: string; name: string } | null;
    financialAccount?: { id: string; name: string; type?: string } | null;
  }) {
    return {
      id: item.id,
      branchId: item.branchId,
      description: item.description,
      amount: this.money(item.amount),
      paidAmount: this.money(item.paidAmount),
      dueDate: item.dueDate?.toISOString() ?? null,
      status: item.status,
      financialAccountId: item.financialAccountId ?? null,
      categoryId: item.categoryId ?? null,
      costCenterId: item.costCenterId ?? null,
      category: item.category?.name ?? item.reasonCode ?? null,
      costCenter: item.costCenter?.name ?? item.reasonText ?? null,
      financialAccount: item.financialAccount
        ? { id: item.financialAccount.id, name: item.financialAccount.name, type: item.financialAccount.type ?? null }
        : null,
      externalReference: item.externalReference ?? null,
      settledAt: item.settledAt?.toISOString() ?? null,
      canceledAt: item.canceledAt?.toISOString() ?? null,
      expectedSettlementDate: item.expectedSettlementDate?.toISOString() ?? null,
      orderId: item.orderId ?? null,
      paymentId: item.paymentId ?? null,
    };
  }

  private mapFinancialCategory(item: {
    id: string;
    parentId?: string | null;
    type: string;
    name: string;
    description?: string | null;
    status: string;
    sortOrder: number;
  }) {
    return {
      key: item.id,
      id: item.id,
      parentId: item.parentId ?? null,
      type: item.type,
      label: item.name,
      name: item.name,
      description: item.description ?? null,
      status: item.status,
      sortOrder: item.sortOrder,
    };
  }

  private mapCostCenter(item: {
    id: string;
    branchId?: string | null;
    name: string;
    description?: string | null;
    status: string;
  }) {
    return {
      key: item.id,
      id: item.id,
      branchId: item.branchId ?? null,
      label: item.name,
      name: item.name,
      description: item.description ?? null,
      status: item.status,
    };
  }

  private mapFinancialAccount(item: {
    id: string;
    branchId?: string | null;
    type: string;
    name: string;
    description?: string | null;
    openingBalance: number | { toString(): string };
    currentBalance: number | { toString(): string };
    status: string;
  }) {
    return {
      key: item.id,
      id: item.id,
      branchId: item.branchId ?? null,
      type: item.type,
      label: item.name,
      name: item.name,
      description: item.description ?? null,
      openingBalance: this.money(item.openingBalance),
      currentBalance: this.money(item.currentBalance),
      status: item.status,
    };
  }

  private mapPaymentFee(item: {
    id: string;
    branchId?: string | null;
    paymentId?: string | null;
    orderId?: string | null;
    provider?: string | null;
    method?: string | null;
    grossAmount: number | { toString(): string };
    feeAmount: number | { toString(): string };
    netAmount: number | { toString(): string };
    feePct?: number | { toString(): string } | null;
    occurredAt: Date;
  }) {
    return {
      id: item.id,
      branchId: item.branchId ?? null,
      paymentId: item.paymentId ?? null,
      orderId: item.orderId ?? null,
      provider: item.provider ?? null,
      method: item.method ?? null,
      grossAmount: this.money(item.grossAmount),
      feeAmount: this.money(item.feeAmount),
      netAmount: this.money(item.netAmount),
      feePct: item.feePct === null || item.feePct === undefined ? null : this.money(item.feePct),
      occurredAt: item.occurredAt.toISOString(),
    };
  }

  private mapReceivableSchedule(item: {
    id: string;
    branchId?: string | null;
    accountReceivableId?: string | null;
    paymentId?: string | null;
    provider?: string | null;
    method?: string | null;
    grossAmount: number | { toString(): string };
    feeAmount: number | { toString(): string };
    netAmount: number | { toString(): string };
    expectedDate: Date;
    receivedAt?: Date | null;
    status: string;
  }) {
    return {
      id: item.id,
      branchId: item.branchId ?? null,
      accountReceivableId: item.accountReceivableId ?? null,
      paymentId: item.paymentId ?? null,
      provider: item.provider ?? null,
      method: item.method ?? null,
      grossAmount: this.money(item.grossAmount),
      feeAmount: this.money(item.feeAmount),
      netAmount: this.money(item.netAmount),
      expectedDate: item.expectedDate.toISOString(),
      receivedAt: item.receivedAt?.toISOString() ?? null,
      status: item.status,
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
