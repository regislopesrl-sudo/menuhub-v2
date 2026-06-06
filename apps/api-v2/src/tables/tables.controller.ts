import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentContext } from '../common/current-context.decorator';
import type { RequestContext } from '../common/request-context';
import { RequirePermissions } from '../common/permissions.decorator';
import { TENANT_PERMISSIONS } from '../common/rbac';
import { ModuleAccess } from '../modules/module-access.decorator';
import { ModuleGuard } from '../modules/module.guard';
import { TablesService } from './tables.service';

@Controller('v2/tables')
@UseGuards(ModuleGuard)
@ModuleAccess('waiter_app')
@RequirePermissions(TENANT_PERMISSIONS.ORDERS_MANAGE)
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Get()
  async list(@CurrentContext() ctx: RequestContext) {
    return this.tablesService.listTables(ctx);
  }

  @Post()
  async create(@CurrentContext() ctx: RequestContext, @Body() body: { name?: string; capacity?: number }) {
    return this.tablesService.createTable(ctx, body);
  }

  @Patch(':id')
  async update(@CurrentContext() ctx: RequestContext, @Param('id') id: string, @Body() body: { name?: string; capacity?: number; status?: 'FREE' | 'OCCUPIED' | 'RESERVED' | 'BLOCKED' }) {
    return this.tablesService.updateTable(ctx, id, body);
  }

  @Post(':id/sessions/open')
  async openSession(
    @CurrentContext() ctx: RequestContext,
    @Param('id') id: string,
    @Body() body: { guestCount?: number; commandCode?: string },
  ) {
    return this.tablesService.openSession(ctx, id, body);
  }

  @Post('sessions/:sessionId/close')
  async closeSession(@CurrentContext() ctx: RequestContext, @Param('sessionId') sessionId: string) {
    return this.tablesService.closeSession(ctx, sessionId);
  }

  @Post('sessions/:sessionId/transfer')
  async transferSession(
    @CurrentContext() ctx: RequestContext,
    @Param('sessionId') sessionId: string,
    @Body() body: { toTableId?: string },
  ) {
    return this.tablesService.transferSession(ctx, sessionId, String(body.toTableId ?? ''));
  }
}

@Controller('v2/commands')
@UseGuards(ModuleGuard)
@ModuleAccess('waiter_app')
@RequirePermissions(TENANT_PERMISSIONS.ORDERS_MANAGE)
export class CommandsController {
  constructor(private readonly tablesService: TablesService) {}

  @Get('open')
  async listOpen(@CurrentContext() ctx: RequestContext) {
    return this.tablesService.listOpenCommands(ctx);
  }

  @Post(':id/split')
  async split(
    @CurrentContext() ctx: RequestContext,
    @Param('id') id: string,
    @Body() body: { splitByGuests?: boolean },
  ) {
    return this.tablesService.splitCommand(ctx, id, Boolean(body.splitByGuests));
  }

  @Post('merge')
  async merge(@CurrentContext() ctx: RequestContext, @Body() body: { commandIds?: string[] }) {
    return this.tablesService.mergeCommands(ctx, Array.isArray(body.commandIds) ? body.commandIds : []);
  }
}
