import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type {
  CompanyModuleAccess,
  ModuleAccessResult,
  ModuleDefinition,
  ModuleKey,
  PlanKey,
} from '@delivery-futuro/shared-types';

const MODULE_META: Record<ModuleKey, { name: string; description: string; enabledByDefault: boolean; adminOnly: boolean }> = {
  delivery: { name: 'Delivery', description: 'Cardapio online e pedidos.', enabledByDefault: true, adminOnly: false },
  pdv: { name: 'PDV/Balcao', description: 'Operacao de caixa e vendas presenciais.', enabledByDefault: true, adminOnly: true },
  kds: { name: 'KDS Cozinha', description: 'Gestao de cozinha e preparo.', enabledByDefault: true, adminOnly: true },
  whatsapp: { name: 'WhatsApp', description: 'Atendimento e notificacoes.', enabledByDefault: false, adminOnly: false },
  kiosk: { name: 'Totem/Kiosk', description: 'Autoatendimento em totem.', enabledByDefault: false, adminOnly: false },
  waiter_app: { name: 'App Garcom', description: 'Fluxo de garcom digital.', enabledByDefault: false, adminOnly: false },
  admin_panel: { name: 'Painel Admin', description: 'Acesso ao painel administrativo.', enabledByDefault: true, adminOnly: true },
  orders: { name: 'Pedidos', description: 'Gestao de pedidos e status.', enabledByDefault: true, adminOnly: false },
  menu: { name: 'Cardapio', description: 'Gestao de itens e categorias.', enabledByDefault: true, adminOnly: false },
  payments: { name: 'Pagamentos', description: 'Processamento de pagamentos.', enabledByDefault: true, adminOnly: false },
  reports: { name: 'Relatorios', description: 'Indicadores e performance.', enabledByDefault: false, adminOnly: true },
  stock: { name: 'Estoque', description: 'Controle de estoque.', enabledByDefault: false, adminOnly: true },
  fiscal: { name: 'Fiscal', description: 'Rotinas fiscais.', enabledByDefault: false, adminOnly: true },
  financial: { name: 'Financeiro', description: 'Fluxo financeiro.', enabledByDefault: false, adminOnly: true },
};

@Injectable()
export class ModulesService {
  constructor(private readonly prisma: PrismaService) {}

  async listAvailableModules(): Promise<ModuleDefinition[]> {
    return (Object.keys(MODULE_META) as ModuleKey[]).map((key) => ({
      key,
      name: MODULE_META[key].name,
      enabledByDefault: MODULE_META[key].enabledByDefault,
      adminOnly: MODULE_META[key].adminOnly,
    }));
  }

