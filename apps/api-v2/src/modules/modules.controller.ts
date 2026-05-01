import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import type { ModuleKey } from '@delivery-futuro/shared-types';
import { ModulesService } from './modules.service';
import { CurrentContext } from '../common/current-context.decorator';
import type { RequestContext } from '../common/request-context';

@Controller('v2')
export class ModulesController {
  constructor(private readonly modulesService: ModulesService) {}

  @Get('modules')
  async listModules() {
    return this.modulesService.listAvailableModules();
  }

  @Get('companies/current/modules')
  async listCurrentCompanyModules(@CurrentContext() ctx: RequestContext) {
    return this.modulesService.listCurrentCompanyModules(ctx.companyId);
  }

  @Patch('companies/current/modules/:moduleKey')
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
