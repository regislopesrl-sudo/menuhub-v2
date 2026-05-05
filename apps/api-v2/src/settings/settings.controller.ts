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

@Controller('v2/settings')
@UseGuards(RequireAdminGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('company')
  async getCompany(@CurrentContext() ctx: RequestContext) {
    return this.settingsService.getCompany(ctx);
  }

  @Patch('company')
  async patchCompany(@CurrentContext() ctx: RequestContext, @Body() body: CompanySettingsDto) {
    return this.settingsService.patchCompany(ctx, body);
  }

  @Get('branch')
  async getBranch(@CurrentContext() ctx: RequestContext) {
    return this.settingsService.getBranch(ctx);
  }

  @Patch('branch')
  async patchBranch(@CurrentContext() ctx: RequestContext, @Body() body: BranchSettingsDto) {
    return this.settingsService.patchBranch(ctx, body);
  }

  @Get('operation')
  async getOperation(@CurrentContext() ctx: RequestContext) {
    return this.settingsService.getOperation(ctx);
  }

  @Patch('operation')
  async patchOperation(@CurrentContext() ctx: RequestContext, @Body() body: OperationSettingsDto) {
    return this.settingsService.patchOperation(ctx, body);
  }

  @Get('payments')
  async getPayments(@CurrentContext() ctx: RequestContext) {
    return this.settingsService.getPayments(ctx);
  }

  @Patch('payments')
  async patchPayments(@CurrentContext() ctx: RequestContext, @Body() body: PaymentSettingsDto) {
    return this.settingsService.patchPayments(ctx, body);
  }

  @Get('runtime')
  async getRuntime(@CurrentContext() ctx: RequestContext) {
    return this.settingsService.getCompanyRuntimeConfiguration(ctx);
  }
}
