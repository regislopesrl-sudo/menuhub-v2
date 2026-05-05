import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { ModuleKey } from '@delivery-futuro/shared-types';
import { Public } from '../common/public.decorator';
import { RequireDeveloperGuard } from '../common/require-developer.guard';
import { ModulesService } from '../modules/modules.service';
import { AuthServiceV2 } from '../auth/auth.service';

@Controller('v2/developer')
export class DeveloperController {
  constructor(
    private readonly modulesService: ModulesService,
    private readonly authService: AuthServiceV2,
  ) {}

  @Public()
  @Post('login')
  login(@Body() body: { code?: string }) {
    return this.authService.loginWithDeveloperCode({ code: body.code ?? '' });
  }

  @Get('plans')
  @UseGuards(RequireDeveloperGuard)
  listPlans() {
    return this.modulesService.listPlans();
  }

  @Post('plans')
  @UseGuards(RequireDeveloperGuard)
  createPlan(
    @Body()
    body: {
      key: string;
      name: string;
      description?: string;
      modules?: Array<{ moduleKey: ModuleKey; enabled?: boolean; adminOnly?: boolean }>;
      limits?: Array<{ limitKey: string; limitValue: number }>;
    },
  ) {
    return this.modulesService.createPlan(body);
  }

  @Patch('plans/:id')
  @UseGuards(RequireDeveloperGuard)
  updatePlan(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      description?: string | null;
      isActive?: boolean;
      modules?: Array<{ moduleKey: ModuleKey; enabled?: boolean; adminOnly?: boolean }>;
      limits?: Array<{ limitKey: string; limitValue: number }>;
    },
  ) {
    return this.modulesService.updatePlan(id, body);
  }

  @Get('companies/:companyId/modules')
  @UseGuards(RequireDeveloperGuard)
  getCompanyModules(@Param('companyId') companyId: string) {
    return this.modulesService.listCurrentCompanyModules(companyId);
  }

  @Patch('companies/:companyId/modules/:moduleKey')
  @UseGuards(RequireDeveloperGuard)
  updateCompanyModule(
    @Param('companyId') companyId: string,
    @Param('moduleKey') moduleKey: ModuleKey,
    @Body() body: { enabled: boolean },
  ) {
    return this.modulesService.updateCompanyModuleOverride({
      companyId,
      moduleKey,
      enabled: Boolean(body?.enabled),
    });
  }
}
