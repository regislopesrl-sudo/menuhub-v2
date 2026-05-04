import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type {
  CompanyModuleAccess,
  ModuleAccessResult,
  ModuleDefinition,
  ModuleKey,
  PlanKey,
} from '@delivery-futuro/shared-types';
import type { CompanySubscription, SubscriptionStatus } from '@prisma/client';
import { computeEffectiveModule } from './domain/compute-effective-module';
import { canUseModules } from '../subscriptions/domain/can-use-modules';

interface ModuleStateRow {
  moduleKey: ModuleKey;
  includedInPlan: boolean;
  overrideEnabled: boolean | null;
  effectiveEnabled: boolean;
  source: 'plan' | 'override';
  adminOnly: boolean;
  enabledByDefault: boolean;
}

export interface CompanyModulesCommercialView {
  company: {
    id: string;
    name: string;
    legalName: string;
    document: string | null;
    slug: string | null;
    status: string;
  };
  subscription: {
    id: string;
    status: SubscriptionStatus;
    startsAt: string;
    endsAt: string | null;
    trialEndsAt: string | null;
  } | null;
  plan: {
    id: string;
    key: string;
    name: string;
  } | null;
  modules: ModuleStateRow[];
}

const MODULE_CATALOG: ModuleDefinition[] = [
  { key: 'delivery', name: 'Delivery', enabledByDefault: true, adminOnly: false },
  { key: 'pdv', name: 'PDV/Balcao', enabledByDefault: true, adminOnly: true },
  { key: 'kds', name: 'KDS Cozinha', enabledByDefault: true, adminOnly: true },
  { key: 'whatsapp', name: 'WhatsApp', enabledByDefault: false, adminOnly: false },
  { key: 'kiosk', name: 'Totem/Kiosk', enabledByDefault: false, adminOnly: false },
  { key: 'waiter_app', name: 'App Garcom', enabledByDefault: false, adminOnly: false },
  { key: 'admin_panel', name: 'Painel Admin', enabledByDefault: true, adminOnly: true },
  { key: 'orders', name: 'Pedidos', enabledByDefault: true, adminOnly: false },
  { key: 'menu', name: 'Cardapio', enabledByDefault: true, adminOnly: false },
  { key: 'payments', name: 'Pagamentos', enabledByDefault: true, adminOnly: false },
  { key: 'reports', name: 'Relatorios', enabledByDefault: false, adminOnly: true },
  { key: 'stock', name: 'Estoque', enabledByDefault: false, adminOnly: true },
  { key: 'fiscal', name: 'Fiscal', enabledByDefault: false, adminOnly: true },
  { key: 'financial', name: 'Financeiro', enabledByDefault: false, adminOnly: true },
];

@Injectable()
export class ModulesService {
  constructor(private readonly prisma: PrismaService) {}

  async listAvailableModules(): Promise<ModuleDefinition[]> {
    return MODULE_CATALOG;
  }

  async listCurrentCompanyModules(companyId: string): Promise<CompanyModuleAccess[]> {
    const commercialView = await this.getCompanyModulesView(companyId);
    const subscriptionAllowed = canUseModules(commercialView.subscription?.status);

    return commercialView.modules.map((moduleItem) => ({
      companyId,
      moduleKey: moduleItem.moduleKey,
      enabled: subscriptionAllowed ? moduleItem.effectiveEnabled : false,
      adminOnly: moduleItem.adminOnly,
      enabledByDefault: moduleItem.enabledByDefault,
      source: moduleItem.source === 'override' ? 'company_override' : 'plan',
      planKey: toPlanKey(commercialView.plan?.key),
    }));
  }

