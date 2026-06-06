import { Controller, Get, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../common/permissions.decorator';
import { RequireAdminGuard } from '../common/require-admin.guard';
import { TENANT_PERMISSIONS } from '../common/rbac';
import { IntegrationsService } from '../integrations/integrations.service';
import { LocalDiagnosticsService } from './local-diagnostics.service';

@Controller('v2/admin/local')
@UseGuards(RequireAdminGuard)
export class LocalDiagnosticsController {
  constructor(
    private readonly diagnosticsService: LocalDiagnosticsService,
    private readonly integrationsService: IntegrationsService,
  ) {}

  @Get('diagnostics')
  @RequirePermissions(TENANT_PERMISSIONS.MODULES_READ, TENANT_PERMISSIONS.REPORTS_READ)
  getDiagnostics() {
    return this.diagnosticsService.getDiagnostics();
  }

  @Get('integrations')
  @RequirePermissions(TENANT_PERMISSIONS.MODULES_READ, TENANT_PERMISSIONS.REPORTS_READ)
  getIntegrations() {
    return this.integrationsService.listCapabilities();
  }
}
