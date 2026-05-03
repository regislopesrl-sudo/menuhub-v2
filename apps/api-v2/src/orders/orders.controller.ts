import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { CurrentContext } from '../common/current-context.decorator';
import type { RequestContext } from '../common/request-context';
import { OrdersService } from './orders.service';

@Controller('v2/orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  async list(
    @CurrentContext() ctx: RequestContext,
    @Query('status') status?: string,
    @Query('channel') channel?: string,
    @Query('paymentStatus') paymentStatus?: string,
    @Query('activeOnly') activeOnly?: string,
    @Query('delayedOnly') delayedOnly?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: 'createdAt' | 'updatedAt' | 'total' | 'status',
    @Query('sortDirection') sortDirection?: 'asc' | 'desc',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('createdFrom') createdFrom?: string,
    @Query('createdTo') createdTo?: string,
  ) {
    return this.ordersService.list(ctx, {
      status,
      channel,
      paymentStatus,
      activeOnly,
      delayedOnly,
      search,
      sortBy,
      sortDirection,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      createdFrom,
      createdTo,
    });
  }

  @Get('summary')
  async summary(
    @CurrentContext() ctx: RequestContext,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('channel') channel?: string,
  ) {
    return this.ordersService.summary(ctx, { dateFrom, dateTo, channel });
  }

  @Get('tracking/:token')
  async publicTracking(@Param('token') token: string) {
    return this.ordersService.getPublicTrackingByToken(token);
  }

  @Get(':id/tracking')
  async tracking(@Param('id') id: string, @CurrentContext() ctx: RequestContext) {
    return this.ordersService.getTrackingById(id, ctx);
  }

  @Get(':id')
  async getById(@Param('id') id: string, @CurrentContext() ctx: RequestContext) {
    return this.ordersService.getById(id, ctx);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string },
    @CurrentContext() ctx: RequestContext,
  ) {
    return this.ordersService.updateStatus(id, body.status, ctx);
  }
}

