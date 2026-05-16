import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentContext } from '../common/current-context.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { RequireAdminGuard } from '../common/require-admin.guard';
import { TENANT_PERMISSIONS } from '../common/rbac';
import type { RequestContext } from '../common/request-context';
import { ModuleAccess } from '../modules/module-access.decorator';
import { ModuleGuard } from '../modules/module.guard';
import {
  FinanceService,
  type AccountPatchInput,
  type AccountSettlementInput,
  type CostCenterInput,
  type FinanceCategoryInput,
  type FinancialAccountInput,
  type FinanceQuery,
  type LedgerCancelInput,
  type ManualAccountInput,
  type ManualLedgerInput,
  type ReconciliationActionInput,
} from './finance.service';

@Controller('v2/admin/finance')
@UseGuards(RequireAdminGuard, ModuleGuard)
@ModuleAccess('financial')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('overview')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCE_READ, TENANT_PERMISSIONS.FINANCE_MANAGE)
  overview(@CurrentContext() ctx: RequestContext, @Query() query: FinanceQuery) {
    return this.financeService.getOverview(ctx, query);
  }

  @Get('report')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCE_READ, TENANT_PERMISSIONS.FINANCE_MANAGE)
  report(@CurrentContext() ctx: RequestContext, @Query() query: FinanceQuery) {
    return this.financeService.getReport(ctx, query);
  }

  @Post('snapshots')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCE_REPORTS, TENANT_PERMISSIONS.FINANCE_MANAGE)
  snapshots(@CurrentContext() ctx: RequestContext, @Query() query: FinanceQuery) {
    return this.financeService.createSnapshots(ctx, query);
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

  @Get('cmv')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCE_READ, TENANT_PERMISSIONS.FINANCE_MANAGE)
  cmv(@CurrentContext() ctx: RequestContext, @Query() query: FinanceQuery) {
    return this.financeService.getCmv(ctx, query);
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
  @RequirePermissions(TENANT_PERMISSIONS.FINANCE_READ, TENANT_PERMISSIONS.FINANCIAL_CATEGORIES_MANAGE)
  categories(@CurrentContext() ctx: RequestContext, @Query() query: FinanceQuery) {
    return this.financeService.listCategories(ctx, query);
  }

  @Post('categories')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCIAL_CATEGORIES_MANAGE, TENANT_PERMISSIONS.FINANCE_MANAGE)
  createCategory(@CurrentContext() ctx: RequestContext, @Body() body: FinanceCategoryInput) {
    return this.financeService.createCategory(ctx, body);
  }

  @Patch('categories/:id')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCIAL_CATEGORIES_MANAGE, TENANT_PERMISSIONS.FINANCE_MANAGE)
  updateCategory(@CurrentContext() ctx: RequestContext, @Param('id') id: string, @Body() body: FinanceCategoryInput) {
    return this.financeService.updateCategory(ctx, id, body);
  }

  @Patch('categories/:id/status')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCIAL_CATEGORIES_MANAGE, TENANT_PERMISSIONS.FINANCE_MANAGE)
  updateCategoryStatus(@CurrentContext() ctx: RequestContext, @Param('id') id: string, @Body() body: { status?: string }) {
    return this.financeService.updateCategoryStatus(ctx, id, body);
  }

  @Get('cost-centers')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCE_READ, TENANT_PERMISSIONS.COST_CENTERS_MANAGE)
  costCenters(@CurrentContext() ctx: RequestContext, @Query() query: FinanceQuery) {
    return this.financeService.listCostCenters(ctx, query);
  }

  @Post('cost-centers')
  @RequirePermissions(TENANT_PERMISSIONS.COST_CENTERS_MANAGE, TENANT_PERMISSIONS.FINANCE_MANAGE)
  createCostCenter(@CurrentContext() ctx: RequestContext, @Body() body: CostCenterInput) {
    return this.financeService.createCostCenter(ctx, body);
  }

  @Patch('cost-centers/:id')
  @RequirePermissions(TENANT_PERMISSIONS.COST_CENTERS_MANAGE, TENANT_PERMISSIONS.FINANCE_MANAGE)
  updateCostCenter(@CurrentContext() ctx: RequestContext, @Param('id') id: string, @Body() body: CostCenterInput) {
    return this.financeService.updateCostCenter(ctx, id, body);
  }

  @Get('financial-accounts')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCE_READ, TENANT_PERMISSIONS.FINANCE_MANAGE)
  financialAccounts(@CurrentContext() ctx: RequestContext, @Query() query: FinanceQuery) {
    return this.financeService.listFinancialAccounts(ctx, query);
  }

  @Post('financial-accounts')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCE_MANAGE)
  createFinancialAccount(@CurrentContext() ctx: RequestContext, @Body() body: FinancialAccountInput) {
    return this.financeService.createFinancialAccount(ctx, body);
  }

  @Patch('financial-accounts/:id')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCE_MANAGE)
  updateFinancialAccount(@CurrentContext() ctx: RequestContext, @Param('id') id: string, @Body() body: FinancialAccountInput) {
    return this.financeService.updateFinancialAccount(ctx, id, body);
  }

  @Get('payment-fees')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCE_READ, TENANT_PERMISSIONS.FINANCE_MANAGE)
  paymentFees(@CurrentContext() ctx: RequestContext, @Query() query: FinanceQuery) {
    return this.financeService.listPaymentFees(ctx, query);
  }

  @Get('receivable-schedules')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCE_READ, TENANT_PERMISSIONS.FINANCE_MANAGE)
  receivableSchedules(@CurrentContext() ctx: RequestContext, @Query() query: FinanceQuery) {
    return this.financeService.listReceivableSchedules(ctx, query);
  }

  @Post('ledger/manual')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCE_MANAGE)
  createManualLedger(@CurrentContext() ctx: RequestContext, @Body() body: ManualLedgerInput) {
    return this.financeService.createManualLedgerEntry(ctx, body);
  }

  @Patch('ledger/:id/cancel')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCE_MANAGE)
  cancelLedger(@CurrentContext() ctx: RequestContext, @Param('id') id: string, @Body() body: LedgerCancelInput) {
    return this.financeService.cancelLedgerEntry(ctx, id, body);
  }

  @Post('payables/manual')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCE_MANAGE)
  createManualPayable(@CurrentContext() ctx: RequestContext, @Body() body: ManualAccountInput) {
    return this.financeService.createManualPayable(ctx, body);
  }

  @Patch('payables/:id')
  @RequirePermissions(TENANT_PERMISSIONS.ACCOUNTS_PAYABLE_MANAGE, TENANT_PERMISSIONS.FINANCE_MANAGE)
  updatePayable(@CurrentContext() ctx: RequestContext, @Param('id') id: string, @Body() body: AccountPatchInput) {
    return this.financeService.updatePayable(ctx, id, body);
  }

  @Post('receivables/manual')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCE_MANAGE)
  createManualReceivable(@CurrentContext() ctx: RequestContext, @Body() body: ManualAccountInput) {
    return this.financeService.createManualReceivable(ctx, body);
  }

  @Patch('receivables/:id')
  @RequirePermissions(TENANT_PERMISSIONS.ACCOUNTS_RECEIVABLE_MANAGE, TENANT_PERMISSIONS.FINANCE_MANAGE)
  updateReceivable(@CurrentContext() ctx: RequestContext, @Param('id') id: string, @Body() body: AccountPatchInput) {
    return this.financeService.updateReceivable(ctx, id, body);
  }

  @Post('payables/:id/settle')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCE_MANAGE)
  settlePayable(@CurrentContext() ctx: RequestContext, @Param('id') id: string, @Body() body: AccountSettlementInput) {
    return this.financeService.settlePayable(ctx, id, body);
  }

  @Post('payables/:id/pay')
  @RequirePermissions(TENANT_PERMISSIONS.ACCOUNTS_PAYABLE_MANAGE, TENANT_PERMISSIONS.FINANCE_MANAGE)
  payPayable(@CurrentContext() ctx: RequestContext, @Param('id') id: string, @Body() body: AccountSettlementInput) {
    return this.financeService.settlePayable(ctx, id, body);
  }

  @Post('payables/:id/cancel')
  @RequirePermissions(TENANT_PERMISSIONS.ACCOUNTS_PAYABLE_MANAGE, TENANT_PERMISSIONS.FINANCE_MANAGE)
  cancelPayable(@CurrentContext() ctx: RequestContext, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.financeService.cancelPayable(ctx, id, body);
  }

  @Post('receivables/:id/settle')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCE_MANAGE)
  settleReceivable(@CurrentContext() ctx: RequestContext, @Param('id') id: string, @Body() body: AccountSettlementInput) {
    return this.financeService.settleReceivable(ctx, id, body);
  }

  @Post('receivables/:id/receive')
  @RequirePermissions(TENANT_PERMISSIONS.ACCOUNTS_RECEIVABLE_MANAGE, TENANT_PERMISSIONS.FINANCE_MANAGE)
  receiveReceivable(@CurrentContext() ctx: RequestContext, @Param('id') id: string, @Body() body: AccountSettlementInput) {
    return this.financeService.settleReceivable(ctx, id, body);
  }

  @Post('receivables/:id/cancel')
  @RequirePermissions(TENANT_PERMISSIONS.ACCOUNTS_RECEIVABLE_MANAGE, TENANT_PERMISSIONS.FINANCE_MANAGE)
  cancelReceivable(@CurrentContext() ctx: RequestContext, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.financeService.cancelReceivable(ctx, id, body);
  }

  @Post('reconciliation/:id/confirm')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCE_RECONCILE, TENANT_PERMISSIONS.FINANCE_MANAGE)
  confirmReconciliation(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.financeService.confirmReconciliationItem(ctx, id);
  }

  @Post('reconciliation/:id/ignore')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCE_RECONCILE, TENANT_PERMISSIONS.FINANCE_MANAGE)
  ignoreReconciliation(@CurrentContext() ctx: RequestContext, @Param('id') id: string, @Body() body: ReconciliationActionInput) {
    return this.financeService.ignoreReconciliationItem(ctx, id, body);
  }
}
