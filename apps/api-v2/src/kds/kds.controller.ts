import { Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentContext } from '../common/current-context.decorator';
import type { RequestContext } from '../common/request-context';
import { RequirePermissions } from '../common/permissions.decorator';
import { TENANT_PERMISSIONS } from '../common/rbac';
import { KdsService } from './kds.service';
import { ModuleAccess } from '../modules/module-access.decorator';
import { ModuleGuard } from '../modules/module.guard';

@Controller('v2/kds')
@UseGuards(ModuleGuard)
@ModuleAccess('kds' as any)
@RequirePermissions(TENANT_PERMISSIONS.KDS_OPERATE)
export class KdsController {
  constructor(private readonly kdsService: KdsService) {}

  @Get('stations')
  async listStations() {
    return this.kdsService.listStations();
  }

  @Get('orders')
  async listOrders(
    @CurrentContext() ctx: RequestContext,
    @Query('station') station?: string,
    @Query('channel') channel?: string,
  ) {
    return this.kdsService.listOrders(ctx, { station, channel });
  }

  @Patch('orders/:id/start')
  async startOrder(@Param('id') id: string, @CurrentContext() ctx: RequestContext) {
    return this.kdsService.startOrder(id, ctx);
  }

  @Patch('orders/:id/ready')
  async markReady(@Param('id') id: string, @CurrentContext() ctx: RequestContext) {
    return this.kdsService.markReady(id, ctx);
  }

  @Patch('orders/:id/bump')
  async bumpOrder(@Param('id') id: string, @CurrentContext() ctx: RequestContext) {
    return this.kdsService.bumpOrder(id, ctx);
  }

  @Post('orders/:id/print')
  async printOrder(@Param('id') id: string, @CurrentContext() ctx: RequestContext) {
    return this.kdsService.printKitchenTicket(id, ctx);
  }
}
