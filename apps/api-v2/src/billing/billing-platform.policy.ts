import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import type { RequestContext } from '../common/request-context';
import {
  type PermissionCode,
  PLATFORM_PERMISSIONS,
  TENANT_PERMISSIONS,
  hasAnyPermission,
  isTechnicalAdminSource,
} from '../common/rbac';
import { assertCompanyScope } from '../common/platform-access';

export type PlatformBillingAction =
  | 'billing:read'
  | 'billing:manage'
  | 'subscription:read'
  | 'subscription:manage'
  | 'billing:run_cycle'
  | 'billing:mock_payment';

const REQUIRED_PLATFORM_BY_ACTION: Record<PlatformBillingAction, readonly PermissionCode[]> = {
  'billing:read': [PLATFORM_PERMISSIONS.BILLING_READ, PLATFORM_PERMISSIONS.BILLING_MANAGE],
  'billing:manage': [PLATFORM_PERMISSIONS.BILLING_MANAGE],
  'subscription:read': [PLATFORM_PERMISSIONS.BILLING_READ, PLATFORM_PERMISSIONS.BILLING_MANAGE],
  'subscription:manage': [PLATFORM_PERMISSIONS.BILLING_MANAGE],
  'billing:run_cycle': [PLATFORM_PERMISSIONS.BILLING_MANAGE],
  'billing:mock_payment': [PLATFORM_PERMISSIONS.BILLING_MANAGE],
} as const;

const REQUIRED_TENANT_BY_ACTION: Record<PlatformBillingAction, readonly PermissionCode[]> = {
  'billing:read': [TENANT_PERMISSIONS.BILLING_READ, TENANT_PERMISSIONS.BILLING_MANAGE],
  'billing:manage': [TENANT_PERMISSIONS.BILLING_MANAGE],
  'subscription:read': [TENANT_PERMISSIONS.BILLING_READ, TENANT_PERMISSIONS.BILLING_MANAGE],
  'subscription:manage': [TENANT_PERMISSIONS.BILLING_MANAGE],
  'billing:run_cycle': [TENANT_PERMISSIONS.BILLING_MANAGE],
  'billing:mock_payment': [TENANT_PERMISSIONS.BILLING_MANAGE],
} as const;

export function getRequiredBillingPermissions(action: PlatformBillingAction): readonly PermissionCode[] {
  return REQUIRED_PLATFORM_BY_ACTION[action];
}

export function canPerformPlatformBillingAction(
  ctx: RequestContext | undefined,
  action: PlatformBillingAction,
): boolean {
  if (!ctx) return false;
  if (isTechnicalAdminSource(ctx)) return true;
  if (hasAnyPermission(ctx, [PLATFORM_PERMISSIONS.ALL, PLATFORM_PERMISSIONS.ADMIN])) return true;
  return hasAnyPermission(ctx, getRequiredBillingPermissions(action));
}

export function assertCanPerformPlatformBillingAction(
  ctx: RequestContext | undefined,
  action: PlatformBillingAction,
): void {
  if (!canPerformPlatformBillingAction(ctx, action)) {
    throw new ForbiddenException('Acao restrita ao nivel tecnico de billing da plataforma.');
  }
}

export function assertCanAccessCompanyBillingAction(
  ctx: RequestContext | undefined,
  companyId: string,
  action: PlatformBillingAction,
): void {
  if (!ctx) {
    throw new ForbiddenException('Contexto ausente.');
  }

  if (canPerformPlatformBillingAction(ctx, action)) {
    return;
  }

  assertCompanyScope(ctx, companyId);
  if (!hasAnyPermission(ctx, REQUIRED_TENANT_BY_ACTION[action])) {
    throw new ForbiddenException('Permissao insuficiente para operar billing da empresa.');
  }
}

const ALLOWED_SUBSCRIPTION_TRANSITIONS: Record<SubscriptionStatus, readonly SubscriptionStatus[]> = {
  [SubscriptionStatus.ACTIVE]: [
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.PAST_DUE,
    SubscriptionStatus.CANCELED,
    SubscriptionStatus.EXPIRED,
  ],
  [SubscriptionStatus.TRIAL]: [
    SubscriptionStatus.TRIAL,
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.PAST_DUE,
    SubscriptionStatus.CANCELED,
    SubscriptionStatus.EXPIRED,
  ],
  [SubscriptionStatus.PAST_DUE]: [
    SubscriptionStatus.PAST_DUE,
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.CANCELED,
    SubscriptionStatus.EXPIRED,
  ],
  [SubscriptionStatus.CANCELED]: [
    SubscriptionStatus.CANCELED,
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.EXPIRED,
  ],
  [SubscriptionStatus.EXPIRED]: [SubscriptionStatus.EXPIRED, SubscriptionStatus.ACTIVE],
};

export function canTransitionSubscriptionStatus(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
): boolean {
  return ALLOWED_SUBSCRIPTION_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertValidSubscriptionTransition(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
): void {
  if (!canTransitionSubscriptionStatus(from, to)) {
    throw new BadRequestException(`Transicao de assinatura invalida: ${from} -> ${to}.`);
  }
}
