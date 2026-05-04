import { Body, Controller, Get, Headers, Param, Patch } from '@nestjs/common';
import type { ModuleKey } from '@delivery-futuro/shared-types';
import { ModulesService } from './modules.service';
import { RuntimeFacadeService } from './runtime-facade.service';
import { CurrentContext } from '../common/current-context.decorator';
import type { RequestContext } from '../common/request-context';
import { assertSameCompany } from '../common/assert-same-company';
import { requireDeveloperAreaAccess } from '../common/developer-access';

@Controller('v2')
export class ModulesController {
  constructor(
    private readonly modulesService: ModulesService,
    private readonly runtimeFacadeService: RuntimeFacadeService,
  ) {}

  @Get('modules')
  async listModules() {
    return this.modulesService.listAvailableModules();
  }

  @Get('companies/current/modules')
  async listCurrentCompanyModules(@CurrentContext() ctx: RequestContext) {
    return this.modulesService.listCurrentCompanyModules(ctx.companyId);
  }

  @Get('runtime/modules')
  async getRuntimeModules(@CurrentContext() ctx: RequestContext) {
    return this.runtimeFacadeService.getRuntimeModules(ctx.companyId);
  }

  @Patch('companies/current/modules/:moduleKey')
  async updateCurrentCompanyModule(
    @Param('moduleKey') moduleKey: ModuleKey,
    @Body() body: { enabled: boolean | null; reason?: string },
    @CurrentContext() ctx: RequestContext,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    requireDeveloperAreaAccess(headers);
    return this.modulesService.updateCurrentCompanyModule({
      companyId: ctx.companyId,
      moduleKey,
      enabled: body?.enabled === null ? null : Boolean(body?.enabled),
      reason: body?.reason,
    });
  }

  @Get('companies/:companyId/modules')
  async listCompanyModules(
    @Param('companyId') companyId: string,
    @CurrentContext() ctx: RequestContext,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    requireDeveloperAreaAccess(headers);
    assertSameCompany(ctx.companyId, companyId);
    return this.modulesService.getCompanyModulesView(companyId);
  }
}
