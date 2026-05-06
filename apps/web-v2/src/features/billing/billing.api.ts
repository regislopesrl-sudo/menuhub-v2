import { apiFetch } from '@/lib/api-fetch';

export type BillingCurrentResponse = {
  subscription: {
    id: string;
    status: 'ACTIVE' | 'TRIAL' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';
    startsAt: string;
    endsAt: string | null;
    trialEndsAt: string | null;
    cancelAt: string | null;
  } | null;
  plan: {
    id: string;
    key: string;
    name: string;
    description: string;
    priceCents: number;
    currency: 'BRL';
    billingInterval: 'monthly';
  } | null;
  modules: Array<{
    key: string;
    name: string;
    enabled: boolean;
    includedInPlan: boolean;
    source: 'plan' | 'default' | 'company_override';
    overrideEnabled: boolean | null;
    adminOnly: boolean;
    blocked: boolean;
  }>;
  limits: Array<{
    key: string;
    label: string;
    limit: number;
    used: number | null;
  }>;
  billing: {
    status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired' | 'missing_subscription';
    nextBillingAt: string | null;
    lastPaymentAt: string | null;
    provider: string;
  };
  history: Array<{
    id: string;
    status: string;
    amountCents: number;
    dueDate: string;
    paidAt: string | null;
    createdAt: string;
  }>;
  support: {
    canUpgrade: boolean;
    upgradeAction: 'contact_support';
  };
};

export function getCurrentBilling() {
  return apiFetch<BillingCurrentResponse>('/v2/billing/current', {
    method: 'GET',
  });
}
