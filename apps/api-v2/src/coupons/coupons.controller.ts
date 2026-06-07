import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CouponDiscountType } from '@prisma/client';
import { CurrentContext } from '../common/current-context.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { RequireAdminGuard } from '../common/require-admin.guard';
import { TENANT_PERMISSIONS } from '../common/rbac';
import type { RequestContext } from '../common/request-context';
import { CouponsService } from './coupons.service';

@Controller('v2/coupons')
@UseGuards(RequireAdminGuard)
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Get()
  @RequirePermissions(TENANT_PERMISSIONS.COUPONS_READ, TENANT_PERMISSIONS.COUPONS_MANAGE)
  list(@CurrentContext() ctx: RequestContext) {
    return this.couponsService.list(ctx);
  }

  @Post()
  @RequirePermissions(TENANT_PERMISSIONS.COUPONS_MANAGE)
  create(
    @CurrentContext() ctx: RequestContext,
    @Body()
    body: {
      code?: string;
      discountType?: CouponDiscountType;
      discountValue?: number;
      minimumOrderAmount?: number | null;
      maxUses?: number | null;
      perCustomerLimit?: number | null;
      startsAt?: string | null;
      endsAt?: string | null;
      firstOrderOnly?: boolean;
      isActive?: boolean;
    },
  ) {
    return this.couponsService.create(ctx, body);
  }

  @Patch(':couponId')
  @RequirePermissions(TENANT_PERMISSIONS.COUPONS_MANAGE)
  update(@CurrentContext() ctx: RequestContext, @Param('couponId') couponId: string, @Body() body: Parameters<CouponsService['update']>[2]) {
    return this.couponsService.update(ctx, couponId, body);
  }

  @Post('validate')
  @RequirePermissions(TENANT_PERMISSIONS.COUPONS_READ, TENANT_PERMISSIONS.COUPONS_MANAGE)
  validate(
    @CurrentContext() ctx: RequestContext,
    @Body() body: { code?: string; orderTotal?: number; customerId?: string; appliedCouponCodes?: string[] },
  ) {
    return this.couponsService.validate(ctx, body);
  }
}
