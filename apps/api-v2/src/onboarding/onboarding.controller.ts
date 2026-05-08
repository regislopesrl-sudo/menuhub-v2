import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { CurrentContext } from '../common/current-context.decorator';
import type { RequestContext } from '../common/request-context';
import { RequireAdminGuard } from '../common/require-admin.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import { TENANT_PERMISSIONS } from '../common/rbac';
import { recordAuditFromContext } from '../common/audit-log-recorder';
import { AUDIT_ACTIONS } from '../common/audit-log';
import { CompleteOnboardingStepDto, type OnboardingStepKey } from './dto/onboarding.dto';
import { OnboardingService } from './onboarding.service';

@Controller('v2/onboarding')
@UseGuards(RequireAdminGuard)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get('status')
  @RequirePermissions(TENANT_PERMISSIONS.SETTINGS_READ, TENANT_PERMISSIONS.SETTINGS_WRITE)
  async getStatus(@CurrentContext() ctx: RequestContext) {
    return this.onboardingService.getStatus(ctx);
  }

  @Patch('steps/:stepKey')
  @RequirePermissions(TENANT_PERMISSIONS.SETTINGS_WRITE)
  async patchStep(
    @CurrentContext() ctx: RequestContext,
    @Param('stepKey') stepKey: OnboardingStepKey,
    @Body() body: CompleteOnboardingStepDto,
  ) {
    const completed = Boolean(body?.completed);
    try {
      const status = await this.onboardingService.patchStep(ctx, stepKey, completed);
      recordAuditFromContext({
        action: AUDIT_ACTIONS.ONBOARDING_STEP_UPDATE,
        outcome: 'success',
        ctx,
        target: { type: 'onboarding_step', id: stepKey, label: stepKey },
        metadata: { stepKey, completed },
      });
      return status;
    } catch (error) {
      recordAuditFromContext({
        action: AUDIT_ACTIONS.ONBOARDING_STEP_UPDATE,
        outcome: 'failure',
        ctx,
        target: { type: 'onboarding_step', id: stepKey, label: stepKey },
        metadata: { stepKey, completed, error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }
}

