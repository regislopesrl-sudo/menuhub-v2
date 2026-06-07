import { BadRequestException, Injectable } from '@nestjs/common';
import { Channel, OrderPaymentSummaryStatus, OrderStatus, Prisma } from '@prisma/client';
import type { RequestContext } from '../common/request-context';
import { hasAnyPermission, TENANT_PERMISSIONS } from '../common/rbac';
import { PrismaService } from '../database/prisma.service';
import { FinanceService } from '../finance/finance.service';

export type ReportsOverviewQuery = {
  from?: string;
  to?: string;
  branchId?: string;
  channel?: string;
  status?: string;
  paymentStatus?: string;
  operatorUserId?: string;
  waiterUserId?: string;
  groupBy?: 'day' | 'week' | 'month' | 'hour';
  page?: string;
  limit?: string;
};

type Period = {
  from: Date;
  to: Date;
};

type BranchScope = {
  branchId?: string;
};

type DailySalesRow = {
  day: Date | string;
  orders: number | bigint;
  revenue: number | { toString(): string };
};

type PeakHourRow = {
  hour: number | string;
  orders: number | bigint;
  revenue: number | { toString(): string };
};

type NeighborhoodRow = {
  district: string | null;
  orders: number | bigint;
  revenue: number | { toString(): string };
  deliveryFee: number | { toString(): string };
};

type CmvRow = {
  cogs: number | { toString(): string };
  grossSales: number | { toString(): string };
  quantity: number | { toString(): string };
};

const MAX_RANGE_DAYS = 370;

const ACTIVE_STATUSES: OrderStatus[] = [
  OrderStatus.DRAFT,
  OrderStatus.PENDING_CONFIRMATION,
  OrderStatus.CONFIRMED,
  OrderStatus.IN_PREPARATION,
  OrderStatus.READY,
  OrderStatus.WAITING_PICKUP,
  OrderStatus.WAITING_DISPATCH,
  OrderStatus.OUT_FOR_DELIVERY,
];

const COMPLETED_STATUSES: OrderStatus[] = [
  OrderStatus.DELIVERED,
  OrderStatus.FINALIZED,
];

const CANCELED_STATUSES: OrderStatus[] = [
  OrderStatus.CANCELED,
  OrderStatus.REFUNDED,
];

const PAID_PAYMENT_STATUSES: OrderPaymentSummaryStatus[] = [
  OrderPaymentSummaryStatus.PAID,
  OrderPaymentSummaryStatus.PARTIALLY_PAID,
  OrderPaymentSummaryStatus.PARTIALLY_REFUNDED,
];

