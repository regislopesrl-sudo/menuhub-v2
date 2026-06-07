import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { DriverStatus } from '@prisma/client';
import { CurrentContext } from '../common/current-context.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { RequireAdminGuard } from '../common/require-admin.guard';
import { TENANT_PERMISSIONS } from '../common/rbac';
import type { RequestContext } from '../common/request-context';
import { LogisticsService } from './logistics.service';

@Controller('v2/logistics')
@UseGuards(RequireAdminGuard)
export class LogisticsController {
  constructor(private readonly logisticsService: LogisticsService) {}

  @Get('summary')
  @RequirePermissions(TENANT_PERMISSIONS.LOGISTICS_READ, TENANT_PERMISSIONS.LOGISTICS_MANAGE)
  summary(@CurrentContext() ctx: RequestContext) {
    return this.logisticsService.getSummary(ctx);
  }

  @Get('drivers')
  @RequirePermissions(TENANT_PERMISSIONS.LOGISTICS_READ, TENANT_PERMISSIONS.LOGISTICS_MANAGE)
  listDrivers(@CurrentContext() ctx: RequestContext) {
    return this.logisticsService.listDrivers(ctx);
  }

  @Post('drivers')
  @RequirePermissions(TENANT_PERMISSIONS.LOGISTICS_MANAGE)
  createDriver(
    @CurrentContext() ctx: RequestContext,
    @Body()
    body: {
      name?: string;
      phone?: string | null;
      vehicleType?: string | null;
      vehiclePlate?: string | null;
      document?: string | null;
      commissionType?: string | null;
      commissionValue?: number | null;
      status?: DriverStatus;
      isOnline?: boolean;
      isActive?: boolean;
    },
  ) {
    return this.logisticsService.createDriver(ctx, body);
  }

  @Patch('drivers/:driverId')
  @RequirePermissions(TENANT_PERMISSIONS.LOGISTICS_MANAGE)
  updateDriver(
    @CurrentContext() ctx: RequestContext,
    @Param('driverId') driverId: string,
    @Body() body: Parameters<LogisticsService['updateDriver']>[2],
  ) {
    return this.logisticsService.updateDriver(ctx, driverId, body);
  }

  @Post('orders/:orderId/assign-driver')
  @RequirePermissions(TENANT_PERMISSIONS.LOGISTICS_MANAGE)
  assignDriver(
    @CurrentContext() ctx: RequestContext,
    @Param('orderId') orderId: string,
    @Body() body: { driverId?: string },
  ) {
    return this.logisticsService.assignDriver(ctx, orderId, body);
  }

  @Patch('deliveries/:deliveryId/status')
  @RequirePermissions(TENANT_PERMISSIONS.LOGISTICS_MANAGE)
  updateDeliveryStatus(
    @CurrentContext() ctx: RequestContext,
    @Param('deliveryId') deliveryId: string,
    @Body() body: { status: 'ASSIGNED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED'; failedReason?: string },
  ) {
    return this.logisticsService.updateDeliveryStatus(ctx, deliveryId, body);
  }

  @Get('deliveries')
  @RequirePermissions(TENANT_PERMISSIONS.LOGISTICS_READ, TENANT_PERMISSIONS.LOGISTICS_MANAGE)
  deliveries(@CurrentContext() ctx: RequestContext, @Query() query: { limit?: string }) {
    return this.logisticsService.listDeliveries(ctx, query);
  }

  @Get('orders/assignable')
  @RequirePermissions(TENANT_PERMISSIONS.LOGISTICS_READ, TENANT_PERMISSIONS.LOGISTICS_MANAGE)
  assignableOrders(@CurrentContext() ctx: RequestContext, @Query() query: { limit?: string }) {
    return this.logisticsService.listAssignableOrders(ctx, query);
  }
}