  async listPlans() {
    const plans = await this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: [{ key: 'asc' }],
      include: {
        modules: { orderBy: [{ moduleKey: 'asc' }] },
        limits: { orderBy: [{ limitKey: 'asc' }] },
      },
    });

    return plans.map((plan) => ({
      id: plan.id,
      key: plan.key,
      name: plan.name,
      description: plan.description,
      isActive: plan.isActive,
      modules: plan.modules.map((item) => ({
        moduleKey: item.moduleKey,
        enabled: item.enabled,
        adminOnly: item.adminOnly,
      })),
      limits: plan.limits.map((item) => ({
        limitKey: item.limitKey,
        limitValue: item.limitValue,
      })),
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt.toISOString(),
    }));
  }

  async createPlan(input: {
    key: string;
    name: string;
    description?: string;
    modules?: Array<{ moduleKey: ModuleKey; enabled?: boolean; adminOnly?: boolean }>;
    limits?: Array<{ limitKey: string; limitValue: number }>;
  }) {
    const key = String(input.key ?? '').trim().toLowerCase();
    const name = String(input.name ?? '').trim();
    if (!key || !name) {
      throw new BadRequestException('key e name sao obrigatorios.');
    }
    this.assertUniqueAndValidPlanModules(input.modules);
    this.assertValidPlanLimits(input.limits);

    const created = await this.prisma.plan.create({
      data: {
        key,
        name,
        description: input.description?.trim() || null,
        modules: input.modules?.length
          ? {
              createMany: {
                data: input.modules.map((item) => ({
                  moduleKey: item.moduleKey,
                  enabled: item.enabled ?? true,
                  adminOnly: item.adminOnly ?? MODULE_META[item.moduleKey].adminOnly,
                })),
              },
            }
          : undefined,
        limits: input.limits?.length
          ? {
              createMany: {
                data: input.limits.map((item) => ({
                  limitKey: item.limitKey,
                  limitValue: item.limitValue,
                })),
              },
            }
          : undefined,
      },
      include: {
        modules: true,
        limits: true,
      },
    });

    return {
      id: created.id,
      key: created.key,
      name: created.name,
      description: created.description,
      isActive: created.isActive,
      modules: created.modules,
      limits: created.limits,
    };
  }

  async updatePlan(
    id: string,
    input: {
      name?: string;
      description?: string | null;
      isActive?: boolean;
      modules?: Array<{ moduleKey: ModuleKey; enabled?: boolean; adminOnly?: boolean }>;
      limits?: Array<{ limitKey: string; limitValue: number }>;
    },
  ) {
    const existing = await this.prisma.plan.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Plano '${id}' nao encontrado.`);
    }
    this.assertUniqueAndValidPlanModules(input.modules);
    this.assertValidPlanLimits(input.limits);

    await this.prisma.$transaction(async (tx) => {
      await tx.plan.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: String(input.name).trim() } : {}),
          ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
          ...(input.isActive !== undefined ? { isActive: Boolean(input.isActive) } : {}),
        },
      });

      if (input.modules) {
        await tx.planModule.deleteMany({ where: { planId: id } });
        if (input.modules.length > 0) {
          await tx.planModule.createMany({
            data: input.modules.map((item) => ({
              planId: id,
              moduleKey: item.moduleKey,
              enabled: item.enabled ?? true,
              adminOnly: item.adminOnly ?? MODULE_META[item.moduleKey].adminOnly,
            })),
          });
        }
      }

      if (input.limits) {
        await tx.planLimit.deleteMany({ where: { planId: id } });
        if (input.limits.length > 0) {
          await tx.planLimit.createMany({
            data: input.limits.map((item) => ({
              planId: id,
              limitKey: item.limitKey,
              limitValue: item.limitValue,
            })),
          });
        }
      }
    });

    const updated = await this.prisma.plan.findUniqueOrThrow({
      where: { id },
      include: { modules: true, limits: true },
    });

    return {
      id: updated.id,
      key: updated.key,
      name: updated.name,
      description: updated.description,
      isActive: updated.isActive,
      modules: updated.modules,
      limits: updated.limits,
    };
  }

  async listCurrentCompanyModules(companyId: string): Promise<CompanyModuleAccess[]> {
    const modules = await this.listAvailableModules();
    const subscription = await this.resolveActiveSubscription(companyId);
    const overrideRows = await this.prisma.companyModuleOverride.findMany({
      where: { companyId },
    });
    const overrideMap = new Map(
      overrideRows
        .filter((item): item is typeof item & { enabled: boolean } => item.enabled !== null)
        .map((item) => [item.moduleKey, item.enabled]),
    );

    const planModuleRows = subscription
      ? await this.prisma.planModule.findMany({
          where: {
            planId: subscription.planId,
            enabled: true,
          },
        })
      : [];

    const planSet = new Set(planModuleRows.map((item) => item.moduleKey as ModuleKey));
    const planKey = subscription?.plan?.key ? (subscription.plan.key as PlanKey) : undefined;

    return modules.map((moduleDef) => {
      const fromPlan = planSet.has(moduleDef.key);
      const override = overrideMap.get(moduleDef.key);

      if (override !== undefined) {
        return {
          companyId,
          moduleKey: moduleDef.key,
          enabled: fromPlan ? override : false,
          adminOnly: moduleDef.adminOnly,
          enabledByDefault: moduleDef.enabledByDefault,
          source: 'company_override',
          planKey,
        } satisfies CompanyModuleAccess;
      }

      return {
        companyId,
        moduleKey: moduleDef.key,
        enabled: fromPlan,
        adminOnly: moduleDef.adminOnly,
        enabledByDefault: moduleDef.enabledByDefault,
        source: 'plan',
        planKey,
      } satisfies CompanyModuleAccess;
    });
  }

  async checkAccess(input: {
    companyId: string;
    moduleKey: ModuleKey;
    isAdmin: boolean;
  }): Promise<ModuleAccessResult> {
    const moduleDef = MODULE_META[input.moduleKey];
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
    const current = companyModules.find((item) => item.moduleKey === input.moduleKey);

    if (!current || !current.enabled) {
      return {
        companyId: input.companyId,
        moduleKey: input.moduleKey,
        allowed: false,
        reason: current?.source === 'company_override' ? 'BLOCKED_COMPANY_OVERRIDE' : 'BLOCKED_NOT_ENABLED',
        adminOnly: moduleDef.adminOnly,
        enabledByDefault: moduleDef.enabledByDefault,
        source: current?.source ?? 'plan',
        planKey: current?.planKey,
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
        source: current.source,
        planKey: current.planKey,
      };
    }

    return {
      companyId: input.companyId,
      moduleKey: input.moduleKey,
      allowed: true,
      reason: current.source === 'company_override' ? 'ALLOWED_COMPANY_OVERRIDE' : 'ALLOWED_PLAN',
      adminOnly: moduleDef.adminOnly,
      enabledByDefault: moduleDef.enabledByDefault,
      source: current.source,
      planKey: current.planKey,
    };
  }

  async updateCompanyModuleOverride(input: {
    companyId: string;
    moduleKey: ModuleKey;
    enabled: boolean;
  }): Promise<CompanyModuleAccess> {
    const moduleDef = MODULE_META[input.moduleKey];
    if (!moduleDef) {
      throw new BadRequestException(`Modulo '${input.moduleKey}' nao cadastrado na V2.`);
    }

    const subscription = await this.resolveActiveSubscription(input.companyId);
    if (!subscription) {
      throw new BadRequestException('Empresa sem assinatura ativa para aplicar override.');
    }

    const planHasModule = await this.prisma.planModule.findFirst({
      where: {
        planId: subscription.planId,
        moduleKey: input.moduleKey,
        enabled: true,
      },
      select: { id: true },
    });

    if (input.enabled && !planHasModule) {
      throw new BadRequestException(`Modulo '${input.moduleKey}' nao esta disponivel no plano atual da empresa.`);
    }

    await this.prisma.companyModuleOverride.upsert({
      where: {
        companyId_moduleKey: {
          companyId: input.companyId,
          moduleKey: input.moduleKey,
        },
      },
      create: {
        companyId: input.companyId,
        moduleKey: input.moduleKey,
        enabled: input.enabled,
      },
      update: {
        enabled: input.enabled,
      },
    });

    const list = await this.listCurrentCompanyModules(input.companyId);
    const updated = list.find((item) => item.moduleKey === input.moduleKey);
    if (!updated) {
      throw new NotFoundException(`Falha ao carregar modulo '${input.moduleKey}' apos override.`);
    }
    return updated;
  }

  async updateCurrentCompanyModule(input: {
    companyId: string;
    moduleKey: ModuleKey;
    enabled: boolean;
  }): Promise<CompanyModuleAccess> {
    return this.updateCompanyModuleOverride(input);
  }

  private async resolveActiveSubscription(companyId: string) {
    return this.prisma.companySubscription.findFirst({
      where: {
        companyId,
        status: { in: ['ACTIVE', 'TRIAL'] },
      },
      orderBy: [{ startsAt: 'desc' }],
      include: { plan: true },
    });
  }

  async getCompanyModulesView(companyId: string) {
    const subscription = await this.prisma.companySubscription.findFirst({
      where: { companyId },
      orderBy: [{ startsAt: 'desc' }],
      include: { plan: true },
    });
    const hasActiveSubscription = subscription?.status === 'ACTIVE' || subscription?.status === 'TRIAL';
    const planModuleRows = subscription
      ? await this.prisma.planModule.findMany({
          where: {
            planId: subscription.planId,
            enabled: true,
          },
        })
      : [];
    const planSet = new Set(planModuleRows.map((item) => item.moduleKey as ModuleKey));
    const overrideRows = await this.prisma.companyModuleOverride.findMany({
      where: { companyId },
    });
    const overrideMap = new Map(overrideRows.map((item) => [item.moduleKey as ModuleKey, item.enabled]));
    const moduleDefs = await this.listAvailableModules();

    return {
      company: await this.prisma.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { id: true, name: true, legalName: true, document: true, slug: true, status: true },
      }),
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            planId: subscription.planId,
            startsAt: subscription.startsAt.toISOString(),
            endsAt: subscription.endsAt?.toISOString() ?? null,
            trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
          }
        : null,
      plan: subscription?.plan ? { id: subscription.plan.id, key: subscription.plan.key, name: subscription.plan.name } : null,
      modules: moduleDefs.map((item) => ({
        moduleKey: item.key,
        key: item.key,
        label: item.name,
        description: MODULE_META[item.key].description,
        includedInPlan: planSet.has(item.key),
        overrideEnabled: overrideMap.get(item.key) ?? null,
        effectiveEnabled: hasActiveSubscription
          ? (overrideMap.get(item.key) ?? null) !== null
            ? Boolean(overrideMap.get(item.key))
            : planSet.has(item.key)
          : false,
        source: (overrideMap.get(item.key) ?? null) !== null ? 'override' : 'plan',
        planKey: subscription?.plan?.key ?? null,
        blockedReason: hasActiveSubscription ? null : 'ASSINATURA_INATIVA',
        adminOnly: item.adminOnly,
        enabledByDefault: item.enabledByDefault,
      })),
    };
  }

  private assertUniqueAndValidPlanModules(
    modules?: Array<{ moduleKey: ModuleKey; enabled?: boolean; adminOnly?: boolean }>,
  ): void {
    if (!modules) return;
    const seen = new Set<string>();
    let enabledCount = 0;
    for (const item of modules) {
      const moduleKey = String(item?.moduleKey ?? '').trim() as ModuleKey;
      if (!moduleKey) {
        throw new BadRequestException('moduleKey obrigatorio na configuracao do plano.');
      }
      if (!MODULE_META[moduleKey]) {
        throw new BadRequestException(`Modulo '${moduleKey}' nao cadastrado na V2.`);
      }
      if (seen.has(moduleKey)) {
        throw new BadRequestException(`Modulo '${moduleKey}' duplicado na configuracao do plano.`);
      }
      seen.add(moduleKey);
      if (item.enabled ?? true) {
        enabledCount += 1;
      }
    }
    if (modules.length > 0 && enabledCount === 0) {
      throw new BadRequestException('Plano deve possuir ao menos um modulo habilitado.');
    }
  }

  private assertValidPlanLimits(
    limits?: Array<{ limitKey: string; limitValue: number }>,
  ): void {
    if (!limits) return;
    const seen = new Set<string>();
    for (const item of limits) {
      const key = String(item?.limitKey ?? '').trim();
      const value = Number(item?.limitValue);
      if (!key) {
        throw new BadRequestException('limitKey obrigatorio na configuracao do plano.');
      }
      if (!Number.isFinite(value) || value < 0) {
        throw new BadRequestException(`limitValue invalido para '${key}'.`);
      }
      if (seen.has(key)) {
        throw new BadRequestException(`limitKey '${key}' duplicado na configuracao do plano.`);
      }
      seen.add(key);
    }
  }
}
