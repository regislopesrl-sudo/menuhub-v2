import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentContext } from '../common/current-context.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { RequireAdminGuard } from '../common/require-admin.guard';
import { TENANT_PERMISSIONS } from '../common/rbac';
import type { RequestContext } from '../common/request-context';
import { PromotionsService } from './promotions.service';

@Controller('v2/promotions')
@UseGuards(RequireAdminGuard)
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Get()
  @RequirePermissions(TENANT_PERMISSIONS.PROMOTIONS_READ, TENANT_PERMISSIONS.PROMOTIONS_MANAGE)
  list(@CurrentContext() ctx: RequestContext) {
    return this.promotionsService.list(ctx);
  }

  @Post()
  @RequirePermissions(TENANT_PERMISSIONS.PROMOTIONS_MANAGE)
  create(@CurrentContext() ctx: RequestContext, @Body() body: Record<string, unknown>) {
    return this.promotionsService.create(ctx, body as any);
  }

  @Patch(':promotionId')
  @RequirePermissions(TENANT_PERMISSIONS.PROMOTIONS_MANAGE)
  update(@CurrentContext() ctx: RequestContext, @Param('promotionId') promotionId: string, @Body() body: Record<string, unknown>) {
    return this.promotionsService.update(ctx, promotionId, body as any);
  }
}
