import type { RequestContext } from './request-context';

export const AUDIT_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number];

export const AUDIT_OUTCOMES = ['success', 'failure', 'blocked', 'pending'] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

export const AUDIT_ACTOR_TYPES = [
  'user',
  'technical-admin',
  'system',
  'integration',
  'anonymous',
] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

export const AUDIT_ACTIONS = {
  PLATFORM_LOGIN: 'platform.login',
  COMPANY_CREATE: 'platform.company.create',
  COMPANY_UPDATE: 'platform.company.update',
  PLAN_CREATE: 'platform.plan.create',
  PLAN_UPDATE: 'platform.plan.update',
  MODULE_OVERRIDE_UPDATE: 'platform.module.override.update',
  SUBSCRIPTION_CREATE: 'platform.subscription.create',
  SUBSCRIPTION_PATCH: 'platform.subscription.patch',
  BILLING_ACCOUNT_UPSERT: 'platform.billing.account.upsert',
  BILLING_RUN_CYCLE: 'platform.billing.run_cycle',
  BILLING_MOCK_PAYMENT: 'platform.billing.mock_payment',
  BILLING_PAYMENT_LINK_CREATE: 'platform.billing.payment_link.create',
  ADMIN_USER_CREATE: 'admin.user.create',
  ADMIN_USER_UPDATE: 'admin.user.update',
  ADMIN_USER_ROLE_ASSIGN: 'admin.user.role.assign',
  SETTINGS_UPDATE: 'settings.update',
  ORDER_STATUS_UPDATE: 'orders.status.update',
  ORDER_CANCEL: 'orders.cancel',
  PAYMENT_WEBHOOK_RECEIVED: 'payments.webhook.received',
  PAYMENT_WEBHOOK_PROCESSED: 'payments.webhook.processed',
  PAYMENT_WEBHOOK_FAILED: 'payments.webhook.failed',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface AuditActor {
  type: AuditActorType;
  userId?: string | null;
  source?: string | null;
  role?: string | null;
  permissions?: readonly string[];
}

export interface AuditScope {
  companyId?: string | null;
  branchId?: string | null;
  requestId?: string | null;
}

export interface AuditTarget {
  type: string;
  id?: string | null;
  label?: string | null;
}

export interface AuditEventInput {
  action: AuditAction;
  severity?: AuditSeverity;
  outcome: AuditOutcome;
  actor: AuditActor;
  scope?: AuditScope;
  target?: AuditTarget;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
}

export interface AuditEvent {
  action: AuditAction;
  severity: AuditSeverity;
  outcome: AuditOutcome;
  actor: AuditActor;
  scope?: AuditScope;
  target?: AuditTarget;
  metadata?: Record<string, unknown>;
  occurredAt: Date;
}

const DEFAULT_SEVERITY_BY_ACTION: Record<AuditAction, AuditSeverity> = {
  [AUDIT_ACTIONS.PLATFORM_LOGIN]: 'high',
  [AUDIT_ACTIONS.COMPANY_CREATE]: 'high',
  [AUDIT_ACTIONS.COMPANY_UPDATE]: 'high',
  [AUDIT_ACTIONS.PLAN_CREATE]: 'high',
  [AUDIT_ACTIONS.PLAN_UPDATE]: 'high',
  [AUDIT_ACTIONS.MODULE_OVERRIDE_UPDATE]: 'high',
  [AUDIT_ACTIONS.SUBSCRIPTION_CREATE]: 'critical',
  [AUDIT_ACTIONS.SUBSCRIPTION_PATCH]: 'critical',
  [AUDIT_ACTIONS.BILLING_ACCOUNT_UPSERT]: 'high',
  [AUDIT_ACTIONS.BILLING_RUN_CYCLE]: 'high',
  [AUDIT_ACTIONS.BILLING_MOCK_PAYMENT]: 'high',
  [AUDIT_ACTIONS.BILLING_PAYMENT_LINK_CREATE]: 'high',
  [AUDIT_ACTIONS.ADMIN_USER_CREATE]: 'critical',
  [AUDIT_ACTIONS.ADMIN_USER_UPDATE]: 'critical',
  [AUDIT_ACTIONS.ADMIN_USER_ROLE_ASSIGN]: 'critical',
  [AUDIT_ACTIONS.SETTINGS_UPDATE]: 'high',
  [AUDIT_ACTIONS.ORDER_STATUS_UPDATE]: 'medium',
  [AUDIT_ACTIONS.ORDER_CANCEL]: 'high',
  [AUDIT_ACTIONS.PAYMENT_WEBHOOK_RECEIVED]: 'medium',
  [AUDIT_ACTIONS.PAYMENT_WEBHOOK_PROCESSED]: 'medium',
  [AUDIT_ACTIONS.PAYMENT_WEBHOOK_FAILED]: 'high',
};

const SENSITIVE_METADATA_KEY = new RegExp(
  [
    'password',
    'token',
    'access[_-]?token',
    'refresh[_-]?token',
    'authorization',
    'bearer',
    'cookie',
    'set[_-]?cookie',
    'jwt',
    'secret',
    'client[_-]?secret',
    'private[_-]?key',
    'api[_-]?key',
    'x[_-]?api[_-]?key',
    'webhook[_-]?secret',
    'card',
    'card[_-]?number',
    'cvv',
    'pix[_-]?key',
    'document',
    'cpf',
    'cnpj',
    'email',
    'phone',
    'payload',
    'raw[_-]?payload',
    'provider[_-]?payload',
    'webhook[_-]?payload',
  ].join('|'),
  'i',
);
const MASKED_VALUE = '[REDACTED]';

export function getDefaultSeverityForAuditAction(action: AuditAction): AuditSeverity {
  return DEFAULT_SEVERITY_BY_ACTION[action] ?? 'medium';
}

export function buildAuditActorFromContext(
  ctx?: Pick<RequestContext, 'userId' | 'source' | 'userRole' | 'permissions'>,
): AuditActor {
  if (!ctx) {
    return { type: 'anonymous' };
  }
  if (ctx.source === 'technical-admin') {
    return {
      type: 'technical-admin',
      userId: ctx.userId ?? null,
      source: ctx.source,
      role: ctx.userRole ?? null,
      permissions: ctx.permissions ?? [],
    };
  }
  return {
    type: ctx.userId ? 'user' : 'anonymous',
    userId: ctx.userId ?? null,
    source: ctx.source ?? null,
    role: ctx.userRole ?? null,
    permissions: ctx.permissions ?? [],
  };
}

export function buildAuditScopeFromContext(
  ctx?: Pick<RequestContext, 'companyId' | 'branchId' | 'requestId'>,
): AuditScope | undefined {
  if (!ctx) return undefined;
  return {
    companyId: ctx.companyId ?? null,
    branchId: ctx.branchId ?? null,
    requestId: ctx.requestId ?? null,
  };
}

export function sanitizeAuditMetadata(
  metadata?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  return sanitizeValue(metadata) as Record<string, unknown>;
}

export function createAuditEvent(input: AuditEventInput): AuditEvent {
  return {
    action: input.action,
    severity: input.severity ?? getDefaultSeverityForAuditAction(input.action),
    outcome: input.outcome,
    actor: input.actor,
    scope: input.scope,
    target: input.target,
    metadata: sanitizeAuditMetadata(input.metadata),
    occurredAt: input.occurredAt ?? new Date(),
  };
}

function sanitizeValue(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_METADATA_KEY.test(key)) {
    return MASKED_VALUE;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    out[childKey] = sanitizeValue(childValue, childKey);
  }
  return out;
}
