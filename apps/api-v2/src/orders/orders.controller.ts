import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { CurrentContext } from '../common/current-context.decorator';
import type { RequestContext } from '../common/request-context';
import { RequirePermissions } from '../common/permissions.decorator';
import { TENANT_PERMISSIONS } from '../common/rbac';
import { OrdersService } from './orders.service';

@Controller('v2/orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @RequirePermissions(TENANT_PERMISSIONS.ORDERS_READ, TENANT_PERMISSIONS.ORDERS_MANAGE)
  async list(
    @CurrentContext() ctx: RequestContext,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('createdFrom') createdFrom?: string,
    @Query('createdTo') createdTo?: string,
  ) {
    return this.ordersService.list(ctx, {
      status,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      createdFrom,
      createdTo,
    });
  }

  @Get(':id')
  @RequirePermissions(TENANT_PERMISSIONS.ORDERS_READ, TENANT_PERMISSIONS.ORDERS_MANAGE)
  async getById(@Param('id') id: string, @CurrentContext() ctx: RequestContext) {
    return this.ordersService.getById(id, ctx);
  }

  @Patch(':id/status')
  @RequirePermissions(TENANT_PERMISSIONS.ORDERS_MANAGE)
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string },
    @CurrentContext() ctx: RequestContext,
  ) {
    return this.ordersService.updateStatus(id, body.status, ctx);
  }
}
