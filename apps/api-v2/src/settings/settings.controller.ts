import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { CurrentContext } from '../common/current-context.decorator';
import type { RequestContext } from '../common/request-context';
import {
  BranchSettingsDto,
  CompanySettingsDto,
  OperationSettingsDto,
  PaymentSettingsDto,
} from './dto/settings.dto';
import { SettingsService } from './settings.service';
import { RequireAdminGuard } from '../common/require-admin.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import { TENANT_PERMISSIONS } from '../common/rbac';
import { recordAuditFromContext } from '../common/audit-log-recorder';
import { AUDIT_ACTIONS } from '../common/audit-log';

@Controller('v2/settings')
@UseGuards(RequireAdminGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('company')
  @RequirePermissions(TENANT_PERMISSIONS.SETTINGS_READ, TENANT_PERMISSIONS.SETTINGS_WRITE)
  async getCompany(@CurrentContext() ctx: RequestContext) {
    return this.settingsService.getCompany(ctx);
  }

  @Patch('company')
  @RequirePermissions(TENANT_PERMISSIONS.SETTINGS_WRITE)
  async patchCompany(@CurrentContext() ctx: RequestContext, @Body() body: CompanySettingsDto) {
    try {
      const updated = await this.settingsService.patchCompany(ctx, body);
      recordAuditFromContext({
        action: AUDIT_ACTIONS.SETTINGS_UPDATE,
        outcome: 'success',
        ctx,
        target: { type: 'settings', id: 'company', label: 'company' },
        metadata: { companyId: ctx.companyId, section: 'company' },
      });
      return updated;
    } catch (error) {
      recordAuditFromContext({
        action: AUDIT_ACTIONS.SETTINGS_UPDATE,
        outcome: 'failure',
        ctx,
        target: { type: 'settings', id: 'company', label: 'company' },
        metadata: { companyId: ctx.companyId, section: 'company', error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  @Get('branch')
  @RequirePermissions(TENANT_PERMISSIONS.SETTINGS_READ, TENANT_PERMISSIONS.SETTINGS_WRITE)
  async getBranch(@CurrentContext() ctx: RequestContext) {
    return this.settingsService.getBranch(ctx);
  }

  @Patch('branch')
  @RequirePermissions(TENANT_PERMISSIONS.SETTINGS_WRITE)
  async patchBranch(@CurrentContext() ctx: RequestContext, @Body() body: BranchSettingsDto) {
    try {
      const updated = await this.settingsService.patchBranch(ctx, body);
      recordAuditFromContext({
        action: AUDIT_ACTIONS.SETTINGS_UPDATE,
        outcome: 'success',
        ctx,
        target: { type: 'settings', id: 'branch', label: 'branch' },
        metadata: { companyId: ctx.companyId, branchId: ctx.branchId ?? null, section: 'branch' },
      });
      return updated;
    } catch (error) {
      recordAuditFromContext({
        action: AUDIT_ACTIONS.SETTINGS_UPDATE,
        outcome: 'failure',
        ctx,
        target: { type: 'settings', id: 'branch', label: 'branch' },
        metadata: { companyId: ctx.companyId, branchId: ctx.branchId ?? null, section: 'branch', error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  @Get('cep/:cep')
  @RequirePermissions(TENANT_PERMISSIONS.SETTINGS_READ, TENANT_PERMISSIONS.SETTINGS_WRITE)
  async lookupCep(@Param('cep') cep: string) {
    return this.settingsService.lookupAddressByCep(cep);
  }

  @Get('operation')
  @RequirePermissions(TENANT_PERMISSIONS.SETTINGS_READ, TENANT_PERMISSIONS.SETTINGS_WRITE)
  async getOperation(@CurrentContext() ctx: RequestContext) {
    return this.settingsService.getOperation(ctx);
  }

  @Patch('operation')
  @RequirePermissions(TENANT_PERMISSIONS.SETTINGS_WRITE)
  async patchOperation(@CurrentContext() ctx: RequestContext, @Body() body: OperationSettingsDto) {
    try {
      const updated = await this.settingsService.patchOperation(ctx, body);
      recordAuditFromContext({
        action: AUDIT_ACTIONS.SETTINGS_UPDATE,
        outcome: 'success',
        ctx,
        target: { type: 'settings', id: 'operation', label: 'operation' },
        metadata: { companyId: ctx.companyId, branchId: ctx.branchId ?? null, section: 'operation' },
      });
      return updated;
    } catch (error) {
      recordAuditFromContext({
        action: AUDIT_ACTIONS.SETTINGS_UPDATE,
        outcome: 'failure',
        ctx,
        target: { type: 'settings', id: 'operation', label: 'operation' },
        metadata: { companyId: ctx.companyId, branchId: ctx.branchId ?? null, section: 'operation', error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  @Get('payments')
  @RequirePermissions(TENANT_PERMISSIONS.SETTINGS_READ, TENANT_PERMISSIONS.SETTINGS_WRITE)
  async getPayments(@CurrentContext() ctx: RequestContext) {
    return this.settingsService.getPayments(ctx);
  }

  @Patch('payments')
  @RequirePermissions(TENANT_PERMISSIONS.SETTINGS_WRITE)
  async patchPayments(@CurrentContext() ctx: RequestContext, @Body() body: PaymentSettingsDto) {
    try {
      const updated = await this.settingsService.patchPayments(ctx, body);
      recordAuditFromContext({
        action: AUDIT_ACTIONS.SETTINGS_UPDATE,
        outcome: 'success',
        ctx,
        target: { type: 'settings', id: 'payments', label: 'payments' },
        metadata: { companyId: ctx.companyId, branchId: ctx.branchId ?? null, section: 'payments' },
      });
      return updated;
    } catch (error) {
      recordAuditFromContext({
        action: AUDIT_ACTIONS.SETTINGS_UPDATE,
        outcome: 'failure',
        ctx,
        target: { type: 'settings', id: 'payments', label: 'payments' },
        metadata: { companyId: ctx.companyId, branchId: ctx.branchId ?? null, section: 'payments', error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  @Get('runtime')
  @RequirePermissions(TENANT_PERMISSIONS.SETTINGS_READ, TENANT_PERMISSIONS.SETTINGS_WRITE)
  async getRuntime(@CurrentContext() ctx: RequestContext) {
    return this.settingsService.getCompanyRuntimeConfiguration(ctx);
  }
}
