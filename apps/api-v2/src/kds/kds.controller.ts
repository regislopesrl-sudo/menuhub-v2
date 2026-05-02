import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { CurrentContext } from '../common/current-context.decorator';
import type { RequestContext } from '../common/request-context';
import { KdsService } from './kds.service';
import { ModuleAccess } from '../modules/module-access.decorator';
import { ModuleGuard } from '../modules/module.guard';

@Controller('v2/kds')
@UseGuards(ModuleGuard)
@ModuleAccess('kds' as any)
export class KdsController {
  constructor(private readonly kdsService: KdsService) {}

  @Get('orders')
  async listOrders(@CurrentContext() ctx: RequestContext) {
    return this.kdsService.listOrders(ctx);
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
}
