import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentContext } from '../common/current-context.decorator';
import type { RequestContext } from '../common/request-context';
import { RequireAdminGuard } from '../common/require-admin.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import { TENANT_PERMISSIONS } from '../common/rbac';
import { BillingService } from './billing.service';

@Controller('v2/billing')
@UseGuards(RequireAdminGuard)
export class AdminBillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('current')
  @RequirePermissions(TENANT_PERMISSIONS.BILLING_READ, TENANT_PERMISSIONS.BILLING_MANAGE)
  getCurrent(@CurrentContext() ctx: RequestContext) {
    return this.billingService.getCurrentBillingOverview(ctx.companyId);
  }
}
