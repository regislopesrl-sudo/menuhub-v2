export type SubscriptionStatus =
  | 'ACTIVE'
  | 'TRIAL'
  | 'PAST_DUE'
  | 'CANCELED'
  | 'EXPIRED';

const ALLOWED_STATUSES: ReadonlySet<SubscriptionStatus> = new Set(['ACTIVE', 'TRIAL']);

export function canUseModules(status: SubscriptionStatus | null | undefined): boolean {
  if (!status) {
    return false;
  }
  return ALLOWED_STATUSES.has(status);
}
