import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentContext } from '../common/current-context.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { RequireAdminGuard } from '../common/require-admin.guard';
import { TENANT_PERMISSIONS } from '../common/rbac';
import type { RequestContext } from '../common/request-context';
import {
  FinanceService,
  type AccountSettlementInput,
  type FinanceQuery,
  type ManualAccountInput,
  type ManualLedgerInput,
} from './finance.service';

@Controller('v2/admin/finance')
@UseGuards(RequireAdminGuard)
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('overview')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCE_READ, TENANT_PERMISSIONS.FINANCE_MANAGE)
  overview(@CurrentContext() ctx: RequestContext, @Query() query: FinanceQuery) {
    return this.financeService.getOverview(ctx, query);
  }

  @Get('cash-flow')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCE_READ, TENANT_PERMISSIONS.FINANCE_MANAGE)
  cashFlow(@CurrentContext() ctx: RequestContext, @Query() query: FinanceQuery) {
    return this.financeService.getCashFlow(ctx, query);
  }

  @Get('dre')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCE_READ, TENANT_PERMISSIONS.FINANCE_MANAGE)
  dre(@CurrentContext() ctx: RequestContext, @Query() query: FinanceQuery) {
    return this.financeService.getDre(ctx, query);
  }

  @Get('reconciliation')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCE_READ, TENANT_PERMISSIONS.FINANCE_MANAGE)
  reconciliation(@CurrentContext() ctx: RequestContext, @Query() query: FinanceQuery) {
    return this.financeService.getReconciliation(ctx, query);
  }

  @Get('payables')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCE_READ, TENANT_PERMISSIONS.FINANCE_MANAGE)
  payables(@CurrentContext() ctx: RequestContext, @Query() query: FinanceQuery) {
    return this.financeService.listPayables(ctx, query);
  }

  @Get('receivables')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCE_READ, TENANT_PERMISSIONS.FINANCE_MANAGE)
  receivables(@CurrentContext() ctx: RequestContext, @Query() query: FinanceQuery) {
    return this.financeService.listReceivables(ctx, query);
  }

  @Get('ledger')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCE_READ, TENANT_PERMISSIONS.FINANCE_MANAGE)
  ledger(@CurrentContext() ctx: RequestContext, @Query() query: FinanceQuery) {
    return this.financeService.listLedger(ctx, query);
  }

  @Get('categories')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCE_READ, TENANT_PERMISSIONS.FINANCE_MANAGE)
  categories(@CurrentContext() ctx: RequestContext, @Query() query: FinanceQuery) {
    return this.financeService.listCategories(ctx, query);
  }

  @Get('cost-centers')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCE_READ, TENANT_PERMISSIONS.FINANCE_MANAGE)
  costCenters(@CurrentContext() ctx: RequestContext, @Query() query: FinanceQuery) {
    return this.financeService.listCostCenters(ctx, query);
  }

  @Post('ledger/manual')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCE_MANAGE)
  createManualLedger(@CurrentContext() ctx: RequestContext, @Body() body: ManualLedgerInput) {
    return this.financeService.createManualLedgerEntry(ctx, body);
  }

  @Post('payables/manual')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCE_MANAGE)
  createManualPayable(@CurrentContext() ctx: RequestContext, @Body() body: ManualAccountInput) {
    return this.financeService.createManualPayable(ctx, body);
  }

  @Post('receivables/manual')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCE_MANAGE)
  createManualReceivable(@CurrentContext() ctx: RequestContext, @Body() body: ManualAccountInput) {
    return this.financeService.createManualReceivable(ctx, body);
  }

  @Post('payables/:id/settle')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCE_MANAGE)
  settlePayable(@CurrentContext() ctx: RequestContext, @Param('id') id: string, @Body() body: AccountSettlementInput) {
    return this.financeService.settlePayable(ctx, id, body);
  }

  @Post('receivables/:id/settle')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCE_MANAGE)
  settleReceivable(@CurrentContext() ctx: RequestContext, @Param('id') id: string, @Body() body: AccountSettlementInput) {
    return this.financeService.settleReceivable(ctx, id, body);
  }
}
