import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentContext } from '../common/current-context.decorator';
import type { RequestContext } from '../common/request-context';
import { Public } from '../common/public.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { RequireAdminGuard } from '../common/require-admin.guard';
import { TENANT_PERMISSIONS } from '../common/rbac';
import { ModuleAccess } from '../modules/module-access.decorator';
import { ModuleGuard } from '../modules/module.guard';
import { PaymentsService } from './payments.service';

@Controller('v2/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('webhook/:provider')
  @Public()
  // Public route controlled by provider payload/idempotency; signature validation comes in provider integration phase.
  webhook(
    @Param('provider') provider: string,
    @Body() payload: unknown,
  ) {
    return this.paymentsService.handleWebhook(provider, payload);
  }

  @Get('reconciliation/mock')
  @UseGuards(RequireAdminGuard, ModuleGuard)
  @ModuleAccess('payments')
  @RequirePermissions(TENANT_PERMISSIONS.FINANCE_READ, TENANT_PERMISSIONS.FINANCE_MANAGE)
  mockReconciliation(
    @CurrentContext() ctx: RequestContext,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('limit') limit?: string,
  ) {
    return this.paymentsService.getMockReconciliation(ctx, {
      dateFrom,
      dateTo,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':providerPaymentId/status')
  @Public()
  // Public checkout polling route. Response must remain sanitized and scoped by providerPaymentId validation.
  paymentStatus(
    @Param('providerPaymentId') providerPaymentId: string,
    @CurrentContext() ctx: RequestContext,
  ) {
    return this.paymentsService.getPaymentStatusByProviderPaymentId(providerPaymentId, ctx);
  }
}
