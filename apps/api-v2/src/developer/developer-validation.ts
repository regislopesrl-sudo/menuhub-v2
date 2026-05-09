import { BadRequestException } from '@nestjs/common';

const ALLOWED_COMPANY_STATUSES = new Set(['ACTIVE', 'INACTIVE', 'SUSPENDED']);
const ALLOWED_SUBSCRIPTION_STATUSES = new Set([
  'ACTIVE',
  'TRIAL',
  'PAST_DUE',
  'CANCELED',
  'EXPIRED',
]);

export function assertNonEmptyPayload(payload: object, keys: readonly string[], message: string): void {
  const hasAnyValue = keys.some((key) => (payload as Record<string, unknown>)[key] !== undefined);
  if (!hasAnyValue) {
    throw new BadRequestException(message);
  }
}

export function assertRequiredString(value: unknown, fieldName: string): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    throw new BadRequestException(`${fieldName} obrigatorio.`);
  }
  return normalized;
}

export function assertValidCompanyStatus(status: unknown): void {
  if (status === undefined || status === null) return;
  if (!ALLOWED_COMPANY_STATUSES.has(String(status))) {
    throw new BadRequestException('status de company invalido.');
  }
}

export function assertValidSubscriptionStatus(status: unknown): void {
  if (!ALLOWED_SUBSCRIPTION_STATUSES.has(String(status))) {
    throw new BadRequestException('status de assinatura invalido.');
  }
}

export function assertValidDateString(value: unknown, fieldName: string): void {
  if (value === undefined || value === null) return;
  const raw = String(value).trim();
  if (!raw || Number.isNaN(new Date(raw).getTime())) {
    throw new BadRequestException(`${fieldName} invalido.`);
  }
}

export function assertRequiredModuleKey(moduleKey: unknown): string {
  const normalized = String(moduleKey ?? '').trim();
  if (!normalized) {
    throw new BadRequestException('moduleKey obrigatorio.');
  }
  return normalized;
}

export function assertSubscriptionDateRange(
  startsAtIso: string,
  endsAtIso?: string | null,
  trialEndsAtIso?: string | null,
): void {
  const startsAt = new Date(startsAtIso);
  const endsAt = endsAtIso ? new Date(endsAtIso) : null;
  const trialEndsAt = trialEndsAtIso ? new Date(trialEndsAtIso) : null;

  if (endsAt && endsAt.getTime() < startsAt.getTime()) {
    throw new BadRequestException('endsAt deve ser maior ou igual a startsAt.');
  }

  if (trialEndsAt && trialEndsAt.getTime() < startsAt.getTime()) {
    throw new BadRequestException('trialEndsAt deve ser maior ou igual a startsAt.');
  }

  if (trialEndsAt && endsAt && trialEndsAt.getTime() > endsAt.getTime()) {
    throw new BadRequestException('trialEndsAt deve ser menor ou igual a endsAt.');
  }
}
