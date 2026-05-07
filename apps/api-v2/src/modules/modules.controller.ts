import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import type { ModuleKey } from '@delivery-futuro/shared-types';
import { ModulesService } from './modules.service';
import { CurrentContext } from '../common/current-context.decorator';
import type { RequestContext } from '../common/request-context';
import { RequireDeveloperGuard } from '../common/require-developer.guard';
import { assertCompanyScope } from '../common/platform-access';
import { RequirePermissions } from '../common/permissions.decorator';
import { PLATFORM_PERMISSIONS, TENANT_PERMISSIONS } from '../common/rbac';

@Controller('v2')
export class ModulesController {
  constructor(private readonly modulesService: ModulesService) {}

  @Get('modules')
  @RequirePermissions(TENANT_PERMISSIONS.MODULES_READ, TENANT_PERMISSIONS.MODULES_MANAGE, PLATFORM_PERMISSIONS.MODULES_MANAGE)
  async listModules() {
    return this.modulesService.listAvailableModules();
  }

  @Get('plans')
  @RequirePermissions(TENANT_PERMISSIONS.MODULES_READ, TENANT_PERMISSIONS.MODULES_MANAGE, PLATFORM_PERMISSIONS.PLANS_MANAGE)
  async listPlans() {
    return this.modulesService.listPlans();
  }

  @Get('companies/current/modules')
  @RequirePermissions(TENANT_PERMISSIONS.MODULES_READ, TENANT_PERMISSIONS.MODULES_MANAGE, PLATFORM_PERMISSIONS.MODULES_MANAGE)
  async listCurrentCompanyModules(@CurrentContext() ctx: RequestContext) {
    return this.modulesService.listCurrentCompanyModules(ctx.companyId);
  }

  @Get('companies/:companyId/modules')
  @UseGuards(RequireDeveloperGuard)
  @RequirePermissions(TENANT_PERMISSIONS.MODULES_READ, TENANT_PERMISSIONS.MODULES_MANAGE, PLATFORM_PERMISSIONS.MODULES_MANAGE)
  async getCompanyModulesView(
    @Param('companyId') companyId: string,
    @CurrentContext() ctx: RequestContext,
  ) {
    assertCompanyScope(ctx, companyId);
    return this.modulesService.getCompanyModulesView(companyId);
  }

  @Patch('companies/current/modules/:moduleKey')
  @UseGuards(RequireDeveloperGuard)
  @RequirePermissions(TENANT_PERMISSIONS.MODULES_MANAGE, PLATFORM_PERMISSIONS.MODULES_MANAGE)
  async updateCurrentCompanyModule(
    @Param('moduleKey') moduleKey: ModuleKey,
    @Body() body: { enabled: boolean },
    @CurrentContext() ctx: RequestContext,
  ) {
    return this.modulesService.updateCurrentCompanyModule({
      companyId: ctx.companyId,
      moduleKey,
      enabled: Boolean(body?.enabled),
    });
  }
}
