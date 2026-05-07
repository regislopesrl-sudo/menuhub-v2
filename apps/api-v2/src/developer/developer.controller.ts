import { BadRequestException, Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { ModuleKey } from '@delivery-futuro/shared-types';
import { Public } from '../common/public.decorator';
import { RequireDeveloperGuard } from '../common/require-developer.guard';
import { ModulesService } from '../modules/modules.service';
import { AuthServiceV2 } from '../auth/auth.service';
import { PrismaService } from '../database/prisma.service';
import { CurrentContext } from '../common/current-context.decorator';
import type { RequestContext } from '../common/request-context';
import { assertCompanyScope, assertPlatformAdmin } from '../common/platform-access';
import { RequirePermissions } from '../common/permissions.decorator';
import { PLATFORM_PERMISSIONS } from '../common/rbac';

@Controller('v2/developer')
export class DeveloperController {
  constructor(
    private readonly modulesService: ModulesService,
    private readonly authService: AuthServiceV2,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Post('login')
  login(@Body() body: { code?: string }) {
    return this.authService.loginWithDeveloperCode({ code: body.code ?? '' });
  }

  @Get('plans')
  @UseGuards(RequireDeveloperGuard)
  @RequirePermissions(PLATFORM_PERMISSIONS.PLANS_MANAGE)
  listPlans(@CurrentContext() ctx: RequestContext) {
    assertPlatformAdmin(ctx);
    return this.modulesService.listPlans();
  }

  @Post('plans')
  @UseGuards(RequireDeveloperGuard)
  @RequirePermissions(PLATFORM_PERMISSIONS.PLANS_MANAGE)
  createPlan(
    @CurrentContext() ctx: RequestContext,
    @Body()
    body: {
      key: string;
      name: string;
      description?: string;
      modules?: Array<{ moduleKey: ModuleKey; enabled?: boolean; adminOnly?: boolean }>;
      limits?: Array<{ limitKey: string; limitValue: number }>;
    },
  ) {
    assertPlatformAdmin(ctx);
    return this.modulesService.createPlan(body);
  }

  @Patch('plans/:id')
  @UseGuards(RequireDeveloperGuard)
  @RequirePermissions(PLATFORM_PERMISSIONS.PLANS_MANAGE)
  updatePlan(
    @CurrentContext() ctx: RequestContext,
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
    assertPlatformAdmin(ctx);
    return this.modulesService.updatePlan(id, body);
  }

  @Get('companies')
  @UseGuards(RequireDeveloperGuard)
  @RequirePermissions(PLATFORM_PERMISSIONS.COMPANIES_READ)
  async listCompanies(@CurrentContext() ctx: RequestContext) {
    assertPlatformAdmin(ctx);
    const rows = await this.prisma.company.findMany({
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true,
        name: true,
        legalName: true,
        document: true,
        slug: true,
        email: true,
        phone: true,
        status: true,
      },
    });
    const enriched = await Promise.all(
      rows.map(async (item) => {
        const subscription = await this.prisma.companySubscription.findFirst({
          where: { companyId: item.id },
          orderBy: [{ startsAt: 'desc' }],
          include: { plan: true },
        });
        const overrideCount = await this.prisma.companyModuleOverride.count({
          where: { companyId: item.id, enabled: { not: null } },
        });
        const companyModulesView = await this.modulesService.getCompanyModulesView(item.id);
        const activeModules = companyModulesView.modules.filter((moduleItem) => moduleItem.effectiveEnabled).length;
        const blockedModules = Math.max(companyModulesView.modules.length - activeModules, 0);

        return {
          ...item,
          status: item.status as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED',
          subscriptionStatus: subscription?.status ?? null,
          planKey: subscription?.plan?.key ?? null,
          planName: subscription?.plan?.name ?? null,
          moduleStats: {
            totalInPlan: activeModules,
            blockedOrOff: blockedModules,
            overrides: overrideCount,
          },
        };
      }),
    );

    return enriched;
  }

  @Post('companies')
  @UseGuards(RequireDeveloperGuard)
  @RequirePermissions(PLATFORM_PERMISSIONS.COMPANIES_CREATE)
  async createCompany(
    @CurrentContext() ctx: RequestContext,
    @Body()
    body: {
      name: string;
      legalName: string;
      document?: string | null;
      slug?: string | null;
      email?: string | null;
      phone?: string | null;
      status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
    },
  ) {
    assertPlatformAdmin(ctx);
    const name = String(body?.name ?? '').trim();
    const legalName = String(body?.legalName ?? '').trim();
    const slug = String(body?.slug ?? '').trim().toLowerCase() || null;

    if (!name) {
      throw new BadRequestException('name obrigatorio.');
    }
    if (!legalName) {
      throw new BadRequestException('legalName obrigatorio.');
    }

    const created = await this.prisma.company.create({
      data: {
        name,
        tradeName: name,
        legalName,
        document: String(body?.document ?? '').trim() || null,
        slug,
        email: String(body?.email ?? '').trim() || null,
        phone: String(body?.phone ?? '').trim() || null,
        status: body?.status ?? 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
        legalName: true,
        document: true,
        slug: true,
        email: true,
        phone: true,
        status: true,
      },
    });

    return {
      ...created,
      status: created.status as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED',
    };
  }

  @Patch('companies/:companyId')
  @UseGuards(RequireDeveloperGuard)
  @RequirePermissions(PLATFORM_PERMISSIONS.COMPANIES_UPDATE)
  async updateCompany(
    @CurrentContext() ctx: RequestContext,
    @Param('companyId') companyId: string,
    @Body()
    body: Partial<{
      name: string;
      legalName: string;
      document: string | null;
      slug: string | null;
      email: string | null;
      phone: string | null;
      status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
    }>,
  ) {
    assertPlatformAdmin(ctx);
    const nextName = body.name !== undefined ? String(body.name).trim() : undefined;
    const nextLegalName = body.legalName !== undefined ? String(body.legalName).trim() : undefined;
    if (body.name !== undefined && !nextName) {
      throw new BadRequestException('name nao pode ser vazio.');
    }
    if (body.legalName !== undefined && !nextLegalName) {
      throw new BadRequestException('legalName nao pode ser vazio.');
    }

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        ...(nextName !== undefined ? { name: nextName } : {}),
        ...(nextLegalName !== undefined ? { legalName: nextLegalName } : {}),
        ...(body.document !== undefined ? { document: String(body.document ?? '').trim() || null } : {}),
        ...(body.slug !== undefined ? { slug: String(body.slug ?? '').trim().toLowerCase() || null } : {}),
        ...(body.email !== undefined ? { email: String(body.email ?? '').trim() || null } : {}),
        ...(body.phone !== undefined ? { phone: String(body.phone ?? '').trim() || null } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
      },
      select: {
        id: true,
        name: true,
        legalName: true,
        document: true,
        slug: true,
        email: true,
        phone: true,
        status: true,
      },
    });

    return {
      ...updated,
      status: updated.status as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED',
    };
  }

  @Get('companies/:companyId/modules')
  @UseGuards(RequireDeveloperGuard)
  @RequirePermissions(PLATFORM_PERMISSIONS.MODULES_MANAGE, PLATFORM_PERMISSIONS.COMPANIES_READ)
  getCompanyModules(
    @Param('companyId') companyId: string,
    @CurrentContext() ctx: RequestContext,
  ) {
    assertCompanyScope(ctx, companyId);
    return this.modulesService.getCompanyModulesView(companyId);
  }

  @Get('companies/:companyId/subscription')
  @UseGuards(RequireDeveloperGuard)
  @RequirePermissions(PLATFORM_PERMISSIONS.BILLING_READ, PLATFORM_PERMISSIONS.COMPANIES_READ)
  async getCompanySubscription(
    @Param('companyId') companyId: string,
    @CurrentContext() ctx: RequestContext,
  ) {
    assertCompanyScope(ctx, companyId);
    const subscription = await this.prisma.companySubscription.findFirst({
      where: { companyId },
      orderBy: [{ startsAt: 'desc' }],
      include: { plan: true },
    });

    if (!subscription) {
      return null;
    }

    return this.mapSubscription(subscription);
  }

  @Post('companies/:companyId/subscription')
  @UseGuards(RequireDeveloperGuard)
  @RequirePermissions(PLATFORM_PERMISSIONS.BILLING_MANAGE, PLATFORM_PERMISSIONS.COMPANIES_UPDATE)
  async createCompanySubscription(
    @Param('companyId') companyId: string,
    @CurrentContext() ctx: RequestContext,
    @Body()
    body: {
      planId: string;
      status: 'ACTIVE' | 'TRIAL' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';
      startsAt: string;
      endsAt?: string;
      trialEndsAt?: string;
    },
  ) {
    assertCompanyScope(ctx, companyId);
    const planId = String(body?.planId ?? '').trim();
    if (!planId) {
      throw new BadRequestException('planId obrigatorio.');
    }

    const created = await this.prisma.companySubscription.create({
      data: {
        companyId,
        planId,
        status: body.status,
        startsAt: new Date(body.startsAt),
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        trialEndsAt: body.trialEndsAt ? new Date(body.trialEndsAt) : null,
      },
      include: { plan: true },
    });

    return this.mapSubscription(created);
  }

  @Patch('companies/:companyId/subscription/:subscriptionId')
  @UseGuards(RequireDeveloperGuard)
  @RequirePermissions(PLATFORM_PERMISSIONS.BILLING_MANAGE, PLATFORM_PERMISSIONS.COMPANIES_UPDATE)
  async patchCompanySubscription(
    @Param('companyId') companyId: string,
    @Param('subscriptionId') subscriptionId: string,
    @CurrentContext() ctx: RequestContext,
    @Body()
    body: Partial<{
      status: 'ACTIVE' | 'TRIAL' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';
      endsAt: string | null;
      trialEndsAt: string | null;
    }>,
  ) {
    assertCompanyScope(ctx, companyId);
    const current = await this.prisma.companySubscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!current || current.companyId !== companyId) {
      throw new BadRequestException('Assinatura nao encontrada para a empresa.');
    }

    const updated = await this.prisma.companySubscription.update({
      where: { id: subscriptionId },
      data: {
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.endsAt !== undefined ? { endsAt: body.endsAt ? new Date(body.endsAt) : null } : {}),
        ...(body.trialEndsAt !== undefined
          ? { trialEndsAt: body.trialEndsAt ? new Date(body.trialEndsAt) : null }
          : {}),
      },
      include: { plan: true },
    });

    return this.mapSubscription(updated);
  }

  @Patch('companies/:companyId/modules/:moduleKey')
  @UseGuards(RequireDeveloperGuard)
  @RequirePermissions(PLATFORM_PERMISSIONS.MODULES_MANAGE, PLATFORM_PERMISSIONS.COMPANIES_UPDATE)
  updateCompanyModule(
    @Param('companyId') companyId: string,
    @Param('moduleKey') moduleKey: ModuleKey,
    @CurrentContext() ctx: RequestContext,
    @Body() body: { enabled: boolean },
  ) {
    assertCompanyScope(ctx, companyId);
    return this.modulesService.updateCompanyModuleOverride({
      companyId,
      moduleKey,
      enabled: Boolean(body?.enabled),
    });
  }

  private mapSubscription(subscription: {
    id: string;
    companyId: string;
    planId: string;
    status: 'ACTIVE' | 'TRIAL' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';
    startsAt: Date;
    endsAt: Date | null;
    trialEndsAt: Date | null;
    plan: { id: string; key: string; name: string };
  }) {
    return {
      id: subscription.id,
      companyId: subscription.companyId,
      planId: subscription.planId,
      status: subscription.status,
      startsAt: subscription.startsAt.toISOString(),
      endsAt: subscription.endsAt?.toISOString() ?? null,
      trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
      plan: {
        id: subscription.plan.id,
        key: subscription.plan.key,
        name: subscription.plan.name,
      },
    };
  }
}
