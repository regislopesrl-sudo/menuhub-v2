import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { RequestContext } from '../common/request-context';
import { ONBOARDING_STEP_KEYS, type OnboardingStepKey } from './dto/onboarding.dto';

const ONBOARDING_SETTINGS_KEY = 'settings.onboarding';
const ONBOARDING_STEP_ORDER: OnboardingStepKey[] = [...ONBOARDING_STEP_KEYS];

type JsonRecord = Record<string, unknown>;

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(ctx: RequestContext) {
    const branchId = await this.resolveBranchId(ctx);
    const setting = await this.readSetting(ctx.companyId, branchId);
    const completedSteps = this.readCompletedSteps(setting);
    const steps = ONBOARDING_STEP_KEYS.map((stepKey) => ({
      stepKey,
      completed: completedSteps.includes(stepKey),
    }));

    return {
      companyId: ctx.companyId,
      branchId,
      completed: steps.every((step) => step.completed),
      progress: {
        done: steps.filter((step) => step.completed).length,
        total: ONBOARDING_STEP_KEYS.length,
      },
      steps,
    };
  }

  async patchStep(ctx: RequestContext, stepKey: OnboardingStepKey, completed: boolean) {
    this.assertStepKey(stepKey);
    const branchId = await this.resolveBranchId(ctx);
    const current = await this.readSetting(ctx.companyId, branchId);
    const completedSteps = this.readCompletedSteps(current);
    if (completed) {
      this.assertStepPrerequisites(stepKey, completedSteps);
    }
    const nextCompletedSteps = completed
      ? Array.from(new Set([...completedSteps, stepKey]))
      : completedSteps.filter((currentStep) => currentStep !== stepKey);

    await this.writeSetting(ctx.companyId, branchId, {
      ...current,
      completedSteps: nextCompletedSteps,
      updatedAt: new Date().toISOString(),
    });

    return this.getStatus(ctx);
  }

  async reset(ctx: RequestContext) {
    const branchId = await this.resolveBranchId(ctx);
    const current = await this.readSetting(ctx.companyId, branchId);

    await this.writeSetting(ctx.companyId, branchId, {
      ...current,
      completedSteps: [],
      updatedAt: new Date().toISOString(),
      resetAt: new Date().toISOString(),
    });

    return this.getStatus(ctx);
  }

  private assertStepKey(stepKey: string): asserts stepKey is OnboardingStepKey {
    if (!ONBOARDING_STEP_KEYS.includes(stepKey as OnboardingStepKey)) {
      throw new BadRequestException(`Etapa de onboarding invalida: '${stepKey}'.`);
    }
  }

  private assertStepPrerequisites(stepKey: OnboardingStepKey, completedSteps: OnboardingStepKey[]) {
    const stepIndex = ONBOARDING_STEP_ORDER.indexOf(stepKey);
    const missingPrerequisites = ONBOARDING_STEP_ORDER
      .slice(0, stepIndex)
      .filter((requiredStep) => !completedSteps.includes(requiredStep));

    if (missingPrerequisites.length > 0) {
      throw new BadRequestException(
        `Etapa '${stepKey}' exige conclusao previa de: ${missingPrerequisites.join(', ')}.`,
      );
    }
  }

  private async resolveBranchId(ctx: RequestContext): Promise<string> {
    if (ctx.branchId) {
      await this.assertBranchBelongsToCompany(ctx.branchId, ctx.companyId);
      return ctx.branchId;
    }
    const branch = await this.prisma.branch.findFirst({
      where: { companyId: ctx.companyId },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!branch) {
      throw new BadRequestException(`Nenhuma branch encontrada para company '${ctx.companyId}'.`);
    }
    return branch.id;
  }

  private async assertBranchBelongsToCompany(branchId: string, companyId: string): Promise<void> {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, companyId },
      select: { id: true },
    });
    if (!branch) {
      throw new BadRequestException(`Branch '${branchId}' nao pertence a company '${companyId}'.`);
    }
  }

  private async readSetting(companyId: string, branchId: string): Promise<JsonRecord> {
    const setting = await this.prisma.companySetting.findFirst({
      where: { companyId, branchId, key: ONBOARDING_SETTINGS_KEY },
      select: { value: true },
    });
    return this.isRecord(setting?.value) ? (setting?.value as JsonRecord) : {};
  }

  private async writeSetting(companyId: string, branchId: string, value: JsonRecord): Promise<void> {
    await this.prisma.companySetting.upsert({
      where: { companyId_branchId_key: { companyId, branchId, key: ONBOARDING_SETTINGS_KEY } },
      create: { companyId, branchId, key: ONBOARDING_SETTINGS_KEY, value: value as any },
      update: { value: value as any },
    });
  }

  private readCompletedSteps(setting: JsonRecord): OnboardingStepKey[] {
    const value = setting.completedSteps;
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is OnboardingStepKey =>
      typeof item === 'string' && ONBOARDING_STEP_KEYS.includes(item as OnboardingStepKey),
    );
  }

  private isRecord(value: unknown): value is JsonRecord {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }
}