  async getCompanyModulesView(companyId: string): Promise<CompanyModulesCommercialView> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        legalName: true,
        document: true,
        slug: true,
        status: true,
      },
    });

    if (!company) {
      throw new NotFoundException(`Empresa '${companyId}' nao encontrada.`);
    }

    const subscription = await this.getCurrentSubscription(companyId);
    const plan = subscription
      ? await this.prisma.plan.findUnique({
          where: { id: subscription.planId },
          select: { id: true, key: true, name: true },
        })
      : null;

    const planModules = subscription
      ? await this.prisma.planModule.findMany({
          where: { planId: subscription.planId, enabled: true },
          select: { moduleKey: true },
        })
      : [];

    const planSet = new Set(planModules.map((item) => item.moduleKey));
    const overrides = await this.prisma.companyModuleOverride.findMany({
      where: { companyId },
      select: { moduleKey: true, enabled: true },
    });
    const overrideMap = new Map(overrides.map((item) => [item.moduleKey, item.enabled]));

    const modules: ModuleStateRow[] = MODULE_CATALOG.map((moduleDef) => {
      const includedInPlan = planSet.has(moduleDef.key);
      const overrideEnabled = overrideMap.has(moduleDef.key) ? (overrideMap.get(moduleDef.key) ?? null) : null;
      const baseEnabled = includedInPlan || moduleDef.enabledByDefault;
      const effectiveEnabled = computeEffectiveModule({
        planEnabled: baseEnabled,
        override: overrideEnabled,
      });

      return {
        moduleKey: moduleDef.key,
        includedInPlan,
        overrideEnabled,
        effectiveEnabled,
        source: overrideEnabled !== null ? 'override' : 'plan',
        adminOnly: moduleDef.adminOnly,
        enabledByDefault: moduleDef.enabledByDefault,
      };
    });

    return {
      company: {
        id: company.id,
        name: company.name ?? company.legalName,
        legalName: company.legalName,
        document: company.document,
        slug: company.slug,
        status: company.status,
      },
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            startsAt: subscription.startsAt.toISOString(),
            endsAt: subscription.endsAt ? subscription.endsAt.toISOString() : null,
            trialEndsAt: subscription.trialEndsAt ? subscription.trialEndsAt.toISOString() : null,
          }
        : null,
      plan,
      modules,
    };
  }

  async checkAccess(input: {
    companyId: string;
    moduleKey: ModuleKey;
    isAdmin: boolean;
  }): Promise<ModuleAccessResult> {
    const moduleDef = MODULE_CATALOG.find((item) => item.key === input.moduleKey);

    if (!moduleDef) {
      return {
        companyId: input.companyId,
        moduleKey: input.moduleKey,
        allowed: false,
        reason: 'MODULE_NOT_FOUND',
        adminOnly: false,
        enabledByDefault: false,
        source: 'not_found',
      };
    }

    const companyModules = await this.listCurrentCompanyModules(input.companyId);
    const companyModule = companyModules.find((item) => item.moduleKey === input.moduleKey);
    const enabled = companyModule?.enabled ?? false;

    if (!enabled) {
      return {
        companyId: input.companyId,
        moduleKey: input.moduleKey,
        allowed: false,
        reason: companyModule?.source === 'company_override' ? 'BLOCKED_COMPANY_OVERRIDE' : 'BLOCKED_NOT_ENABLED',
        adminOnly: moduleDef.adminOnly,
        enabledByDefault: moduleDef.enabledByDefault,
        source: companyModule?.source ?? 'default',
        planKey: companyModule?.planKey,
      };
    }

    if (moduleDef.adminOnly && !input.isAdmin) {
      return {
        companyId: input.companyId,
        moduleKey: input.moduleKey,
        allowed: false,
        reason: 'BLOCKED_ADMIN_ONLY',
        adminOnly: moduleDef.adminOnly,
        enabledByDefault: moduleDef.enabledByDefault,
        source: companyModule?.source ?? 'default',
        planKey: companyModule?.planKey,
      };
    }

    return {
      companyId: input.companyId,
      moduleKey: input.moduleKey,
      allowed: true,
      reason:
        companyModule?.source === 'company_override'
          ? 'ALLOWED_COMPANY_OVERRIDE'
          : companyModule?.source === 'plan'
            ? 'ALLOWED_PLAN'
            : 'ALLOWED_DEFAULT',
      adminOnly: moduleDef.adminOnly,
      enabledByDefault: moduleDef.enabledByDefault,
      source: companyModule?.source ?? 'default',
      planKey: companyModule?.planKey,
    };
  }

  async updateCurrentCompanyModule(input: {
    companyId: string;
    moduleKey: ModuleKey;
    enabled: boolean | null;
    reason?: string;
    userId?: string;
  }): Promise<CompanyModuleAccess> {
    const moduleDef = MODULE_CATALOG.find((item) => item.key === input.moduleKey);
    if (!moduleDef) {
      throw new Error(`Modulo '${input.moduleKey}' nao cadastrado na V2.`);
    }

    if (input.enabled === null) {
      await this.prisma.companyModuleOverride.deleteMany({
        where: { companyId: input.companyId, moduleKey: input.moduleKey },
      });
    } else {
      await this.prisma.companyModuleOverride.upsert({
        where: {
          companyId_moduleKey: {
            companyId: input.companyId,
            moduleKey: input.moduleKey,
          },
        },
        update: { enabled: input.enabled },
        create: {
          companyId: input.companyId,
          moduleKey: input.moduleKey,
          enabled: input.enabled,
        },
      });
    }

    await this.prisma.companyModuleAuditLog.create({
      data: {
        companyId: input.companyId,
        moduleKey: input.moduleKey,
        action: input.enabled === false ? 'DISABLE' : 'ENABLE',
        source: input.enabled === null ? 'PLAN' : 'OVERRIDE',
        userId: input.userId,
        reason: input.reason,
      },
    });

    const list = await this.listCurrentCompanyModules(input.companyId);
    const updated = list.find((item) => item.moduleKey === input.moduleKey);
    if (!updated) {
      throw new Error(`Falha ao atualizar modulo '${input.moduleKey}'.`);
    }
    return updated;
  }

  private async getCurrentSubscription(companyId: string): Promise<CompanySubscription | null> {
    return this.prisma.companySubscription.findFirst({
      where: {
        companyId,
        status: {
          in: ['ACTIVE', 'TRIAL', 'PAST_DUE', 'CANCELED', 'EXPIRED'],
        },
      },
      orderBy: {
        startsAt: 'desc',
      },
    });
  }
}

function toPlanKey(value?: string): PlanKey | undefined {
  if (value === 'starter') {
    return 'basic';
  }
  if (value === 'basic' || value === 'pro' || value === 'enterprise') {
    return value;
  }
  return undefined;
}
