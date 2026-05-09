import { apiFetch } from '@/lib/api-fetch';

const API_BASE = process.env.NEXT_PUBLIC_API_V2_URL ?? 'http://localhost:3202';

export type DeveloperCompany = {
  id: string;
  name: string | null;
  legalName: string;
  document: string | null;
  slug: string | null;
  email: string | null;
  phone: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  subscriptionStatus: 'ACTIVE' | 'TRIAL' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED' | null;
  planKey: string | null;
  planName: string | null;
  moduleStats: {
    totalInPlan: number;
    blockedOrOff: number;
    overrides: number;
  };
};

export type PlanSummary = {
  id: string;
  key: string;
  name: string;
};

export type DeveloperPlan = {
  id: string;
  key: string;
  name: string;
  isActive?: boolean;
};

export type CompanySubscription = {
  id: string;
  companyId: string;
  planId: string;
  status: 'ACTIVE' | 'TRIAL' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';
  startsAt: string;
  endsAt: string | null;
  trialEndsAt: string | null;
  plan: PlanSummary;
};

export type BillingAccount = {
  id: string;
  companyId: string;
  billingEmail: string;
  document: string | null;
  legalName: string | null;
  addressJson: Record<string, unknown> | null;
};

export type Invoice = {
  id: string;
  companyId: string;
  subscriptionId: string | null;
  status: 'OPEN' | 'PAID' | 'PAST_DUE' | 'VOID';
  amountCents: number;
  dueDate: string;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: Array<{
    id: string;
    description: string;
    quantity: number;
    unitAmountCents: number;
    totalAmountCents: number;
  }>;
  attempts: Array<{
    id: string;
    provider: string;
    providerPaymentId: string | null;
    status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
    errorMessage: string | null;
    createdAt: string;
  }>;
};

export type BillingPaymentLink = {
  provider: string;
  providerPaymentId: string;
  paymentUrl: string;
  status: 'PENDING' | 'PAID' | 'FAILED';
};

function buildDevHeaders(companyId: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'x-company-id': companyId,
    'x-user-role': 'developer',
  };
}

async function readJson<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const message = await safeReadError(res);
    throw new Error(message ?? fallback);
  }
  return (await res.json()) as T;
}

export async function listDeveloperCompanies(): Promise<DeveloperCompany[]> {
  return apiFetch<DeveloperCompany[]>('/v2/developer/companies', { method: 'GET' });
}

export async function listDeveloperPlans(): Promise<DeveloperPlan[]> {
  return apiFetch<DeveloperPlan[]>('/v2/developer/plans', { method: 'GET' });
}

export async function createDeveloperCompany(input: {
  name: string;
  legalName: string;
  document?: string;
  slug: string;
  email?: string;
  phone?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
}): Promise<DeveloperCompany> {
  return apiFetch<DeveloperCompany>('/v2/developer/companies', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function patchDeveloperCompany(
  id: string,
  input: Partial<{
    name: string;
    legalName: string;
    document: string;
    slug: string;
    email: string;
    phone: string;
    status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  }>,
): Promise<DeveloperCompany> {
  return apiFetch<DeveloperCompany>(`/v2/developer/companies/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function getDeveloperCompanySubscription(companyId: string): Promise<CompanySubscription | null> {
  return apiFetch<CompanySubscription | null>(`/v2/developer/companies/${companyId}/subscription`, {
    method: 'GET',
  });
}

export async function getDeveloperCompanyBilling(companyId: string): Promise<{
  company: { id: string; name: string; legalName: string };
  billingAccount: BillingAccount | null;
  subscription: CompanySubscription | null;
}> {
  return apiFetch(`/v2/developer/companies/${companyId}/billing`, {
    method: 'GET',
  });
}

export async function upsertDeveloperCompanyBillingAccount(
  companyId: string,
  input: {
    billingEmail: string;
    document?: string;
    legalName?: string;
    addressJson?: Record<string, unknown>;
  },
): Promise<BillingAccount> {
  return apiFetch(`/v2/developer/companies/${companyId}/billing-account`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function listDeveloperCompanyInvoices(companyId: string): Promise<Invoice[]> {
  return apiFetch(`/v2/developer/companies/${companyId}/invoices`, {
    method: 'GET',
  });
}

export async function createDeveloperMockInvoice(companyId: string): Promise<Invoice> {
  return apiFetch(`/v2/developer/companies/${companyId}/invoices/mock`, {
    method: 'POST',
  });
}

export async function payDeveloperMockInvoice(companyId: string, invoiceId: string): Promise<Invoice> {
  return apiFetch(`/v2/developer/invoices/${invoiceId}/pay/mock`, {
    method: 'POST',
  });
}

export async function createDeveloperInvoicePaymentLink(companyId: string, invoiceId: string): Promise<BillingPaymentLink> {
  return apiFetch(`/v2/developer/invoices/${invoiceId}/payment-link`, {
    method: 'POST',
  });
}

export async function runDeveloperBillingCycle(companyId: string, referenceDate?: string): Promise<{ companyId: string; createdInvoiceId: string | null }> {
  return apiFetch(`/v2/developer/companies/${companyId}/billing/run-cycle`, {
    method: 'POST',
    body: JSON.stringify({ referenceDate }),
  });
}

export async function createDeveloperCompanySubscription(
  companyId: string,
  input: {
    planId: string;
    status: CompanySubscription['status'];
    startsAt: string;
    endsAt?: string;
    trialEndsAt?: string;
  },
): Promise<CompanySubscription> {
  return apiFetch(`/v2/developer/companies/${companyId}/subscription`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function patchDeveloperCompanySubscription(
  companyId: string,
  subscriptionId: string,
  input: Partial<{
    status: CompanySubscription['status'];
    endsAt: string | null;
    trialEndsAt: string | null;
  }>,
): Promise<CompanySubscription> {
  return apiFetch(`/v2/developer/companies/${companyId}/subscription/${subscriptionId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

async function safeReadError(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(', ');
    if (typeof body.message === 'string') return body.message;
    return null;
  } catch {
    return null;
  }
}
