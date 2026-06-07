import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentContext } from '../common/current-context.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { RequireAdminGuard } from '../common/require-admin.guard';
import { TENANT_PERMISSIONS } from '../common/rbac';
import type { RequestContext } from '../common/request-context';
import { ReportsService, type ReportsOverviewQuery } from './reports.service';

@Controller('v2/admin/reports')
@UseGuards(RequireAdminGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('overview')
  @RequirePermissions(
    TENANT_PERMISSIONS.ORDERS_READ,
    TENANT_PERMISSIONS.ORDERS_MANAGE,
    TENANT_PERMISSIONS.FINANCE_READ,
    TENANT_PERMISSIONS.FINANCE_MANAGE,
  )
  overview(@CurrentContext() ctx: RequestContext, @Query() query: ReportsOverviewQuery) {
    return this.reportsService.getOverview(ctx, query);
  }

  @Get('dashboard')
  @RequirePermissions(
    TENANT_PERMISSIONS.ORDERS_READ,
    TENANT_PERMISSIONS.ORDERS_MANAGE,
    TENANT_PERMISSIONS.FINANCE_READ,
    TENANT_PERMISSIONS.FINANCE_MANAGE,
  )
  dashboard(@CurrentContext() ctx: RequestContext, @Query() query: ReportsOverviewQuery) {
    return this.reportsService.getDashboard(ctx, query);
  }

  @Get('premium')
  @RequirePermissions(
    TENANT_PERMISSIONS.REPORTS_READ,
    TENANT_PERMISSIONS.REPORTS_BI,
    TENANT_PERMISSIONS.REPORTS_FINANCE,
    TENANT_PERMISSIONS.REPORTS_INVENTORY,
    TENANT_PERMISSIONS.REPORTS_SALES,
  )
  premium(@CurrentContext() ctx: RequestContext, @Query() query: ReportsOverviewQuery) {
    return this.reportsService.getPremium(ctx, query);
  }

  @Get('operational')
  @RequirePermissions(TENANT_PERMISSIONS.ORDERS_READ, TENANT_PERMISSIONS.ORDERS_MANAGE)
  operational(@CurrentContext() ctx: RequestContext, @Query() query: ReportsOverviewQuery) {
    return this.reportsService.getOperational(ctx, query);
  }

  @Get('sales-by-period')
  @RequirePermissions(TENANT_PERMISSIONS.ORDERS_READ, TENANT_PERMISSIONS.ORDERS_MANAGE)
  salesByPeriod(@CurrentContext() ctx: RequestContext, @Query() query: ReportsOverviewQuery) {
    return this.reportsService.getSalesByPeriod(ctx, query);
  }

  @Get('sales-by-channel')
  @RequirePermissions(TENANT_PERMISSIONS.ORDERS_READ, TENANT_PERMISSIONS.ORDERS_MANAGE)
  salesByChannel(@CurrentContext() ctx: RequestContext, @Query() query: ReportsOverviewQuery) {
    return this.reportsService.getSalesByChannel(ctx, query);
  }

  @Get('top-products')
  @RequirePermissions(TENANT_PERMISSIONS.ORDERS_READ, TENANT_PERMISSIONS.ORDERS_MANAGE)
  topProducts(@CurrentContext() ctx: RequestContext, @Query() query: ReportsOverviewQuery) {
    return this.reportsService.getTopProductsReport(ctx, query);
  }

  @Get('average-ticket')
  @RequirePermissions(TENANT_PERMISSIONS.ORDERS_READ, TENANT_PERMISSIONS.ORDERS_MANAGE)
  averageTicket(@CurrentContext() ctx: RequestContext, @Query() query: ReportsOverviewQuery) {
    return this.reportsService.getAverageTicket(ctx, query);
  }

  @Get('peak-hours')
  @RequirePermissions(TENANT_PERMISSIONS.ORDERS_READ, TENANT_PERMISSIONS.ORDERS_MANAGE)
  peakHours(@CurrentContext() ctx: RequestContext, @Query() query: ReportsOverviewQuery) {
    return this.reportsService.getPeakHoursReport(ctx, query);
  }

  @Get('inventory')
  @RequirePermissions(TENANT_PERMISSIONS.INVENTORY_READ, TENANT_PERMISSIONS.INVENTORY_MANAGE)
  inventory(@CurrentContext() ctx: RequestContext, @Query() query: ReportsOverviewQuery) {
    return this.reportsService.getInventory(ctx, query);
  }

  @Get('abc-stock-items')
  @RequirePermissions(TENANT_PERMISSIONS.REPORTS_INVENTORY, TENANT_PERMISSIONS.INVENTORY_REPORTS, TENANT_PERMISSIONS.INVENTORY_READ)
  abcStockItems(@CurrentContext() ctx: RequestContext, @Query() query: ReportsOverviewQuery) {
    return this.reportsService.getAbcStockItems(ctx, query);
  }

  @Get('abc-products')
  @RequirePermissions(TENANT_PERMISSIONS.REPORTS_SALES, TENANT_PERMISSIONS.REPORTS_BI, TENANT_PERMISSIONS.ORDERS_READ)
  abcProducts(@CurrentContext() ctx: RequestContext, @Query() query: ReportsOverviewQuery) {
    return this.reportsService.getAbcProducts(ctx, query);
  }

  @Get('cmv')
  @RequirePermissions(TENANT_PERMISSIONS.COST_READ, TENANT_PERMISSIONS.FINANCE_READ, TENANT_PERMISSIONS.INVENTORY_READ)
  cmv(@CurrentContext() ctx: RequestContext, @Query() query: ReportsOverviewQuery) {
    return this.reportsService.getCmv(ctx, query);
  }

  @Get('financial')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCE_READ, TENANT_PERMISSIONS.FINANCE_MANAGE)
  financial(@CurrentContext() ctx: RequestContext, @Query() query: ReportsOverviewQuery) {
    return this.reportsService.getFinancial(ctx, query);
  }

  @Get('by-branch')
  @RequirePermissions(TENANT_PERMISSIONS.ORDERS_READ, TENANT_PERMISSIONS.ORDERS_MANAGE)
  byBranch(@CurrentContext() ctx: RequestContext, @Query() query: ReportsOverviewQuery) {
    return this.reportsService.getByBranch(ctx, query);
  }

  @Get('by-operator')
  @RequirePermissions(TENANT_PERMISSIONS.ORDERS_READ, TENANT_PERMISSIONS.ORDERS_MANAGE)
  byOperator(@CurrentContext() ctx: RequestContext, @Query() query: ReportsOverviewQuery) {
    return this.reportsService.getByOperator(ctx, query);
  }

  @Get('by-waiter')
  @RequirePermissions(TENANT_PERMISSIONS.ORDERS_READ, TENANT_PERMISSIONS.ORDERS_MANAGE)
  byWaiter(@CurrentContext() ctx: RequestContext, @Query() query: ReportsOverviewQuery) {
    return this.reportsService.getByWaiter(ctx, query);
  }

  @Get('waiters/:waiterUserId')
  @RequirePermissions(TENANT_PERMISSIONS.ORDERS_READ, TENANT_PERMISSIONS.ORDERS_MANAGE)
  waiterDetail(
    @CurrentContext() ctx: RequestContext,
    @Param('waiterUserId') waiterUserId: string,
    @Query() query: ReportsOverviewQuery,
  ) {
    return this.reportsService.getWaiterDetail(ctx, waiterUserId, query);
  }
}
