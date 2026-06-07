import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { CurrentContext } from '../common/current-context.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { RequireAdminGuard } from '../common/require-admin.guard';
import { TENANT_PERMISSIONS } from '../common/rbac';
import type { RequestContext } from '../common/request-context';
import { CrmService } from './crm.service';

@Controller('v2/crm')
@UseGuards(RequireAdminGuard)
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  @Get('customers')
  @RequirePermissions(TENANT_PERMISSIONS.CRM_READ, TENANT_PERMISSIONS.CRM_MANAGE)
  listCustomers(@CurrentContext() ctx: RequestContext, @Query() query: { search?: string; limit?: string }) {
    return this.crmService.listCustomers(ctx, query);
  }

  @Get('customers/:customerId/history')
  @RequirePermissions(TENANT_PERMISSIONS.CRM_READ, TENANT_PERMISSIONS.CRM_MANAGE)
  customerHistory(@CurrentContext() ctx: RequestContext, @Param('customerId') customerId: string) {
    return this.crmService.getCustomerHistory(ctx, customerId);
  }

  @Get('loyalty/:customerId')
  @RequirePermissions(TENANT_PERMISSIONS.CRM_READ, TENANT_PERMISSIONS.CRM_MANAGE)
  loyalty(@CurrentContext() ctx: RequestContext, @Param('customerId') customerId: string) {
    return this.crmService.getLoyalty(ctx, customerId);
  }

  @Patch('loyalty/:customerId')
  @RequirePermissions(TENANT_PERMISSIONS.CRM_MANAGE)
  adjustLoyalty(
    @CurrentContext() ctx: RequestContext,
    @Param('customerId') customerId: string,
    @Body() body: { points?: number; reason?: string },
  ) {
    return this.crmService.adjustLoyalty(ctx, customerId, body);
  }
}
