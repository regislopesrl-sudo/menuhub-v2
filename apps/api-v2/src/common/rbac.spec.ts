import { PLATFORM_PERMISSIONS, TENANT_ROLES, hasAnyPermission, isTenantAdminRole, isTechnicalAdminSource } from './rbac';

describe('rbac helpers', () => {
  it('isTenantAdminRole identifica owner/manager', () => {
    expect(isTenantAdminRole(TENANT_ROLES.OWNER)).toBe(true);
    expect(isTenantAdminRole(TENANT_ROLES.MANAGER)).toBe(true);
  });

  it('isTenantAdminRole rejeita role operacional', () => {
    expect(isTenantAdminRole(TENANT_ROLES.CASHIER)).toBe(false);
  });

  it('hasAnyPermission considera wildcard', () => {
    expect(hasAnyPermission({ permissions: [PLATFORM_PERMISSIONS.ALL] } as any, ['x:y:z'])).toBe(true);
  });

  it('isTechnicalAdminSource reconhece source technical-admin', () => {
    expect(isTechnicalAdminSource({ source: 'technical-admin' })).toBe(true);
  });
});
