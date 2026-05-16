import type { RequestContext } from './request-context';

export const TENANT_ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MASTER: 'master',
  MANAGER: 'manager',
  CASHIER: 'cashier',
  KITCHEN: 'kitchen',
  WAITER: 'waiter',
  DELIVERY_OPERATOR: 'delivery_operator',
  FINANCE: 'finance',
  INVENTORY: 'inventory',
  SUPPORT: 'support',
  USER: 'user',
  DEVELOPER: 'developer',
} as const;

export type TenantRole = (typeof TENANT_ROLES)[keyof typeof TENANT_ROLES];

export const PLATFORM_PERMISSIONS = {
  ADMIN: 'platform:admin',
  ALL: '*',
  COMPANIES_READ: 'platform:companies:read',
  COMPANIES_CREATE: 'platform:companies:create',
  COMPANIES_UPDATE: 'platform:companies:update',
  PLANS_MANAGE: 'platform:plans:manage',
  MODULES_MANAGE: 'platform:modules:manage',
  BILLING_READ: 'platform:billing:read',
  BILLING_MANAGE: 'platform:billing:manage',
  USERS_SUPPORT: 'platform:users:support',
} as const;

export type PlatformPermission =
  (typeof PLATFORM_PERMISSIONS)[keyof typeof PLATFORM_PERMISSIONS];

export const TENANT_PERMISSIONS = {
  ADMIN_USERS_READ: 'admin.users.read',
  ADMIN_USERS_WRITE: 'admin.users.write',
  SETTINGS_READ: 'settings.read',
  SETTINGS_WRITE: 'settings.write',
  BILLING_READ: 'billing.read',
  BILLING_MANAGE: 'billing.manage',
  ORDERS_READ: 'orders.read',
  ORDERS_MANAGE: 'orders.manage',
  MODULES_READ: 'modules.read',
  MODULES_MANAGE: 'modules.manage',
  CATALOG_READ: 'catalog.read',
  CATALOG_MANAGE: 'catalog.manage',
  RECIPE_READ: 'recipe.read',
  RECIPE_MANAGE: 'recipe.manage',
  PRODUCTION_READ: 'production.read',
  PRODUCTION_MANAGE: 'production.manage',
  COST_READ: 'cost.read',
  PDV_OPERATE: 'pdv.operate',
  KDS_OPERATE: 'kds.operate',
  WAITER_OPERATE: 'waiter.operate',
  DELIVERY_OPERATE: 'delivery.operate',
  INVENTORY_READ: 'inventory.read',
  INVENTORY_MANAGE: 'inventory.manage',
  PROCUREMENT_READ: 'procurement.read',
  PROCUREMENT_MANAGE: 'procurement.manage',
  SUPPLIERS_READ: 'suppliers.read',
  SUPPLIERS_MANAGE: 'suppliers.manage',
  FINANCE_READ: 'finance.read',
  FINANCE_MANAGE: 'finance.manage',
  FINANCE_REPORTS: 'finance.reports',
  FINANCE_RECONCILE: 'finance.reconcile',
  ACCOUNTS_PAYABLE_READ: 'accounts_payable.read',
  ACCOUNTS_PAYABLE_MANAGE: 'accounts_payable.manage',
  ACCOUNTS_RECEIVABLE_READ: 'accounts_receivable.read',
  ACCOUNTS_RECEIVABLE_MANAGE: 'accounts_receivable.manage',
  CASH_FLOW_READ: 'cash_flow.read',
  DRE_READ: 'dre.read',
  CMV_READ: 'cmv.read',
  CMV_MANAGE: 'cmv.manage',
  FINANCIAL_CATEGORIES_MANAGE: 'financial_categories.manage',
  COST_CENTERS_MANAGE: 'cost_centers.manage',
} as const;

export type TenantPermission = (typeof TENANT_PERMISSIONS)[keyof typeof TENANT_PERMISSIONS];
export type PermissionCode = PlatformPermission | TenantPermission;

export const TENANT_ADMIN_ROLES: TenantRole[] = [
  TENANT_ROLES.OWNER,
  TENANT_ROLES.ADMIN,
  TENANT_ROLES.MASTER,
  TENANT_ROLES.MANAGER,
];

export const TENANT_OPERATIONAL_ROLES: TenantRole[] = [
  TENANT_ROLES.CASHIER,
  TENANT_ROLES.KITCHEN,
  TENANT_ROLES.WAITER,
  TENANT_ROLES.DELIVERY_OPERATOR,
];

export function isTenantAdminRole(role?: string): role is TenantRole {
  if (!role) return false;
  return TENANT_ADMIN_ROLES.includes(role as TenantRole);
}

export function hasAnyPermission(
  ctx: Pick<RequestContext, 'permissions'>,
  required: readonly string[],
): boolean {
  const granted = new Set(ctx.permissions ?? []);
  if (granted.has(PLATFORM_PERMISSIONS.ALL)) return true;
  return required.some((permission) => granted.has(permission));
}

export function isTechnicalAdminSource(ctx: Pick<RequestContext, 'source'>): boolean {
  return ctx.source === 'technical-admin';
}