const IMPORTED_CANCELED_STATUSES = ['CANCELED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'FAILED'];
const IMPORTED_COMPLETED_STATUSES = ['COMPLETED'];
const PURCHASE_ENTRY_REPORT_SOURCE_MODULES = ['procurement_receipt', 'purchase_fiscal_document'] as const;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financeService: FinanceService,
  ) {}

  async getDashboard(ctx: RequestContext, query: ReportsOverviewQuery = {}) {
    const overview = await this.getOverview(ctx, query);
    return {
      generatedAt: overview.generatedAt,
      period: overview.period,
      scope: overview.scope,
      cards: overview.summary,
      highlights: {
        salesByDay: overview.charts.salesByDay.slice(-14),
        topChannels: overview.breakdowns.channels.slice(0, 5),
        topProducts: overview.rankings.topProducts.slice(0, 5),
        peakHours: overview.charts.peakHours.slice().sort((a, b) => b.orders - a.orders).slice(0, 5),
        alerts: this.buildDashboardAlerts(overview),
      },
      permissions: overview.permissions,
    };
  }

  async getPremium(ctx: RequestContext, query: ReportsOverviewQuery = {}) {
    const [
      dashboard,
      operational,
      salesByPeriod,
      salesByChannel,
      topProducts,
      averageTicket,
      peakHours,
      inventory,
      cmv,
      financial,
      byBranch,
      byOperator,
    ] = await Promise.all([
      this.getDashboard(ctx, query),
      this.getOperational(ctx, query),
      this.getSalesByPeriod(ctx, query),
      this.getSalesByChannel(ctx, query),
      this.getTopProductsReport(ctx, query),
      this.getAverageTicket(ctx, query),
      this.getPeakHoursReport(ctx, query),
      this.getInventory(ctx, query),
      this.getCmv(ctx, query),
      this.getFinancial(ctx, query),
      this.getByBranch(ctx, query),
      this.getByOperator(ctx, query),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      period: dashboard.period,
      scope: dashboard.scope,
      executive: dashboard.cards,
      highlights: dashboard.highlights,
      operational,
      sales: {
        byPeriod: salesByPeriod,
        byChannel: salesByChannel,
        topProducts,
        averageTicket,
        peakHours,
      },
      inventory,
      cmv,
      financial,
      branches: byBranch,
      operators: byOperator,
      sources: {
        liveOrders: true,
        importedHistory: true,
        snapshots: true,
      },
    };
  }

  async getOperational(ctx: RequestContext, query: ReportsOverviewQuery = {}) {
    const { period, scope, baseWhere } = await this.resolveReportBase(ctx, query);
    const [statusDistribution, cancellations, preparationTime, deliveryTime, delayedOrders, summary] =
      await Promise.all([
        this.getStatuses(baseWhere),
        this.getCancellations(baseWhere),
        this.getAverageStageTime(ctx, period, scope, query, 'preparation'),
        this.getAverageStageTime(ctx, period, scope, query, 'delivery'),
        this.countDelayedOrders(ctx, period, scope),
        this.prisma.order.aggregate({
          where: baseWhere,
          _count: { _all: true },
          _sum: { totalAmount: true, refundedAmount: true },
        }),
      ]);

    return {
      generatedAt: new Date().toISOString(),
      period: this.mapPeriod(period),
      scope: this.mapScope(ctx, scope),
      summary: {
        ordersCreated: summary._count._all,
        delayedOrders,
        refundsAmount: this.money(summary._sum.refundedAmount),
        grossSales: this.money(summary._sum.totalAmount),
        averagePreparationMinutes: preparationTime.averageMinutes,
        averageDeliveryMinutes: deliveryTime.averageMinutes,
      },
      statusDistribution,
      cancellations,
      preparationTime,
      deliveryTime,
    };
  }

  async getSalesByPeriod(ctx: RequestContext, query: ReportsOverviewQuery = {}) {
    const { period, scope } = await this.resolveReportBase(ctx, query);
    const groupBy = query.groupBy ?? 'day';
    const series = await this.getSalesSeries(ctx, period, scope, query, groupBy);
    const totals = series.reduce(
      (acc, row) => ({
        ordersCount: acc.ordersCount + row.ordersCount,
        grossSales: this.money(acc.grossSales + row.grossSales),
        netSales: this.money(acc.netSales + row.netSales),
        canceledOrders: acc.canceledOrders + row.canceledOrders,
        refundsAmount: this.money(acc.refundsAmount + row.refundsAmount),
      }),
      { ordersCount: 0, grossSales: 0, netSales: 0, canceledOrders: 0, refundsAmount: 0 },
    );

    return {
      generatedAt: new Date().toISOString(),
      period: this.mapPeriod(period),
      scope: this.mapScope(ctx, scope),
      groupBy,
      summary: {
        ...totals,
        averageTicket: totals.ordersCount > 0 ? this.money(totals.netSales / totals.ordersCount) : 0,
      },
      series,
    };
  }

  async getSalesByChannel(ctx: RequestContext, query: ReportsOverviewQuery = {}) {
    const { period, scope, baseWhere } = await this.resolveReportBase(ctx, query);
    const channels = await this.getCombinedChannels(ctx, period, scope, query, baseWhere);
    return {
      generatedAt: new Date().toISOString(),
      period: this.mapPeriod(period),
      scope: this.mapScope(ctx, scope),
      items: channels.map((channel) => ({
        ...channel,
        averageTicket: channel.orders > 0 ? this.money(channel.revenue / channel.orders) : 0,
      })),
    };
  }

  async getTopProductsReport(ctx: RequestContext, query: ReportsOverviewQuery = {}) {
    const { period, scope, soldWhere } = await this.resolveReportBase(ctx, query);
    const products = await this.getTopProducts(soldWhere, this.resolveLimit(query.limit, 20));
    const totalRevenue = products.reduce((sum, product) => sum + product.revenue, 0);
    return {
      generatedAt: new Date().toISOString(),
      period: this.mapPeriod(period),
      scope: this.mapScope(ctx, scope),
      items: products.map((product) => ({
        ...product,
        averageTicket: product.orders > 0 ? this.money(product.revenue / product.orders) : 0,
        percent: this.share(product.revenue, totalRevenue),
      })),
    };
  }

  async getAverageTicket(ctx: RequestContext, query: ReportsOverviewQuery = {}) {
    const { period, scope, baseWhere } = await this.resolveReportBase(ctx, query);
    const [overall, byChannel, byBranch, byOperator, byWaiter] = await Promise.all([
      this.getAverageTicketCombined(ctx, period, scope, query, baseWhere),
      this.getAverageTicketByChannelCombined(ctx, period, scope, query, baseWhere),
      this.getAverageTicketByBranchCombined(ctx, period, scope, query, baseWhere),
      this.getAverageTicketByOperator(baseWhere),
      this.getAverageTicketByWaiter(baseWhere),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      period: this.mapPeriod(period),
      scope: this.mapScope(ctx, scope),
      overall,
      byChannel,
      byBranch,
      byOperator,
      byWaiter,
    };
  }

  async getPeakHoursReport(ctx: RequestContext, query: ReportsOverviewQuery = {}) {
    const { period, scope } = await this.resolveReportBase(ctx, query);
    const items = await this.getPeakHours(ctx, period, scope, query);
    return {
      generatedAt: new Date().toISOString(),
      period: this.mapPeriod(period),
      scope: this.mapScope(ctx, scope),
      items,
    };
  }

  async getInventory(ctx: RequestContext, query: ReportsOverviewQuery = {}) {
    const { period, scope } = await this.resolveReportBase(ctx, query);
    const movementWhere = {
      stockItem: { companyId: ctx.companyId },
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
      createdAt: { gte: period.from, lte: period.to },
    } satisfies Prisma.StockMovementWhereInput;
    const itemWhere = { companyId: ctx.companyId, isActive: true } satisfies Prisma.StockItemWhereInput;
    const balanceWhere = {
      companyId: ctx.companyId,
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
    } satisfies Prisma.StockLocationBalanceWhereInput;

    const [itemsCount, lowStockItems, criticalItems, movements, balances, topLowStock] = await Promise.all([
      this.prisma.stockItem.count({ where: itemWhere }),
      this.countLowStockItems(ctx, scope),
      this.prisma.stockItem.count({ where: { ...itemWhere, isCritical: true } }),
      this.prisma.stockMovement.groupBy({
        by: ['movementType'],
        where: movementWhere,
        _count: { _all: true },
        _sum: { quantity: true, totalCost: true },
        orderBy: { _count: { movementType: 'desc' } },
      }),
      this.prisma.stockLocationBalance.findMany({
        where: balanceWhere,
        include: {
          stockItem: {
            select: {
              id: true,
              name: true,
              stockType: true,
              stockUnit: true,
              minimumQuantity: true,
              reorderPoint: true,
              averageCost: true,
              leadTimeDays: true,
              isCritical: true,
              category: { select: { name: true } },
            },
          },
        },
        orderBy: { currentQuantity: 'asc' },
        take: 12,
      }),
      this.prisma.stockItem.findMany({
        where: itemWhere,
        select: {
          id: true,
          name: true,
          stockType: true,
          currentQuantity: true,
          minimumQuantity: true,
          reorderPoint: true,
          stockUnit: true,
          averageCost: true,
          leadTimeDays: true,
          isCritical: true,
          category: { select: { name: true } },
        },
        orderBy: [{ currentQuantity: 'asc' }, { name: 'asc' }],
        take: 12,
      }),
    ]);

    const balanceValue = balances.reduce(
      (sum, row) => sum + Number(row.currentQuantity ?? 0) * Number(row.stockItem.averageCost ?? 0),
      0,
    );

    return {
      generatedAt: new Date().toISOString(),
      period: this.mapPeriod(period),
      scope: this.mapScope(ctx, scope),
      dataStatus: balances.length > 0 ? 'READY' : 'PARTIAL_DATA',
      summary: {
        itemsCount,
        lowStockItems,
        criticalItems,
        balanceRows: balances.length,
        estimatedStockValue: this.money(balanceValue),
      },
      movements: movements.map((row) => ({
        key: row.movementType,
        label: this.toLabel(row.movementType),
        count: row._count._all,
        quantity: this.money(row._sum.quantity),
        totalCost: this.money(row._sum.totalCost),
      })),
      lowStockRanking: (balances.length > 0 ? balances : topLowStock).map((row: any) => ({
        stockItemId: row.stockItem?.id ?? row.id,
        name: row.stockItem?.name ?? row.name,
        currentQuantity: this.money(row.currentQuantity),
        minimumQuantity: this.money(row.stockItem?.minimumQuantity ?? row.minimumQuantity),
        unit: row.stockItem?.stockUnit ?? row.stockUnit ?? null,
        estimatedValue: this.money(Number(row.currentQuantity ?? 0) * Number(row.stockItem?.averageCost ?? row.averageCost ?? 0)),
        critical: Boolean(row.stockItem?.isCritical ?? row.isCritical),
      })),
      purchaseSuggestions: this.buildPurchaseSuggestions(balances.length > 0 ? balances : topLowStock),
    };
  }

  private buildPurchaseSuggestions(rows: any[]) {
    return rows
      .map((row: any) => {
        const stockItem = row.stockItem ?? row;
        const currentQuantity = Number(row.currentQuantity ?? stockItem.currentQuantity ?? 0);
        const minimumQuantity = Number(stockItem.minimumQuantity ?? 0);
        const reorderPoint = Number(stockItem.reorderPoint ?? 0);
        const targetQuantity = Math.max(minimumQuantity, reorderPoint);
        const suggestedQuantity = this.money(Math.max(0, targetQuantity - currentQuantity));
        const averageCost = Number(stockItem.averageCost ?? 0);
        return {
          stockItemId: stockItem.id,
          name: stockItem.name,
          type: stockItem.stockType ?? null,
          category: stockItem.category?.name ?? null,
          currentQuantity: this.money(currentQuantity),
          minimumQuantity: this.money(minimumQuantity),
          reorderPoint: this.money(reorderPoint),
          suggestedQuantity,
          unit: stockItem.stockUnit ?? null,
          leadTimeDays: Number(stockItem.leadTimeDays ?? 0),
          estimatedPurchaseCost: this.money(suggestedQuantity * averageCost),
          critical: Boolean(stockItem.isCritical),
        };
      })
      .filter((row) => row.suggestedQuantity > 0)
      .sort((left, right) => Number(right.critical) - Number(left.critical) || right.estimatedPurchaseCost - left.estimatedPurchaseCost)
      .slice(0, 12);
  }

  private async countLowStockItems(ctx: RequestContext, scope: BranchScope): Promise<number> {
    const rows = scope.branchId
      ? await this.prisma.$queryRaw<Array<{ count: number | bigint }>>(Prisma.sql`
          SELECT COUNT(*)::int AS count
            FROM stock_location_balances b
            JOIN stock_items i ON i.id = b.stock_item_id
           WHERE b.company_id = ${ctx.companyId}
             AND b.branch_id = ${scope.branchId}
             AND i.controls_stock = true
             AND b.current_quantity <= i.minimum_quantity
        `)
      : await this.prisma.$queryRaw<Array<{ count: number | bigint }>>(Prisma.sql`
          SELECT COUNT(*)::int AS count
            FROM stock_items
           WHERE company_id = ${ctx.companyId}
             AND is_active = true
             AND controls_stock = true
             AND current_quantity <= minimum_quantity
        `);
    return Number(rows[0]?.count ?? 0);
  }

  async getCmv(ctx: RequestContext, query: ReportsOverviewQuery = {}) {
    const { period, scope, soldWhere } = await this.resolveReportBase(ctx, query);
    const orderItems = await this.prisma.orderItem.findMany({
      where: {
        status: { not: 'CANCELED' },
        order: soldWhere,
      },
      select: {
        productId: true,
        productNameSnapshot: true,
        quantity: true,
        totalPrice: true,
        costSnapshot: true,
        theoreticalCostSnapshot: true,
        product: {
          select: {
            costPrice: true,
            category: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });

    const products = this.buildCmvProductRows(orderItems);
    const categories = this.buildCmvCategoryRows(products);
    const cogs = this.money(products.reduce((sum, row) => sum + row.cogs, 0));
    const grossSales = this.money(products.reduce((sum, row) => sum + row.revenue, 0));
    const quantity = this.money(products.reduce((sum, row) => sum + row.quantity, 0));
    const grossMargin = this.money(grossSales - cogs);
    const productsWithoutCost = products.filter((row) => row.itemsWithoutCost > 0).length;
    const productsWithPartialCost = products.filter((row) => row.fallbackCostItems > 0).length;
    const lossMakingProducts = products.filter((row) => row.lossMaking).length;
    const cmvStatus = orderItems.length > 0 && cogs > 0 && productsWithoutCost === 0 && productsWithPartialCost === 0 ? 'READY' : 'PARTIAL_DATA';
    const notes: string[] = [];
    if (productsWithoutCost > 0) {
      notes.push(`${productsWithoutCost} produto(s) vendido(s) sem custo/ficha tecnica suficiente.`);
    }
    if (productsWithPartialCost > 0) {
      notes.push(`${productsWithPartialCost} produto(s) usando custo teorico ou custo cadastrado como fallback.`);
    }
    if (!notes.length && cmvStatus !== 'READY') {
      notes.push('CMV parcial: os itens vendidos ainda nao possuem custo/ficha tecnica suficiente no periodo.');
    }
    return {
      generatedAt: new Date().toISOString(),
      period: this.mapPeriod(period),
      scope: this.mapScope(ctx, scope),
      cmvStatus,
      summary: {
        grossSales,
        cogs,
        quantity,
        grossMargin,
        grossMarginPercent: grossSales > 0 ? this.percent((grossMargin / grossSales) * 100) : 0,
        products: products.length,
        categories: categories.length,
        lossMakingProducts,
        productsWithoutCost,
        productsWithPartialCost,
      },
      products: products.slice(0, 20),
      categories,
      lossMaking: products.filter((row) => row.lossMaking).slice(0, 10),
      notes,
    };
  }

  async getAbcStockItems(ctx: RequestContext, query: ReportsOverviewQuery = {}) {
    const { period, scope } = await this.resolveReportBase(ctx, query);
    const rows = await this.prisma.stockMovement.findMany({
      where: {
        stockItem: { companyId: ctx.companyId, stockType: 'RAW_MATERIAL' },
        ...(scope.branchId ? { branchId: scope.branchId } : {}),
        movementType: 'ENTRY',
        sourceModule: { in: [...PURCHASE_ENTRY_REPORT_SOURCE_MODULES] },
        createdAt: { gte: period.from, lte: period.to },
      },
      include: {
        stockItem: {
          select: {
            id: true,
            name: true,
            code: true,
            stockUnit: true,
            averageCost: true,
            category: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20000,
    });

    const grouped = new Map<
      string,
      {
        stockItemId: string;
        name: string;
        code: string | null;
        categoryName: string;
        unit: string | null;
        quantity: number;
        totalPurchased: number;
        samples: number;
        averageCost: number;
      }
    >();

    for (const row of rows) {
      const current = grouped.get(row.stockItemId) ?? {
        stockItemId: row.stockItemId,
        name: row.stockItem?.name ?? row.stockItemId,
        code: row.stockItem?.code ?? null,
        categoryName: row.stockItem?.category?.name ?? 'Sem categoria',
        unit: row.stockItem?.stockUnit ?? null,
        quantity: 0,
        totalPurchased: 0,
        samples: 0,
        averageCost: Number(row.stockItem?.averageCost ?? 0),
      };
      const quantity = Number(row.quantity ?? 0);
      const recordedTotal = Number(row.totalCost ?? 0);
      current.quantity = this.money(current.quantity + quantity);
      current.totalPurchased = this.money(current.totalPurchased + (recordedTotal > 0 ? recordedTotal : quantity * Number(row.unitCost ?? 0)));
      current.samples += 1;
      grouped.set(row.stockItemId, current);
    }

    const sorted = Array.from(grouped.values()).sort((left, right) => right.totalPurchased - left.totalPurchased);
    const totalPurchased = this.money(sorted.reduce((sum, row) => sum + row.totalPurchased, 0));
    let accumulated = 0;
    const items = sorted.map((row, index) => {
      accumulated += row.totalPurchased;
      const percent = this.share(row.totalPurchased, totalPurchased);
      const cumulativePercent = this.share(accumulated, totalPurchased);
      const abcClass = this.abcClass(cumulativePercent);
      return {
        rank: index + 1,
        ...row,
        weightedAverageCost: row.quantity > 0 ? this.money(row.totalPurchased / row.quantity) : row.averageCost,
        percent,
        cumulativePercent,
        abcClass,
        suggestedAction: this.abcStockAction(abcClass),
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      period: this.mapPeriod(period),
      scope: this.mapScope(ctx, scope),
      source: 'STOCK_PURCHASE_ENTRIES',
      summary: {
        items: sorted.length,
        totalPurchased,
        classA: items.filter((row) => row.abcClass === 'A').length,
        classB: items.filter((row) => row.abcClass === 'B').length,
        classC: items.filter((row) => row.abcClass === 'C').length,
      },
      items,
    };
  }

  async getAbcProducts(ctx: RequestContext, query: ReportsOverviewQuery = {}) {
    const { period, scope, soldWhere } = await this.resolveReportBase(ctx, query);
    const rows = await this.prisma.orderItem.findMany({
      where: {
        status: { not: 'CANCELED' },
        order: soldWhere,
      },
      select: {
        productId: true,
        productNameSnapshot: true,
        quantity: true,
        totalPrice: true,
        costSnapshot: true,
        theoreticalCostSnapshot: true,
        product: {
          select: {
            costPrice: true,
            category: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20000,
    });

    const products = this.buildCmvProductRows(rows);
    const totalRevenue = this.money(products.reduce((sum, row) => sum + row.revenue, 0));
    let accumulated = 0;
    const items = products.map((row) => {
      accumulated += row.revenue;
      const percent = this.share(row.revenue, totalRevenue);
      const cumulativePercent = this.share(accumulated, totalRevenue);
      const abcClass = this.abcClass(cumulativePercent);
      return {
        ...row,
        percent,
        cumulativePercent,
        abcClass,
        suggestedAction: this.abcProductAction(abcClass, row.grossMarginPercent, row.lossMaking),
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      period: this.mapPeriod(period),
      scope: this.mapScope(ctx, scope),
      source: 'ORDER_ITEMS',
      summary: {
        products: items.length,
        revenue: totalRevenue,
        classA: items.filter((row) => row.abcClass === 'A').length,
        classB: items.filter((row) => row.abcClass === 'B').length,
        classC: items.filter((row) => row.abcClass === 'C').length,
      },
      items,
    };
  }

  private buildCmvProductRows(
    orderItems: Array<{
      productId: string | null;
      productNameSnapshot: string;
      quantity: unknown;
      totalPrice: unknown;
      costSnapshot: unknown;
      theoreticalCostSnapshot: unknown;
      product?: {
        costPrice?: unknown;
        category?: { id: string; name: string } | null;
      } | null;
    }>,
  ) {
    const grouped = new Map<
      string,
      {
        productId: string | null;
        name: string;
        categoryId: string | null;
        categoryName: string;
        quantity: number;
        revenue: number;
        cogs: number;
        orderItems: number;
        itemsWithoutCost: number;
        fallbackCostItems: number;
      }
    >();

    for (const item of orderItems) {
      const key = item.productId ?? `snapshot:${item.productNameSnapshot}`;
      const current = grouped.get(key) ?? {
        productId: item.productId ?? null,
        name: item.productNameSnapshot,
        categoryId: item.product?.category?.id ?? null,
        categoryName: item.product?.category?.name ?? 'Sem categoria',
        quantity: 0,
        revenue: 0,
        cogs: 0,
        orderItems: 0,
        itemsWithoutCost: 0,
        fallbackCostItems: 0,
      };
      const quantity = Number(item.quantity ?? 0);
      const resolved = this.resolveReportUnitCost(item);
      current.quantity = this.money(current.quantity + quantity);
      current.revenue = this.money(current.revenue + Number(item.totalPrice ?? 0));
      current.cogs = this.money(current.cogs + quantity * resolved.unitCost);
      current.orderItems += 1;
      if (resolved.source === 'MISSING') current.itemsWithoutCost += 1;
      if (resolved.dataStatus === 'PARTIAL_DATA') current.fallbackCostItems += 1;
      grouped.set(key, current);
    }

    return Array.from(grouped.values())
      .sort((left, right) => right.revenue - left.revenue)
      .map((row, index) => {
        const grossMargin = this.money(row.revenue - row.cogs);
        const averageUnitCost = row.quantity > 0 ? this.money(row.cogs / row.quantity) : 0;
        return {
          rank: index + 1,
          ...row,
          averageUnitCost,
          grossMargin,
          grossMarginPercent: row.revenue > 0 ? this.percent((grossMargin / row.revenue) * 100) : 0,
          cogsStatus: row.cogs > 0 && row.itemsWithoutCost === 0 && row.fallbackCostItems === 0 ? 'READY' : 'PARTIAL_DATA',
          lossMaking: row.revenue > 0 && grossMargin < 0,
        };
      });
  }

  private buildCmvCategoryRows(
    products: Array<{
      categoryId: string | null;
      categoryName: string;
      quantity: number;
      revenue: number;
      cogs: number;
      itemsWithoutCost: number;
      fallbackCostItems: number;
      lossMaking: boolean;
    }>,
  ) {
    const grouped = new Map<
      string,
      {
        categoryId: string | null;
        categoryName: string;
        products: number;
        quantity: number;
        revenue: number;
        cogs: number;
        lossMakingProducts: number;
        productsWithoutCost: number;
        productsWithPartialCost: number;
      }
    >();

    for (const product of products) {
      const key = product.categoryId ?? product.categoryName;
      const current = grouped.get(key) ?? {
        categoryId: product.categoryId,
        categoryName: product.categoryName,
        products: 0,
        quantity: 0,
        revenue: 0,
        cogs: 0,
        lossMakingProducts: 0,
        productsWithoutCost: 0,
        productsWithPartialCost: 0,
      };
      current.products += 1;
      current.quantity = this.money(current.quantity + product.quantity);
      current.revenue = this.money(current.revenue + product.revenue);
      current.cogs = this.money(current.cogs + product.cogs);
      if (product.lossMaking) current.lossMakingProducts += 1;
      if (product.itemsWithoutCost > 0) current.productsWithoutCost += 1;
      if (product.fallbackCostItems > 0) current.productsWithPartialCost += 1;
      grouped.set(key, current);
    }

    return Array.from(grouped.values())
      .sort((left, right) => right.revenue - left.revenue)
      .map((row) => {
        const grossMargin = this.money(row.revenue - row.cogs);
        return {
          ...row,
          grossMargin,
          grossMarginPercent: row.revenue > 0 ? this.percent((grossMargin / row.revenue) * 100) : 0,
          cogsStatus: row.cogs > 0 && row.productsWithoutCost === 0 && row.productsWithPartialCost === 0 ? 'READY' : 'PARTIAL_DATA',
        };
      });
  }

  private resolveReportUnitCost(item: {
    costSnapshot?: unknown;
    theoreticalCostSnapshot?: unknown;
    product?: { costPrice?: unknown } | null;
  }) {
    const costSnapshot = Number(item.costSnapshot ?? 0);
    if (costSnapshot > 0) return { unitCost: this.money(costSnapshot), source: 'COST_SNAPSHOT', dataStatus: 'READY' as const };
    const theoreticalCost = Number(item.theoreticalCostSnapshot ?? 0);
    if (theoreticalCost > 0) return { unitCost: this.money(theoreticalCost), source: 'THEORETICAL_COST', dataStatus: 'PARTIAL_DATA' as const };
    const productCost = Number(item.product?.costPrice ?? 0);
    if (productCost > 0) return { unitCost: this.money(productCost), source: 'PRODUCT_COST_PRICE', dataStatus: 'PARTIAL_DATA' as const };
    return { unitCost: 0, source: 'MISSING', dataStatus: 'NO_DATA' as const };
  }

  private abcClass(cumulativePercent: number): 'A' | 'B' | 'C' {
    if (cumulativePercent <= 80) return 'A';
    if (cumulativePercent <= 95) return 'B';
    return 'C';
  }

  private abcStockAction(abcClass: 'A' | 'B' | 'C') {
    if (abcClass === 'A') return 'Priorizar negociacao, cobertura e acompanhamento de preco.';
    if (abcClass === 'B') return 'Monitorar reposicao e variacao de custo semanalmente.';
    return 'Comprar sob demanda e evitar excesso de estoque.';
  }

  private abcProductAction(abcClass: 'A' | 'B' | 'C', grossMarginPercent: number, lossMaking: boolean) {
    if (lossMaking) return 'Revisar preco, ficha tecnica e custo antes de promover.';
    if (abcClass === 'A') return grossMarginPercent < 30 ? 'Produto forte com margem baixa: revisar custo e preco.' : 'Proteger disponibilidade e destaque no cardapio.';
    if (abcClass === 'B') return 'Monitorar margem e testar destaque em campanhas.';
    return 'Reavaliar posicionamento, foto, descricao ou permanencia no cardapio.';
  }

  async getFinancial(ctx: RequestContext, query: ReportsOverviewQuery = {}) {
    const { period, scope } = await this.resolveReportBase(ctx, query);
    const finance = await this.getFinance(ctx, period, scope);
    return {
      generatedAt: new Date().toISOString(),
      period: this.mapPeriod(period),
      scope: this.mapScope(ctx, scope),
      ...finance,
    };
  }

  async getByBranch(ctx: RequestContext, query: ReportsOverviewQuery = {}) {
    const { period, scope, baseWhere } = await this.resolveReportBase(ctx, query);
    const branches = await this.getCombinedBranchRanking(ctx, period, scope, query, baseWhere, this.resolveLimit(query.limit, 20));
    return {
      generatedAt: new Date().toISOString(),
      period: this.mapPeriod(period),
      scope: this.mapScope(ctx, scope),
      items: branches.map((branch) => ({
        ...branch,
        averageTicket: branch.orders > 0 ? this.money(branch.revenue / branch.orders) : 0,
      })),
    };
  }

  async getByOperator(ctx: RequestContext, query: ReportsOverviewQuery = {}) {
    const { period, scope, soldWhere } = await this.resolveReportBase(ctx, query);
    const operators = await this.getOperatorRanking(soldWhere, this.resolveLimit(query.limit, 20));
    return {
      generatedAt: new Date().toISOString(),
      period: this.mapPeriod(period),
      scope: this.mapScope(ctx, scope),
      items: operators.map((operator) => ({
        ...operator,
        averageTicket: operator.orders > 0 ? this.money(operator.revenue / operator.orders) : 0,
      })),
    };
  }

  async getByWaiter(ctx: RequestContext, query: ReportsOverviewQuery = {}) {
    const { period, scope, baseWhere } = await this.resolveReportBase(ctx, query);
    const waiters = await this.getWaiterRanking(baseWhere, this.resolveLimit(query.limit, 20));
    return {
      generatedAt: new Date().toISOString(),
      period: this.mapPeriod(period),
      scope: this.mapScope(ctx, scope),
      items: waiters,
    };
  }

  async getWaiterDetail(ctx: RequestContext, waiterUserId: string, query: ReportsOverviewQuery = {}) {
    const scopedQuery = { ...query, waiterUserId };
    const { period, scope, baseWhere, soldWhere } = await this.resolveReportBase(ctx, scopedQuery);
    const [summary, topProducts, peakHours] = await Promise.all([
      this.getAverageTicketForWhere(baseWhere),
      this.getTopProducts(soldWhere, 10),
      this.getPeakHours(ctx, period, scope, scopedQuery),
    ]);
    const waiter = await this.prisma.user.findFirst({
      where: { id: waiterUserId },
      select: { id: true, name: true, email: true },
    });
    return {
      generatedAt: new Date().toISOString(),
      period: this.mapPeriod(period),
      scope: this.mapScope(ctx, scope),
      waiter: waiter ? { id: waiter.id, name: waiter.name, email: waiter.email } : { id: waiterUserId, name: 'Garcom', email: null },
      summary,
      topProducts,
      peakHours,
    };
  }

  async getOverview(ctx: RequestContext, query: ReportsOverviewQuery = {}) {
    const { period, scope, baseWhere, soldWhere } = await this.resolveReportBase(ctx, query);

    const [
      totalOrders,
      activeOrders,
      delayedOrders,
      completedOrders,
      canceledOrders,
      grossAggregate,
      canceledAggregate,
      paidAggregate,
      channels,
      statuses,
      paymentStatuses,
      paymentMethods,
      neighborhoods,
      salesByDay,
      peakHours,
      topProducts,
      branchRanking,
      operatorRanking,
      finance,
      importedOverview,
    ] = await Promise.all([
      this.prisma.order.count({ where: baseWhere }),
      this.prisma.order.count({ where: { ...baseWhere, status: { in: ACTIVE_STATUSES } } }),
      this.countDelayedOrders(ctx, period, scope),
      this.prisma.order.count({ where: { ...baseWhere, status: { in: COMPLETED_STATUSES } } }),
      this.prisma.order.count({
        where: {
          ...baseWhere,
          OR: [
            { status: { in: CANCELED_STATUSES } },
            { paymentStatus: { in: [OrderPaymentSummaryStatus.CANCELED, OrderPaymentSummaryStatus.REFUNDED] } },
          ],
        },
      }),
      this.prisma.order.aggregate({ where: baseWhere, _sum: { subtotal: true, totalAmount: true, deliveryFee: true, extraFee: true, discountAmount: true } }),
      this.prisma.order.aggregate({
        where: {
          ...baseWhere,
          OR: [
            { status: { in: CANCELED_STATUSES } },
            { paymentStatus: { in: [OrderPaymentSummaryStatus.CANCELED, OrderPaymentSummaryStatus.REFUNDED] } },
          ],
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.order.aggregate({
        where: { ...baseWhere, paymentStatus: { in: PAID_PAYMENT_STATUSES } },
        _sum: { totalAmount: true, paidAmount: true },
      }),
      this.getCombinedChannels(ctx, period, scope, query, baseWhere),
      this.getStatuses(baseWhere),
      this.getPaymentStatuses(baseWhere),
      this.getCombinedPaymentMethods(ctx, period, scope, query, baseWhere),
      this.getDeliveryNeighborhoods(ctx, period, scope, query),
      this.getSalesByDay(ctx, period, scope, query),
      this.getPeakHours(ctx, period, scope, query),
      this.getTopProducts(soldWhere, 10),
      this.getCombinedBranchRanking(ctx, period, scope, query, baseWhere, 12),
      this.getOperatorRanking(soldWhere, 10),
      this.getFinance(ctx, period, scope),
      this.getImportedOverview(ctx, period, scope, query),
    ]);

    const totalOrdersWithImported = totalOrders + importedOverview.totalOrders;
    const completedOrdersWithImported = completedOrders + importedOverview.completedOrders;
    const canceledOrdersWithImported = canceledOrders + importedOverview.canceledOrders;
    const grossRevenue = this.money(this.money(grossAggregate._sum.totalAmount) + importedOverview.grossRevenue);
    const canceledRevenue = this.money(this.money(canceledAggregate._sum.totalAmount) + importedOverview.canceledRevenue);
    const netRevenue = this.money(Math.max(0, grossRevenue - canceledRevenue));
    const paidRevenue = this.money(this.money(paidAggregate._sum.paidAmount ?? paidAggregate._sum.totalAmount) + importedOverview.paidRevenue);
    const averageTicket = totalOrdersWithImported > 0 ? this.money(netRevenue / totalOrdersWithImported) : 0;
    const completionRate = totalOrdersWithImported > 0 ? this.percent((completedOrdersWithImported / totalOrdersWithImported) * 100) : 0;
    const cancelRate = totalOrdersWithImported > 0 ? this.percent((canceledOrdersWithImported / totalOrdersWithImported) * 100) : 0;

    return {
      generatedAt: new Date().toISOString(),
      period: {
        from: period.from.toISOString(),
        to: period.to.toISOString(),
        maxDays: MAX_RANGE_DAYS,
      },
      scope: {
        companyId: ctx.companyId,
        branchId: scope.branchId ?? null,
      },
      permissions: {
        financial: finance.allowed,
      },
      summary: {
        totalOrders: totalOrdersWithImported,
        activeOrders,
        delayedOrders,
        completedOrders: completedOrdersWithImported,
        canceledOrders: canceledOrdersWithImported,
        grossRevenue,
        netRevenue,
        canceledRevenue,
        paidRevenue,
        averageTicket,
        subtotal: this.money(grossAggregate._sum.subtotal),
        deliveryFee: this.money(this.money(grossAggregate._sum.deliveryFee) + importedOverview.deliveryFee),
        extraFee: this.money(grossAggregate._sum.extraFee),
        discount: this.money(this.money(grossAggregate._sum.discountAmount) + importedOverview.discountAmount),
        completionRate,
        cancelRate,
        importedHistory: importedOverview,
      },
      charts: {
        salesByDay,
        peakHours,
      },
      breakdowns: {
        channels,
        statuses,
        paymentStatuses,
        paymentMethods,
        neighborhoods,
        branches: branchRanking,
      },
      rankings: {
        topProducts,
        operators: operatorRanking,
      },
      financial: finance,
    };
  }

  private async resolveReportBase(ctx: RequestContext, query: ReportsOverviewQuery = {}) {
    const period = this.resolvePeriod(query);
    const scope = await this.resolveBranchScope(ctx, query.branchId);
    const baseWhere = this.orderWhere(ctx, period, scope, query);
    const soldWhere = {
      ...baseWhere,
      status: { notIn: CANCELED_STATUSES },
    } satisfies Prisma.OrderWhereInput;
    return { period, scope, baseWhere, soldWhere };
  }

  private buildDashboardAlerts(overview: any) {
    const alerts: Array<{ tone: 'success' | 'warning' | 'danger'; title: string; message: string }> = [];
    if (overview.summary.delayedOrders > 0) {
      alerts.push({
        tone: 'warning',
        title: 'Pedidos atrasados',
        message: `${overview.summary.delayedOrders} pedido(s) com mais de 30 minutos em etapa critica.`,
      });
    }
    if (overview.summary.cancelRate >= 10) {
      alerts.push({
        tone: 'danger',
        title: 'Cancelamento alto',
        message: `${overview.summary.cancelRate}% dos pedidos do periodo foram cancelados ou reembolsados.`,
      });
    }
    if (overview.financial.allowed && overview.financial.reconciliationSummary?.divergent) {
      alerts.push({
        tone: 'danger',
        title: 'Conciliação divergente',
        message: `${overview.financial.reconciliationSummary.divergent} item(ns) financeiros divergentes.`,
      });
    }
    if (!alerts.length) {
      alerts.push({ tone: 'success', title: 'Operacao estavel', message: 'Nenhum alerta critico encontrado no periodo.' });
    }
    return alerts;
  }

  private async getCancellations(where: Prisma.OrderWhereInput) {
    const rows = await this.prisma.order.groupBy({
      by: ['cancellationReason'],
      where: { ...where, status: { in: CANCELED_STATUSES } },
      _count: { _all: true },
      _sum: { totalAmount: true },
      orderBy: { _count: { cancellationReason: 'desc' } },
      take: 12,
    });
    return rows.map((row) => ({
      reason: row.cancellationReason ?? 'Sem motivo informado',
      count: row._count._all,
      amount: this.money(row._sum.totalAmount),
    }));
  }

  private async getAverageStageTime(
    ctx: RequestContext,
    period: Period,
    scope: BranchScope,
    query: ReportsOverviewQuery,
    stage: 'preparation' | 'delivery',
  ) {
    const startExpression =
      stage === 'preparation'
        ? Prisma.sql`COALESCE(o.preparation_started_at, o.confirmed_at, o.created_at)`
        : Prisma.sql`COALESCE(o.dispatched_at, o.ready_at, o.created_at)`;
    const endColumn = stage === 'preparation' ? Prisma.sql`o.ready_at` : Prisma.sql`o.delivered_at`;
    const rows = await this.prisma.$queryRaw<Array<{ average: number | { toString(): string }; count: number | bigint }>>(Prisma.sql`
      SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (${endColumn} - ${startExpression})) / 60), 0)::numeric AS average,
             COUNT(*)::int AS count
        FROM orders o
       WHERE ${this.rawOrderConditions(ctx, period, scope, query)}
         AND ${endColumn} IS NOT NULL
    `);
    const row = rows[0] ?? { average: 0, count: 0 };
    return {
      stage,
      averageMinutes: this.money(row.average),
      samples: Number(row.count ?? 0),
    };
  }

  private async getSalesSeries(
    ctx: RequestContext,
    period: Period,
    scope: BranchScope,
    query: ReportsOverviewQuery,
    groupBy: 'day' | 'week' | 'month' | 'hour',
  ) {
    const orderGrain =
      groupBy === 'hour'
        ? Prisma.sql`date_trunc('hour', o.created_at)`
        : groupBy === 'week'
          ? Prisma.sql`date_trunc('week', o.created_at)`
          : groupBy === 'month'
            ? Prisma.sql`date_trunc('month', o.created_at)`
            : Prisma.sql`date_trunc('day', o.created_at)`;
    const importedGrain =
      groupBy === 'hour'
        ? Prisma.sql`date_trunc('hour', i.sale_date)`
        : groupBy === 'week'
          ? Prisma.sql`date_trunc('week', i.sale_date)`
          : groupBy === 'month'
            ? Prisma.sql`date_trunc('month', i.sale_date)`
            : Prisma.sql`date_trunc('day', i.sale_date)`;
    const rows = await this.prisma.$queryRaw<
      Array<{
        bucket: Date | string;
        orders: number | bigint;
        grossSales: number | { toString(): string };
        canceledSales: number | { toString(): string };
        canceledOrders: number | bigint;
        refundsAmount: number | { toString(): string };
      }>
    >(Prisma.sql`
      SELECT bucket,
             SUM(orders)::int AS orders,
             COALESCE(SUM("grossSales"), 0)::numeric AS "grossSales",
             COALESCE(SUM("canceledSales"), 0)::numeric AS "canceledSales",
             SUM("canceledOrders")::int AS "canceledOrders",
             COALESCE(SUM("refundsAmount"), 0)::numeric AS "refundsAmount"
        FROM (
          SELECT ${orderGrain} AS bucket,
                 COUNT(*)::int AS orders,
                 COALESCE(SUM(o.total_amount), 0)::numeric AS "grossSales",
                 COALESCE(SUM(CASE WHEN o.status::text IN ('CANCELED', 'REFUNDED') OR o.payment_status::text IN ('CANCELED', 'REFUNDED') THEN o.total_amount ELSE 0 END), 0)::numeric AS "canceledSales",
                 COALESCE(SUM(CASE WHEN o.status::text IN ('CANCELED', 'REFUNDED') THEN 1 ELSE 0 END), 0)::int AS "canceledOrders",
                 COALESCE(SUM(o.refunded_amount), 0)::numeric AS "refundsAmount"
            FROM orders o
           WHERE ${this.rawOrderConditions(ctx, period, scope, query)}
           GROUP BY 1
          UNION ALL
          SELECT ${importedGrain} AS bucket,
                 COUNT(*)::int AS orders,
                 COALESCE(SUM(i.total_amount), 0)::numeric AS "grossSales",
                 COALESCE(SUM(CASE WHEN i.sale_status IN ('CANCELED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'FAILED') THEN i.total_amount ELSE 0 END), 0)::numeric AS "canceledSales",
                 COALESCE(SUM(CASE WHEN i.sale_status IN ('CANCELED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'FAILED') THEN 1 ELSE 0 END), 0)::int AS "canceledOrders",
                 COALESCE(SUM(CASE WHEN i.sale_status IN ('REFUNDED', 'PARTIALLY_REFUNDED') THEN i.total_amount ELSE 0 END), 0)::numeric AS "refundsAmount"
            FROM imported_sales i
           WHERE ${this.rawImportedSaleConditions(ctx, period, scope, query)}
           GROUP BY 1
        ) combined
       GROUP BY bucket
       ORDER BY bucket
    `);
    return rows.map((row) => {
      const ordersCount = Number(row.orders ?? 0);
      const grossSales = this.money(row.grossSales);
      const canceledSales = this.money(row.canceledSales);
      const netSales = this.money(Math.max(0, grossSales - canceledSales));
      return {
        date: this.dateKey(row.bucket),
        ordersCount,
        grossSales,
        netSales,
        canceledOrders: Number(row.canceledOrders ?? 0),
        refundsAmount: this.money(row.refundsAmount),
        averageTicket: ordersCount > 0 ? this.money(netSales / ordersCount) : 0,
      };
    });
  }

  private async getAverageTicketForWhere(where: Prisma.OrderWhereInput) {
    const [orders, canceled] = await Promise.all([
      this.prisma.order.aggregate({
        where,
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),
      this.prisma.order.aggregate({
        where: {
          ...where,
          OR: [
            { status: { in: CANCELED_STATUSES } },
            { paymentStatus: { in: [OrderPaymentSummaryStatus.CANCELED, OrderPaymentSummaryStatus.REFUNDED] } },
          ],
        },
        _sum: { totalAmount: true },
      }),
    ]);
    const ordersCount = orders._count._all;
    const grossSales = this.money(orders._sum.totalAmount);
    const netSales = this.money(Math.max(0, grossSales - this.money(canceled._sum.totalAmount)));
    return {
      ordersCount,
      grossSales,
      netSales,
      averageTicket: ordersCount > 0 ? this.money(netSales / ordersCount) : 0,
    };
  }

  private async getAverageTicketCombined(
    ctx: RequestContext,
    period: Period,
    scope: BranchScope,
    query: ReportsOverviewQuery,
    where: Prisma.OrderWhereInput,
  ) {
    const [live, imported] = await Promise.all([
      this.getAverageTicketForWhere(where),
      this.getImportedOverview(ctx, period, scope, query),
    ]);
    const ordersCount = live.ordersCount + imported.totalOrders;
    const grossSales = this.money(live.grossSales + imported.grossRevenue);
    const netSales = this.money(live.netSales + imported.netRevenue);
    return {
      ordersCount,
      grossSales,
      netSales,
      averageTicket: ordersCount > 0 ? this.money(netSales / ordersCount) : 0,
      importedOrders: imported.totalOrders,
    };
  }

  private async getAverageTicketByChannel(where: Prisma.OrderWhereInput) {
    const channels = await this.getChannels(where);
    return channels.map((row) => ({ ...row, averageTicket: row.orders > 0 ? this.money(row.revenue / row.orders) : 0 }));
  }

  private async getAverageTicketByChannelCombined(
    ctx: RequestContext,
    period: Period,
    scope: BranchScope,
    query: ReportsOverviewQuery,
    where: Prisma.OrderWhereInput,
  ) {
    const channels = await this.getCombinedChannels(ctx, period, scope, query, where);
    return channels.map((row) => ({ ...row, averageTicket: row.orders > 0 ? this.money(row.revenue / row.orders) : 0 }));
  }

  private async getAverageTicketByBranch(where: Prisma.OrderWhereInput) {
    const branches = await this.getBranchRanking(where, 20);
    return branches.map((row) => ({ ...row, averageTicket: row.orders > 0 ? this.money(row.revenue / row.orders) : 0 }));
  }

  private async getAverageTicketByBranchCombined(
    ctx: RequestContext,
    period: Period,
    scope: BranchScope,
    query: ReportsOverviewQuery,
    where: Prisma.OrderWhereInput,
  ) {
    const branches = await this.getCombinedBranchRanking(ctx, period, scope, query, where, 20);
    return branches.map((row) => ({ ...row, averageTicket: row.orders > 0 ? this.money(row.revenue / row.orders) : 0 }));
  }

  private async getAverageTicketByOperator(where: Prisma.OrderWhereInput) {
    const operators = await this.getOperatorRanking(where, 20);
    return operators.map((row) => ({ ...row, averageTicket: row.orders > 0 ? this.money(row.revenue / row.orders) : 0 }));
  }

  private async getAverageTicketByWaiter(where: Prisma.OrderWhereInput) {
    const waiters = await this.getWaiterRanking(where, 20);
    return waiters.map((row) => ({ ...row, averageTicket: row.orders > 0 ? this.money(row.revenue / row.orders) : 0 }));
  }

  private async getChannels(where: Prisma.OrderWhereInput) {
    const rows = await this.prisma.order.groupBy({
      by: ['channel'],
      where,
      _count: { _all: true },
      _sum: { totalAmount: true },
      orderBy: { _sum: { totalAmount: 'desc' } },
    });
    const total = rows.reduce((acc, row) => acc + row._count._all, 0);
    return rows.map((row) => ({
      key: row.channel,
      label: this.toLabel(row.channel),
      orders: row._count._all,
      revenue: this.money(row._sum.totalAmount),
      percent: this.share(row._count._all, total),
    }));
  }

  private async getCombinedChannels(
    ctx: RequestContext,
    period: Period,
    scope: BranchScope,
    query: ReportsOverviewQuery,
    where: Prisma.OrderWhereInput,
  ) {
    const [liveRows, importedRows] = await Promise.all([
      this.getChannels(where),
      this.prisma.importedSale.groupBy({
        by: ['channel'],
        where: this.importedSaleWhere(ctx, period, scope, query),
        _count: { _all: true },
        _sum: { totalAmount: true },
        orderBy: { _sum: { totalAmount: 'desc' } },
      }),
    ]);
    return this.mergeOrderBreakdowns([
      ...liveRows.map((row) => ({ key: String(row.key), label: row.label, orders: row.orders, revenue: row.revenue })),
      ...importedRows.map((row) => ({
        key: row.channel,
        label: `${this.toLabel(row.channel)} historico`,
        orders: row._count._all,
        revenue: this.money(row._sum.totalAmount),
      })),
    ]);
  }

  private async getStatuses(where: Prisma.OrderWhereInput) {
    const rows = await this.prisma.order.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
      _sum: { totalAmount: true },
      orderBy: { _count: { status: 'desc' } },
    });
    const total = rows.reduce((acc, row) => acc + row._count._all, 0);
    return rows.map((row) => ({
      key: row.status,
      label: this.toLabel(row.status),
      orders: row._count._all,
      revenue: this.money(row._sum.totalAmount),
      percent: this.share(row._count._all, total),
    }));
  }

  private async getPaymentStatuses(where: Prisma.OrderWhereInput) {
    const rows = await this.prisma.order.groupBy({
      by: ['paymentStatus'],
      where,
      _count: { _all: true },
      _sum: { totalAmount: true },
      orderBy: { _count: { paymentStatus: 'desc' } },
    });
    const total = rows.reduce((acc, row) => acc + row._count._all, 0);
    return rows.map((row) => ({
      key: row.paymentStatus,
      label: this.toLabel(row.paymentStatus),
      orders: row._count._all,
      revenue: this.money(row._sum.totalAmount),
      percent: this.share(row._count._all, total),
    }));
  }

  private async getPaymentMethods(where: Prisma.OrderWhereInput) {
    const rows = await this.prisma.orderPayment.groupBy({
      by: ['paymentMethod'],
      where: { order: where },
      _count: { _all: true },
      _sum: { amount: true, refundedAmount: true },
      orderBy: { _sum: { amount: 'desc' } },
    });
    const total = rows.reduce((acc, row) => acc + row._count._all, 0);
    return rows.map((row) => ({
      key: row.paymentMethod,
      label: this.toLabel(row.paymentMethod),
      payments: row._count._all,
      amount: this.money(row._sum.amount),
      refundedAmount: this.money(row._sum.refundedAmount),
      percent: this.share(row._count._all, total),
    }));
  }

  private async getCombinedPaymentMethods(
    ctx: RequestContext,
    period: Period,
    scope: BranchScope,
    query: ReportsOverviewQuery,
    where: Prisma.OrderWhereInput,
  ) {
    const [liveRows, importedRows] = await Promise.all([
      this.getPaymentMethods(where),
      this.prisma.importedSale.groupBy({
        by: ['paymentMethod'],
        where: this.importedSaleWhere(ctx, period, scope, query),
        _count: { _all: true },
        _sum: { totalAmount: true },
        orderBy: { _sum: { totalAmount: 'desc' } },
      }),
    ]);
    const byKey = new Map<string, { key: string; label: string; payments: number; amount: number; refundedAmount: number }>();
    for (const row of liveRows) {
      byKey.set(String(row.key), {
        key: String(row.key),
        label: row.label,
        payments: row.payments,
        amount: row.amount,
        refundedAmount: row.refundedAmount,
      });
    }
    for (const row of importedRows) {
      const key = row.paymentMethod ?? 'OUTRO';
      const current = byKey.get(key) ?? { key, label: `${this.toLabel(key)} historico`, payments: 0, amount: 0, refundedAmount: 0 };
      current.payments += row._count._all;
      current.amount = this.money(current.amount + this.money(row._sum.totalAmount));
      byKey.set(key, current);
    }
    const items = Array.from(byKey.values()).sort((a, b) => b.amount - a.amount);
    const total = items.reduce((sum, row) => sum + row.payments, 0);
    return items.map((row) => ({ ...row, percent: this.share(row.payments, total) }));
  }

  private async getDeliveryNeighborhoods(
    ctx: RequestContext,
    period: Period,
    scope: BranchScope,
    query: ReportsOverviewQuery,
  ) {
    const rows = await this.prisma.$queryRaw<NeighborhoodRow[]>(Prisma.sql`
      SELECT COALESCE(NULLIF(TRIM(ca.district), ''), 'Sem bairro') AS district,
             COUNT(*)::int AS orders,
             COALESCE(SUM(o.total_amount), 0)::numeric AS revenue,
             COALESCE(SUM(o.delivery_fee), 0)::numeric AS "deliveryFee"
        FROM orders o
        LEFT JOIN customer_addresses ca ON ca.id = o.customer_address_id
       WHERE ${this.rawOrderConditions(ctx, period, scope, query)}
         AND o.order_type::text IN ('DELIVERY', 'WHATSAPP')
       GROUP BY 1
       ORDER BY revenue DESC, orders DESC
       LIMIT 12
    `);
    const totalOrders = rows.reduce((sum, row) => sum + Number(row.orders ?? 0), 0);
    return rows.map((row) => {
      const orders = Number(row.orders ?? 0);
      const revenue = this.money(row.revenue);
      const deliveryFee = this.money(row.deliveryFee);
      return {
        key: row.district ?? 'Sem bairro',
        label: row.district ?? 'Sem bairro',
        orders,
        revenue,
        deliveryFee,
        averageTicket: orders > 0 ? this.money(revenue / orders) : 0,
        averageDeliveryFee: orders > 0 ? this.money(deliveryFee / orders) : 0,
        percent: this.share(orders, totalOrders),
      };
    });
  }

  private async getSalesByDay(ctx: RequestContext, period: Period, scope: BranchScope, query: ReportsOverviewQuery) {
    const rows = await this.prisma.$queryRaw<DailySalesRow[]>(Prisma.sql`
      SELECT day,
             SUM(orders)::int AS orders,
             COALESCE(SUM(revenue), 0)::numeric AS revenue
        FROM (
          SELECT date_trunc('day', o.created_at)::date AS day,
                 COUNT(*)::int AS orders,
                 COALESCE(SUM(o.total_amount), 0)::numeric AS revenue
            FROM orders o
           WHERE ${this.rawOrderConditions(ctx, period, scope, query)}
           GROUP BY 1
          UNION ALL
          SELECT date_trunc('day', i.sale_date)::date AS day,
                 COUNT(*)::int AS orders,
                 COALESCE(SUM(i.total_amount), 0)::numeric AS revenue
            FROM imported_sales i
           WHERE ${this.rawImportedSaleConditions(ctx, period, scope, query)}
           GROUP BY 1
        ) combined
       GROUP BY day
       ORDER BY day
    `);
    return rows.map((row) => {
      const orders = Number(row.orders ?? 0);
      const revenue = this.money(row.revenue);
      return {
        date: this.dateKey(row.day),
        orders,
        revenue,
        averageTicket: orders > 0 ? this.money(revenue / orders) : 0,
      };
    });
  }

  private async getPeakHours(ctx: RequestContext, period: Period, scope: BranchScope, query: ReportsOverviewQuery) {
    const rows = await this.prisma.$queryRaw<PeakHourRow[]>(Prisma.sql`
      SELECT hour,
             SUM(orders)::int AS orders,
             COALESCE(SUM(revenue), 0)::numeric AS revenue
        FROM (
          SELECT EXTRACT(HOUR FROM o.created_at)::int AS hour,
                 COUNT(*)::int AS orders,
                 COALESCE(SUM(o.total_amount), 0)::numeric AS revenue
            FROM orders o
           WHERE ${this.rawOrderConditions(ctx, period, scope, query)}
           GROUP BY 1
          UNION ALL
          SELECT EXTRACT(HOUR FROM i.sale_date)::int AS hour,
                 COUNT(*)::int AS orders,
                 COALESCE(SUM(i.total_amount), 0)::numeric AS revenue
            FROM imported_sales i
           WHERE ${this.rawImportedSaleConditions(ctx, period, scope, query)}
           GROUP BY 1
        ) combined
       GROUP BY hour
       ORDER BY hour
    `);
    return rows.map((row) => {
      const orders = Number(row.orders ?? 0);
      const revenue = this.money(row.revenue);
      return {
        hour: Number(row.hour),
        label: `${String(row.hour).padStart(2, '0')}h`,
        orders,
        revenue,
        averageTicket: orders > 0 ? this.money(revenue / orders) : 0,
      };
    });
  }

  private async getTopProducts(where: Prisma.OrderWhereInput, limit = 10) {
    const rows = await this.prisma.orderItem.findMany({
      where: { order: where },
      select: {
        productId: true,
        productNameSnapshot: true,
        quantity: true,
        totalPrice: true,
        costSnapshot: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });
    const grouped = new Map<string, { productId: string | null; name: string; quantity: number; revenue: number; cogs: number; orders: number }>();
    for (const item of rows) {
      const key = item.productId ?? `snapshot:${item.productNameSnapshot}`;
      const current = grouped.get(key) ?? {
        productId: item.productId ?? null,
        name: item.productNameSnapshot,
        quantity: 0,
        revenue: 0,
        cogs: 0,
        orders: 0,
      };
      const quantity = Number(item.quantity ?? 0);
      current.quantity = this.money(current.quantity + quantity);
      current.revenue = this.money(current.revenue + Number(item.totalPrice ?? 0));
      current.cogs = this.money(current.cogs + quantity * Number(item.costSnapshot ?? 0));
      current.orders += 1;
      grouped.set(key, current);
    }
    return Array.from(grouped.values())
      .sort((left, right) => right.revenue - left.revenue)
      .slice(0, limit)
      .map((row, index) => {
        const grossMargin = this.money(row.revenue - row.cogs);
        return {
          rank: index + 1,
          productId: row.productId,
          name: row.name,
          quantity: row.quantity,
          revenue: row.revenue,
          cogs: row.cogs,
          grossMargin,
          grossMarginPercent: row.revenue > 0 ? this.percent((grossMargin / row.revenue) * 100) : 0,
          cogsStatus: row.cogs > 0 ? 'READY' : 'PARTIAL_DATA',
          orders: row.orders,
        };
      });
  }

  private async getBranchRanking(where: Prisma.OrderWhereInput, limit = 12) {
    const rows = await this.prisma.order.groupBy({
      by: ['branchId'],
      where,
      _count: { _all: true },
      _sum: { totalAmount: true },
      orderBy: { _sum: { totalAmount: 'desc' } },
      take: limit,
    });
    const branches = await this.prisma.branch.findMany({
      where: { id: { in: rows.map((row) => row.branchId) } },
      select: { id: true, name: true, code: true, city: true, state: true },
    });
    const byId = new Map(branches.map((branch) => [branch.id, branch]));
    const total = rows.reduce((acc, row) => acc + row._count._all, 0);
    return rows.map((row) => {
      const branch = byId.get(row.branchId);
      return {
        branchId: row.branchId,
        label: branch?.name ?? branch?.code ?? 'Filial',
        location: [branch?.city, branch?.state].filter(Boolean).join(' - ') || null,
        orders: row._count._all,
        revenue: this.money(row._sum.totalAmount),
        percent: this.share(row._count._all, total),
      };
    });
  }

  private async getCombinedBranchRanking(
    ctx: RequestContext,
    period: Period,
    scope: BranchScope,
    query: ReportsOverviewQuery,
    where: Prisma.OrderWhereInput,
    limit = 12,
  ) {
    const [liveRows, importedRows] = await Promise.all([
      this.getBranchRanking(where, 100),
      this.prisma.importedSale.groupBy({
        by: ['branchId'],
        where: this.importedSaleWhere(ctx, period, scope, query),
        _count: { _all: true },
        _sum: { totalAmount: true },
        orderBy: { _sum: { totalAmount: 'desc' } },
      }),
    ]);
    const branchIds = Array.from(
      new Set([
        ...liveRows.map((row) => row.branchId).filter(Boolean),
        ...importedRows.map((row) => row.branchId).filter(Boolean),
      ]),
    ) as string[];
    const branches = await this.prisma.branch.findMany({
      where: { id: { in: branchIds } },
      select: { id: true, name: true, code: true, city: true, state: true },
    });
    const byId = new Map(branches.map((branch) => [branch.id, branch]));
    const merged = new Map<string, { branchId: string | null; label: string; location: string | null; orders: number; revenue: number }>();

    for (const row of liveRows) {
      const key = row.branchId ?? 'sem-filial';
      merged.set(key, {
        branchId: row.branchId,
        label: row.label,
        location: row.location,
        orders: row.orders,
        revenue: row.revenue,
      });
    }
    for (const row of importedRows) {
      const key = row.branchId ?? 'sem-filial';
      const branch = row.branchId ? byId.get(row.branchId) : null;
      const current =
        merged.get(key) ??
        {
          branchId: row.branchId,
          label: branch?.name ?? branch?.code ?? 'Filial historica',
          location: [branch?.city, branch?.state].filter(Boolean).join(' - ') || null,
          orders: 0,
          revenue: 0,
        };
      current.orders += row._count._all;
      current.revenue = this.money(current.revenue + this.money(row._sum.totalAmount));
      merged.set(key, current);
    }

    const items = Array.from(merged.values()).sort((a, b) => b.revenue - a.revenue).slice(0, limit);
    const total = items.reduce((sum, row) => sum + row.orders, 0);
    return items.map((row) => ({ ...row, percent: this.share(row.orders, total) }));
  }

  private async getOperatorRanking(where: Prisma.OrderWhereInput, limit = 10) {
    const rows = await this.prisma.order.groupBy({
      by: ['createdById'],
      where: { ...where, createdById: { not: null } },
      _count: { _all: true },
      _sum: { totalAmount: true },
      orderBy: { _sum: { totalAmount: 'desc' } },
      take: limit,
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: rows.map((row) => row.createdById).filter(Boolean) as string[] } },
      select: { id: true, name: true, email: true },
    });
    const byId = new Map(users.map((user) => [user.id, user]));
    return rows.map((row, index) => {
      const user = row.createdById ? byId.get(row.createdById) : null;
      return {
        rank: index + 1,
        userId: row.createdById ?? null,
        name: user?.name ?? user?.email ?? 'Operador',
        orders: row._count._all,
        revenue: this.money(row._sum.totalAmount),
      };
    });
  }

  private async getWaiterRanking(where: Prisma.OrderWhereInput, limit = 10) {
    const rows = await this.prisma.order.groupBy({
      by: ['createdById'],
      where: {
        ...where,
        channel: Channel.WAITER_APP,
        createdById: { not: null },
      },
      _count: { _all: true },
      _sum: { totalAmount: true },
      orderBy: { _sum: { totalAmount: 'desc' } },
      take: limit,
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: rows.map((row) => row.createdById).filter(Boolean) as string[] } },
      select: { id: true, name: true, email: true },
    });
    const byId = new Map(users.map((user) => [user.id, user]));
    return rows.map((row, index) => {
      const user = row.createdById ? byId.get(row.createdById) : null;
      const orders = row._count._all;
      const revenue = this.money(row._sum.totalAmount);
      return {
        rank: index + 1,
        waiterUserId: row.createdById ?? null,
        name: user?.name ?? user?.email ?? 'Garcom',
        orders,
        revenue,
        averageTicket: orders > 0 ? this.money(revenue / orders) : 0,
      };
    });
  }

  private async countDelayedOrders(ctx: RequestContext, period: Period, scope: BranchScope): Promise<number> {
    const delayedCutoff = new Date(Date.now() - 30 * 60 * 1000);
    if (delayedCutoff < period.from) return 0;
    return this.prisma.order.count({
      where: {
        companyId: ctx.companyId,
        ...(scope.branchId ? { branchId: scope.branchId } : {}),
        deletedAt: null,
        status: { in: [OrderStatus.DRAFT, OrderStatus.PENDING_CONFIRMATION, OrderStatus.CONFIRMED, OrderStatus.IN_PREPARATION] },
        createdAt: {
          gte: period.from,
          lte: delayedCutoff < period.to ? delayedCutoff : period.to,
        },
      },
    });
  }

  private async getImportedOverview(ctx: RequestContext, period: Period, scope: BranchScope, query: ReportsOverviewQuery) {
    const where = this.importedSaleWhere(ctx, period, scope, query);
    const canceledWhere = this.withImportedStatuses(where, IMPORTED_CANCELED_STATUSES);
    const completedWhere = this.withImportedStatuses(where, IMPORTED_COMPLETED_STATUSES);
    const [all, canceled, completed, paid] = await Promise.all([
      this.prisma.importedSale.aggregate({
        where,
        _count: { _all: true },
        _sum: { totalAmount: true, deliveryFee: true, discountAmount: true },
      }),
      this.prisma.importedSale.aggregate({
        where: canceledWhere,
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),
      this.prisma.importedSale.count({ where: completedWhere }),
      this.prisma.importedSale.aggregate({
        where: completedWhere,
        _sum: { totalAmount: true },
      }),
    ]);
    const grossRevenue = this.money(all._sum.totalAmount);
    const canceledRevenue = this.money(canceled._sum.totalAmount);
    const netRevenue = this.money(Math.max(0, grossRevenue - canceledRevenue));
    return {
      source: 'IMPORTED_HISTORY',
      totalOrders: all._count._all,
      completedOrders: completed,
      canceledOrders: canceled._count._all,
      grossRevenue,
      netRevenue,
      canceledRevenue,
      paidRevenue: this.money(paid._sum.totalAmount),
      deliveryFee: this.money(all._sum.deliveryFee),
      discountAmount: this.money(all._sum.discountAmount),
    };
  }

  private async getFinance(ctx: RequestContext, period: Period, scope: BranchScope) {
    const allowed = hasAnyPermission(ctx, [TENANT_PERMISSIONS.FINANCE_READ, TENANT_PERMISSIONS.FINANCE_MANAGE]);
    if (!allowed) {
      return {
        allowed: false,
        error: null,
        dre: null,
        cashFlow: null,
        reconciliationSummary: null,
        openPayables: null,
        openReceivables: null,
        breakdowns: { categories: [], costCenters: [] },
      };
    }

    try {
      const report = await this.financeService.getReport(ctx, {
        from: period.from.toISOString(),
        to: period.to.toISOString(),
        branchId: scope.branchId,
      });
      return {
        allowed: true,
        error: null,
        dre: report.dre,
        cashFlow: report.cashFlow,
        reconciliationSummary: report.reconciliation.summary,
        openPayables: report.totals.openPayables,
        openReceivables: report.totals.openReceivables,
        breakdowns: report.breakdowns,
      };
    } catch (error) {
      return {
        allowed: true,
        error: error instanceof Error ? error.message : 'Falha ao carregar dados financeiros.',
        dre: null,
        cashFlow: null,
        reconciliationSummary: null,
        openPayables: null,
        openReceivables: null,
        breakdowns: { categories: [], costCenters: [] },
      };
    }
  }

  private resolvePeriod(query: ReportsOverviewQuery): Period {
    const now = new Date();
    const from = query.from
      ? this.parseDate(query.from, 'from', 'start')
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const to = query.to ? this.parseDate(query.to, 'to', 'end') : now;

    if (from > to) {
      throw new BadRequestException('Periodo de relatorio invalido.');
    }
    const days = (to.getTime() - from.getTime()) / 86400000;
    if (days > MAX_RANGE_DAYS) {
      throw new BadRequestException(`Periodo maximo permitido para relatorios e de ${MAX_RANGE_DAYS} dias.`);
    }
    return { from, to };
  }

  private parseDate(value: string, fieldName: string, boundary: 'start' | 'end'): Date {
    const normalized = String(value ?? '').trim();
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(normalized);
    const parsed = dateOnly
      ? new Date(`${normalized}T${boundary === 'start' ? '00:00:00.000' : '23:59:59.999'}Z`)
      : new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} invalido.`);
    }
    return parsed;
  }

  private async resolveBranchScope(ctx: RequestContext, branchId?: string): Promise<BranchScope> {
    const requestedBranchId = branchId?.trim();
    if (ctx.branchId && requestedBranchId && requestedBranchId !== ctx.branchId) {
      throw new BadRequestException('Filial solicitada nao corresponde ao contexto autenticado.');
    }

    const scopedBranchId = requestedBranchId || ctx.branchId;
    if (!scopedBranchId) return {};

    const branch = await this.prisma.branch.findFirst({
      where: { id: scopedBranchId, companyId: ctx.companyId },
      select: { id: true },
    });
    if (!branch) {
      throw new BadRequestException(`Filial '${scopedBranchId}' nao pertence a empresa atual.`);
    }
    return { branchId: scopedBranchId };
  }

  private orderWhere(
    ctx: RequestContext,
    period: Period,
    scope: BranchScope,
    query: ReportsOverviewQuery = {},
  ): Prisma.OrderWhereInput {
    const channel = this.parseEnumValue(Channel, query.channel, 'channel');
    const status = this.parseEnumValue(OrderStatus, query.status, 'status');
    const paymentStatus = this.parseEnumValue(OrderPaymentSummaryStatus, query.paymentStatus, 'paymentStatus');
    const waiterUserId = this.cleanId(query.waiterUserId);
    const operatorUserId = this.cleanId(query.operatorUserId);

    return {
      companyId: ctx.companyId,
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
      ...(channel ? { channel } : {}),
      ...(status ? { status } : {}),
      ...(paymentStatus ? { paymentStatus } : {}),
      ...(operatorUserId ? { createdById: operatorUserId } : {}),
      ...(waiterUserId ? { createdById: waiterUserId, channel: Channel.WAITER_APP } : {}),
      deletedAt: null,
      createdAt: {
        gte: period.from,
        lte: period.to,
      },
    };
  }

  private importedSaleWhere(
    ctx: RequestContext,
    period: Period,
    scope: BranchScope,
    query: ReportsOverviewQuery = {},
  ): Prisma.ImportedSaleWhereInput {
    const operatorUserId = this.cleanId(query.operatorUserId);
    const waiterUserId = this.cleanId(query.waiterUserId);
    if (operatorUserId || waiterUserId) {
      return { id: '__no_imported_history_match__' };
    }

    const channel = this.mapImportedChannel(query.channel);
    const statuses = this.resolveImportedStatuses(query);
    if (channel === null || statuses === null) {
      return { id: '__no_imported_history_match__' };
    }

    return {
      companyId: ctx.companyId,
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
      ...(channel ? { channel } : {}),
      ...(statuses ? { saleStatus: { in: statuses } } : {}),
      saleDate: {
        gte: period.from,
        lte: period.to,
      },
    };
  }

  private rawOrderConditions(
    ctx: RequestContext,
    period: Period,
    scope: BranchScope,
    query: ReportsOverviewQuery = {},
    soldOnly = false,
  ): Prisma.Sql {
    const filters: Prisma.Sql[] = [
      Prisma.sql`o.company_id = ${ctx.companyId}`,
      Prisma.sql`o.deleted_at IS NULL`,
      Prisma.sql`o.created_at >= ${period.from}`,
      Prisma.sql`o.created_at <= ${period.to}`,
    ];
    const channel = this.parseEnumValue(Channel, query.channel, 'channel');
    const status = this.parseEnumValue(OrderStatus, query.status, 'status');
    const paymentStatus = this.parseEnumValue(OrderPaymentSummaryStatus, query.paymentStatus, 'paymentStatus');
    const operatorUserId = this.cleanId(query.operatorUserId);
    const waiterUserId = this.cleanId(query.waiterUserId);

    if (scope.branchId) filters.push(Prisma.sql`o.branch_id = ${scope.branchId}`);
    if (channel) filters.push(Prisma.sql`o.channel::text = ${channel}`);
    if (status) filters.push(Prisma.sql`o.status::text = ${status}`);
    if (paymentStatus) filters.push(Prisma.sql`o.payment_status::text = ${paymentStatus}`);
    if (operatorUserId) filters.push(Prisma.sql`o.created_by_id = ${operatorUserId}`);
    if (waiterUserId) {
      filters.push(Prisma.sql`o.created_by_id = ${waiterUserId}`);
      filters.push(Prisma.sql`o.channel::text = 'WAITER_APP'`);
    }
    if (soldOnly) filters.push(Prisma.sql`o.status::text NOT IN ('CANCELED', 'REFUNDED')`);
    return Prisma.join(filters, ' AND ');
  }

  private rawImportedSaleConditions(
    ctx: RequestContext,
    period: Period,
    scope: BranchScope,
    query: ReportsOverviewQuery = {},
  ): Prisma.Sql {
    const operatorUserId = this.cleanId(query.operatorUserId);
    const waiterUserId = this.cleanId(query.waiterUserId);
    const channel = this.mapImportedChannel(query.channel);
    const statuses = this.resolveImportedStatuses(query);
    if (operatorUserId || waiterUserId || channel === null || statuses === null) {
      return Prisma.sql`1 = 0`;
    }

    const filters: Prisma.Sql[] = [
      Prisma.sql`i.company_id = ${ctx.companyId}`,
      Prisma.sql`i.sale_date >= ${period.from}`,
      Prisma.sql`i.sale_date <= ${period.to}`,
    ];
    if (scope.branchId) filters.push(Prisma.sql`i.branch_id = ${scope.branchId}`);
    if (channel) filters.push(Prisma.sql`i.channel = ${channel}`);
    if (statuses?.length) filters.push(Prisma.sql`i.sale_status IN (${Prisma.join(statuses)})`);
    return Prisma.join(filters, ' AND ');
  }

  private withImportedStatuses(where: Prisma.ImportedSaleWhereInput, statuses: string[]): Prisma.ImportedSaleWhereInput {
    const current = where.saleStatus as { in?: string[] } | string | undefined;
    const currentStatuses = typeof current === 'string' ? [current] : current?.in;
    const nextStatuses = currentStatuses ? statuses.filter((status) => currentStatuses.includes(status)) : statuses;
    if (!nextStatuses.length) {
      return { id: '__no_imported_history_match__' };
    }
    return { ...where, saleStatus: { in: nextStatuses } };
  }

  private resolveImportedStatuses(query: ReportsOverviewQuery): string[] | undefined | null {
    const status = String(query.status ?? '').trim().toUpperCase();
    const paymentStatus = String(query.paymentStatus ?? '').trim().toUpperCase();
    let statuses: string[] | undefined | null;

    if (status) {
      statuses =
        status === 'DELIVERED' || status === 'FINALIZED'
          ? ['COMPLETED']
          : status === 'CANCELED'
            ? ['CANCELED', 'FAILED']
            : status === 'REFUNDED'
              ? ['REFUNDED', 'PARTIALLY_REFUNDED']
              : null;
    }

    if (paymentStatus) {
      const paymentStatuses =
        paymentStatus === 'PAID' || paymentStatus === 'PARTIALLY_PAID'
          ? ['COMPLETED']
          : paymentStatus === 'REFUNDED' || paymentStatus === 'PARTIALLY_REFUNDED'
            ? ['REFUNDED', 'PARTIALLY_REFUNDED']
            : paymentStatus === 'CANCELED'
              ? ['CANCELED', 'FAILED']
              : undefined;
      if (paymentStatuses) {
        statuses = statuses ? statuses.filter((value) => paymentStatuses.includes(value)) : paymentStatuses;
      }
    }

    if (statuses === null || statuses?.length === 0) return null;
    return statuses;
  }

  private mapImportedChannel(value?: string): string | undefined | null {
    const channel = String(value ?? '').trim().toUpperCase();
    if (!channel) return undefined;
    const mapped: Record<string, string> = {
      WEB: 'DELIVERY',
      CUSTOMER_APP: 'DELIVERY',
      MARKETPLACE: 'DELIVERY',
      DELIVERY: 'DELIVERY',
      PDV: 'PDV',
      KIOSK: 'KIOSK',
      WAITER_APP: 'WAITER_APP',
      QR: 'TABLE',
      ADMIN: 'ADMIN',
    };
    return mapped[channel] ?? null;
  }

  private mapPeriod(period: Period) {
    return {
      from: period.from.toISOString(),
      to: period.to.toISOString(),
      maxDays: MAX_RANGE_DAYS,
    };
  }

  private mapScope(ctx: RequestContext, scope: BranchScope) {
    return {
      companyId: ctx.companyId,
      branchId: scope.branchId ?? null,
    };
  }

  private mergeOrderBreakdowns(rows: Array<{ key: string; label: string; orders: number; revenue: number }>) {
    const byKey = new Map<string, { key: string; label: string; orders: number; revenue: number }>();
    for (const row of rows) {
      const current = byKey.get(row.key) ?? { key: row.key, label: row.label, orders: 0, revenue: 0 };
      current.orders += Number(row.orders ?? 0);
      current.revenue = this.money(current.revenue + Number(row.revenue ?? 0));
      byKey.set(row.key, current);
    }
    const items = Array.from(byKey.values()).sort((a, b) => b.revenue - a.revenue);
    const total = items.reduce((sum, row) => sum + row.orders, 0);
    return items.map((row) => ({ ...row, percent: this.share(row.orders, total) }));
  }

  private resolveLimit(value?: string, fallback = 10): number {
    return Math.min(50, Math.max(1, Number(value ?? fallback) || fallback));
  }

  private cleanId(value?: string): string | undefined {
    const normalized = String(value ?? '').trim();
    return normalized || undefined;
  }

  private parseEnumValue<T extends Record<string, string>>(
    enumObject: T,
    value: string | undefined,
    fieldName: string,
  ): T[keyof T] | undefined {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (!normalized) return undefined;
    const allowed = Object.values(enumObject);
    if (!allowed.includes(normalized)) {
      throw new BadRequestException(`${fieldName} invalido.`);
    }
    return normalized as T[keyof T];
  }

  private dateKey(value: Date | string): string {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
  }

  private toLabel(value: string): string {
    const labels: Record<string, string> = {
      WEB: 'Delivery online',
      PDV: 'PDV',
      WAITER_APP: 'App garcom',
      KIOSK: 'Totem',
      QR: 'QR mesa',
      PENDING_CONFIRMATION: 'Aguardando confirmacao',
      IN_PREPARATION: 'Em preparo',
      WAITING_PICKUP: 'Aguardando retirada',
      WAITING_DISPATCH: 'Aguardando entrega',
      OUT_FOR_DELIVERY: 'Saiu para entrega',
      PARTIALLY_PAID: 'Parcialmente pago',
      PARTIALLY_REFUNDED: 'Parcialmente estornado',
      PAY_ON_DELIVERY: 'Pagar na entrega',
    };
    if (labels[value]) return labels[value];
    return value
      .toLowerCase()
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private share(value: number, total: number): number {
    return total > 0 ? this.percent((value / total) * 100) : 0;
  }

  private percent(value: number): number {
    return Number(Number(value || 0).toFixed(1));
  }

  private money(value: unknown): number {
    return Number(Number(value ?? 0).toFixed(2));
  }
}
