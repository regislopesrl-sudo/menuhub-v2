import { Injectable } from '@nestjs/common';
import type {
  CompanyModuleAccess,
  ModuleAccessResult,
  ModuleDefinition,
  ModuleKey,
  PlanKey,
} from '@delivery-futuro/shared-types';

interface CompanyProfile {
  companyId: string;
  planKey?: PlanKey;
}

interface CompanyModuleOverride {
  companyId: string;
  moduleKey: ModuleKey;
  enabled: boolean;
}

interface ModuleAccessRepository {
  listModules(): Promise<ModuleDefinition[]>;
  getCompanyProfile(companyId: string): Promise<CompanyProfile>;
  listCompanyModuleOverrides(companyId: string): Promise<CompanyModuleOverride[]>;
  listPlanModules(planKey: PlanKey): Promise<ModuleKey[]>;
}

class InMemoryModuleAccessRepository implements ModuleAccessRepository {
  private readonly modules: ModuleDefinition[] = [
    { key: 'delivery', name: 'Delivery', enabledByDefault: true, adminOnly: false },
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

  private readonly companyProfiles = new Map<string, CompanyProfile>([
    ['default-company', { companyId: 'default-company', planKey: 'basic' }],
    ['company-pro', { companyId: 'company-pro', planKey: 'pro' }],
    ['company-enterprise', { companyId: 'company-enterprise', planKey: 'enterprise' }],
  ]);

  private readonly planModules: Record<PlanKey, ModuleKey[]> = {
    basic: ['delivery', 'orders', 'menu', 'payments'],
    pro: ['delivery', 'orders', 'menu', 'payments', 'whatsapp', 'kiosk', 'waiter_app', 'reports'],
    enterprise: [
      'delivery',
      'orders',
      'menu',
      'payments',
      'whatsapp',
      'kiosk',
      'waiter_app',
      'admin_panel',
      'reports',
      'stock',
      'fiscal',
      'financial',
    ],
  };

  private readonly companyOverrides: CompanyModuleOverride[] = [
    { companyId: 'default-company', moduleKey: 'delivery', enabled: true },
    { companyId: 'company-pro', moduleKey: 'whatsapp', enabled: false },
  ];

  async listModules(): Promise<ModuleDefinition[]> {
    return this.modules;
  }

  async getCompanyProfile(companyId: string): Promise<CompanyProfile> {
    return this.companyProfiles.get(companyId) ?? { companyId };
  }

  async listCompanyModuleOverrides(companyId: string): Promise<CompanyModuleOverride[]> {
    return this.companyOverrides.filter((item) => item.companyId === companyId);
  }

  async listPlanModules(planKey: PlanKey): Promise<ModuleKey[]> {
    return this.planModules[planKey] ?? [];
  }
}

@Injectable()
export class ModulesService {
  private readonly repository: ModuleAccessRepository = new InMemoryModuleAccessRepository();

  async listAvailableModules() {
    return this.repository.listModules();
  }

  async listCurrentCompanyModules(companyId: string): Promise<CompanyModuleAccess[]> {
    const modules = await this.repository.listModules();
    const profile = await this.repository.getCompanyProfile(companyId);
    const overrides = await this.repository.listCompanyModuleOverrides(companyId);
    const overrideMap = new Map(overrides.map((o) => [o.moduleKey, o]));
    const planModules = profile.planKey ? await this.repository.listPlanModules(profile.planKey) : [];

    return modules.map((moduleDef) => {
      const override = overrideMap.get(moduleDef.key);
      if (override) {
        return {
          companyId,
          moduleKey: moduleDef.key,
          enabled: override.enabled,
          adminOnly: moduleDef.adminOnly,
          enabledByDefault: moduleDef.enabledByDefault,
          source: 'company_override',
          planKey: profile.planKey,
        } satisfies CompanyModuleAccess;
      }

      if (planModules.includes(moduleDef.key)) {
        return {
          companyId,
          moduleKey: moduleDef.key,
          enabled: true,
          adminOnly: moduleDef.adminOnly,
          enabledByDefault: moduleDef.enabledByDefault,
          source: 'plan',
          planKey: profile.planKey,
        } satisfies CompanyModuleAccess;
      }

      return {
        companyId,
        moduleKey: moduleDef.key,
        enabled: moduleDef.enabledByDefault,
        adminOnly: moduleDef.adminOnly,
        enabledByDefault: moduleDef.enabledByDefault,
        source: 'default',
        planKey: profile.planKey,
      } satisfies CompanyModuleAccess;
    });
  }

  async checkAccess(input: {
    companyId: string;
    moduleKey: ModuleKey;
    isAdmin: boolean;
  }): Promise<ModuleAccessResult> {
    const modules = await this.repository.listModules();
    const moduleDef = modules.find((item) => item.key === input.moduleKey);

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
    const enabled = companyModule?.enabled ?? moduleDef.enabledByDefault;

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
}
