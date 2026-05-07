import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
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
    return this.settingsService.patchCompany(ctx, body);
  }

  @Get('branch')
  @RequirePermissions(TENANT_PERMISSIONS.SETTINGS_READ, TENANT_PERMISSIONS.SETTINGS_WRITE)
  async getBranch(@CurrentContext() ctx: RequestContext) {
    return this.settingsService.getBranch(ctx);
  }

  @Patch('branch')
  @RequirePermissions(TENANT_PERMISSIONS.SETTINGS_WRITE)
  async patchBranch(@CurrentContext() ctx: RequestContext, @Body() body: BranchSettingsDto) {
    return this.settingsService.patchBranch(ctx, body);
  }

  @Get('operation')
  @RequirePermissions(TENANT_PERMISSIONS.SETTINGS_READ, TENANT_PERMISSIONS.SETTINGS_WRITE)
  async getOperation(@CurrentContext() ctx: RequestContext) {
    return this.settingsService.getOperation(ctx);
  }

  @Patch('operation')
  @RequirePermissions(TENANT_PERMISSIONS.SETTINGS_WRITE)
  async patchOperation(@CurrentContext() ctx: RequestContext, @Body() body: OperationSettingsDto) {
    return this.settingsService.patchOperation(ctx, body);
  }

  @Get('payments')
  @RequirePermissions(TENANT_PERMISSIONS.SETTINGS_READ, TENANT_PERMISSIONS.SETTINGS_WRITE)
  async getPayments(@CurrentContext() ctx: RequestContext) {
    return this.settingsService.getPayments(ctx);
  }

  @Patch('payments')
  @RequirePermissions(TENANT_PERMISSIONS.SETTINGS_WRITE)
  async patchPayments(@CurrentContext() ctx: RequestContext, @Body() body: PaymentSettingsDto) {
    return this.settingsService.patchPayments(ctx, body);
  }

  @Get('runtime')
  @RequirePermissions(TENANT_PERMISSIONS.SETTINGS_READ, TENANT_PERMISSIONS.SETTINGS_WRITE)
  async getRuntime(@CurrentContext() ctx: RequestContext) {
    return this.settingsService.getCompanyRuntimeConfiguration(ctx);
  }
}
