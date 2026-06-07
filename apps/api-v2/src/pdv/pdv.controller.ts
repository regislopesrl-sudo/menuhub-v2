import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentContext } from '../common/current-context.decorator';
import type { RequestContext } from '../common/request-context';
import { RequirePermissions } from '../common/permissions.decorator';
import { TENANT_PERMISSIONS } from '../common/rbac';
import { ModuleAccess } from '../modules/module-access.decorator';
import { ModuleGuard } from '../modules/module.guard';
import { PdvService, type PdvMovementType } from './pdv.service';

@Controller('v2/pdv/sessions')
@UseGuards(ModuleGuard)
@ModuleAccess('pdv')
@RequirePermissions(TENANT_PERMISSIONS.PDV_OPERATE)
export class PdvController {
  constructor(private readonly pdvService: PdvService) {}

  @Get()
  async listSessions(@CurrentContext() ctx: RequestContext) {
    return this.pdvService.listSessions(ctx);
  }

  @Post('open')
  async openSession(
    @CurrentContext() ctx: RequestContext,
    @Body() body: { openingBalance?: number },
  ) {
    return this.pdvService.openSession(ctx, body);
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
    return this.pdvService.getCurrentSessionMovements(ctx);
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

  @Get(':id/ledger')
  async ledger(@Param('id') id: string, @CurrentContext() ctx: RequestContext) {
    return this.pdvService.getSessionLedger(id, ctx);
  }

  @Get(':id/operators/summary')
  async operatorSummary(
    @Param('id') id: string,
    @CurrentContext() ctx: RequestContext,
    @Query('userId') userId?: string,
  ) {
    return this.pdvService.getOperatorSummary(id, ctx, userId);
  }

  @Get(':id/divergence')
  async divergence(@Param('id') id: string, @CurrentContext() ctx: RequestContext) {
    return this.pdvService.getSessionDivergence(id, ctx);
  }
}
