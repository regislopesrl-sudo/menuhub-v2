import { ForbiddenException } from '@nestjs/common';
import type { RequestContext } from '../common/request-context';
import {
  type PermissionCode,
  PLATFORM_PERMISSIONS,
  hasAnyPermission,
  isTechnicalAdminSource,
} from '../common/rbac';

export type DeveloperPlatformAction =
  | 'companies:read'
  | 'companies:create'
  | 'companies:update'
  | 'plans:manage'
  | 'modules:manage'
  | 'billing:read'
  | 'billing:manage'
  | 'subscriptions:read'
  | 'subscriptions:manage';

const REQUIRED_BY_ACTION: Record<DeveloperPlatformAction, readonly PermissionCode[]> = {
  'companies:read': [PLATFORM_PERMISSIONS.COMPANIES_READ],
  'companies:create': [PLATFORM_PERMISSIONS.COMPANIES_CREATE],
  'companies:update': [PLATFORM_PERMISSIONS.COMPANIES_UPDATE],
  'plans:manage': [PLATFORM_PERMISSIONS.PLANS_MANAGE],
  'modules:manage': [PLATFORM_PERMISSIONS.MODULES_MANAGE],
  'billing:read': [PLATFORM_PERMISSIONS.BILLING_READ],
  'billing:manage': [PLATFORM_PERMISSIONS.BILLING_MANAGE],
  'subscriptions:read': [
    PLATFORM_PERMISSIONS.BILLING_READ,
    PLATFORM_PERMISSIONS.COMPANIES_READ,
  ],
  'subscriptions:manage': [
    PLATFORM_PERMISSIONS.BILLING_MANAGE,
    PLATFORM_PERMISSIONS.COMPANIES_UPDATE,
  ],
} as const;

export function getRequiredPlatformPermissions(
  action: DeveloperPlatformAction,
): readonly PermissionCode[] {
  return REQUIRED_BY_ACTION[action];
}

export function canPerformPlatformAction(
  ctx: RequestContext | undefined,
  action: DeveloperPlatformAction,
): boolean {
  if (!ctx) {
    return false;
  }
  if (isTechnicalAdminSource(ctx)) {
    return true;
  }
  if (
    hasAnyPermission(ctx, [
      PLATFORM_PERMISSIONS.ALL,
      PLATFORM_PERMISSIONS.ADMIN,
    ])
  ) {
    return true;
  }
  return hasAnyPermission(ctx, getRequiredPlatformPermissions(action));
}

export function assertCanPerformPlatformAction(
  ctx: RequestContext | undefined,
  action: DeveloperPlatformAction,
): void {
  if (!canPerformPlatformAction(ctx, action)) {
    throw new ForbiddenException('Acao restrita ao nivel tecnico da plataforma.');
  }
}
