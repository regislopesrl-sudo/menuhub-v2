export type ModuleKey =
  | 'delivery'
  | 'whatsapp'
  | 'kiosk'
  | 'waiter_app'
  | 'admin_panel'
  | 'orders'
  | 'menu'
  | 'payments'
  | 'reports'
  | 'stock'
  | 'fiscal'
  | 'financial';

export type PlanKey = 'basic' | 'pro' | 'enterprise';

export interface ModuleDefinition {
  key: ModuleKey;
  name: string;
  enabledByDefault: boolean;
  adminOnly: boolean;
}

export interface CompanyModuleAccess {
  companyId: string;
  moduleKey: ModuleKey;
  enabled: boolean;
  adminOnly: boolean;
  enabledByDefault: boolean;
  source: 'company_override' | 'plan' | 'default';
  planKey?: PlanKey;
}

export interface ModuleAccessResult {
  companyId: string;
  moduleKey: ModuleKey;
  allowed: boolean;
  reason:
    | 'ALLOWED_COMPANY_OVERRIDE'
    | 'ALLOWED_PLAN'
    | 'ALLOWED_DEFAULT'
    | 'BLOCKED_COMPANY_OVERRIDE'
    | 'BLOCKED_ADMIN_ONLY'
    | 'BLOCKED_NOT_ENABLED'
    | 'MODULE_NOT_FOUND';
  adminOnly: boolean;
  enabledByDefault: boolean;
  source: CompanyModuleAccess['source'] | 'not_found';
  planKey?: PlanKey;
}
