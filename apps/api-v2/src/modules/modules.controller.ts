import { Controller, Get, Headers } from '@nestjs/common';
import { ModulesService } from './modules.service';

@Controller('v2')
export class ModulesController {
  constructor(private readonly modulesService: ModulesService) {}

  @Get('modules')
  async listModules() {
    return this.modulesService.listAvailableModules();
  }

  @Get('companies/current/modules')
  async listCurrentCompanyModules(@Headers('x-company-id') companyIdHeader?: string) {
    const companyId = companyIdHeader?.trim() || 'default-company';
    return this.modulesService.listCurrentCompanyModules(companyId);
  }
}

