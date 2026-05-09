import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RequireAdminGuard } from '../common/require-admin.guard';
import { CurrentContext } from '../common/current-context.decorator';
import type { RequestContext } from '../common/request-context';
import { RequirePermissions } from '../common/permissions.decorator';
import { TENANT_PERMISSIONS } from '../common/rbac';
import { recordAuditFromContext } from '../common/audit-log-recorder';
import { AUDIT_ACTIONS } from '../common/audit-log';
import type { CreateBranchDto, UpdateBranchDto } from './dto/branches.dto';
import { BranchesService } from './branches.service';

@Controller('v2/admin/branches')
@UseGuards(RequireAdminGuard)
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Get()
  @RequirePermissions(TENANT_PERMISSIONS.SETTINGS_READ, TENANT_PERMISSIONS.SETTINGS_WRITE)
  list(@CurrentContext() ctx: RequestContext) {
    return this.branchesService.list(ctx);
  }

  @Post()
  @RequirePermissions(TENANT_PERMISSIONS.SETTINGS_WRITE)
  async create(@CurrentContext() ctx: RequestContext, @Body() body: CreateBranchDto) {
    try {
      const created = await this.branchesService.create(ctx, body);
      recordAuditFromContext({
        action: AUDIT_ACTIONS.SETTINGS_UPDATE,
        outcome: 'success',
        ctx,
        target: { type: 'branch', id: created.id, label: created.name },
        metadata: { companyId: ctx.companyId, branchId: created.id, section: 'branch.create' },
      });
      return created;
    } catch (error) {
      recordAuditFromContext({
        action: AUDIT_ACTIONS.SETTINGS_UPDATE,
        outcome: 'failure',
        ctx,
        target: { type: 'branch' },
        metadata: { companyId: ctx.companyId, section: 'branch.create', error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  @Patch(':id')
  @RequirePermissions(TENANT_PERMISSIONS.SETTINGS_WRITE)
  async update(@Param('id') id: string, @CurrentContext() ctx: RequestContext, @Body() body: UpdateBranchDto) {
    try {
      const updated = await this.branchesService.update(ctx, id, body);
      recordAuditFromContext({
        action: AUDIT_ACTIONS.SETTINGS_UPDATE,
        outcome: 'success',
        ctx,
        target: { type: 'branch', id: updated.id, label: updated.name },
        metadata: { companyId: ctx.companyId, branchId: updated.id, section: 'branch.update' },
      });
      return updated;
    } catch (error) {
      recordAuditFromContext({
        action: AUDIT_ACTIONS.SETTINGS_UPDATE,
        outcome: 'failure',
        ctx,
        target: { type: 'branch', id },
        metadata: { companyId: ctx.companyId, branchId: id, section: 'branch.update', error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }
}
