import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentContext } from '../common/current-context.decorator';
import type { RequestContext } from '../common/request-context';
import { PdvService, type PdvMovementType } from './pdv.service';
import { RequireAdminGuard } from '../common/require-admin.guard';

@Controller('v2/pdv/sessions')
@UseGuards(RequireAdminGuard)
export class PdvController {
  constructor(private readonly pdvService: PdvService) {}

  @Post('open')
  async openSession(
    @CurrentContext() ctx: RequestContext,
    @Body() body: { openingBalance?: number },
  ) {
    return this.pdvService.openSession(ctx, body);
  }

  @Post(':id/close')
  async closeSession(
    @Param('id') id: string,
    @CurrentContext() ctx: RequestContext,
    @Body() body: { declaredCashAmount?: number; closureNotes?: string },
  ) {
    return this.pdvService.closeSession(id, ctx, body);
  }

  @Get(':id/summary')
  async summary(@Param('id') id: string, @CurrentContext() ctx: RequestContext) {
    return this.pdvService.getSessionSummary(id, ctx);
  }

  @Get('current/open')
  async currentOpen(@CurrentContext() ctx: RequestContext) {
    return this.pdvService.getOpenSession(ctx);
  }

  @Get('current/summary')
  async currentSummary(@CurrentContext() ctx: RequestContext) {
    return this.pdvService.getCurrentSessionSummary(ctx);
  }

  @Get('current/movements')
  async currentMovements(@CurrentContext() ctx: RequestContext) {
    return this.pdvService.listCurrentMovements(ctx);
  }

  @Post(':id/movements')
  async createMovement(
    @Param('id') id: string,
    @CurrentContext() ctx: RequestContext,
    @Body() body: { type: PdvMovementType; amount: number; reason?: string },
  ) {
    return this.pdvService.createMovement(id, ctx, body);
  }

  @Get(':id/movements')
  async listMovements(@Param('id') id: string, @CurrentContext() ctx: RequestContext) {
    return this.pdvService.listMovements(id, ctx);
  }
}
