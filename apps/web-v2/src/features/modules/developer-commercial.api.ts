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
};

export type PlanSummary = {
  id: string;
  key: string;
  name: string;
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
  const res = await fetch(`${API_BASE}/v2/developer/companies`, { cache: 'no-store' });
  return readJson<DeveloperCompany[]>(res, 'Falha ao listar empresas.');
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
  const res = await fetch(`${API_BASE}/v2/developer/companies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readJson<DeveloperCompany>(res, 'Falha ao criar empresa.');
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
  const res = await fetch(`${API_BASE}/v2/developer/companies/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readJson<DeveloperCompany>(res, 'Falha ao atualizar empresa.');
}

export async function getDeveloperCompanySubscription(companyId: string): Promise<CompanySubscription | null> {
  const res = await fetch(`${API_BASE}/v2/developer/companies/${companyId}/subscription`, {
    cache: 'no-store',
  });
  return readJson<CompanySubscription | null>(res, 'Falha ao carregar assinatura.');
}

export async function getDeveloperCompanyBilling(companyId: string): Promise<{
  company: { id: string; name: string; legalName: string };
  billingAccount: BillingAccount | null;
  subscription: CompanySubscription | null;
}> {
  const res = await fetch(`${API_BASE}/v2/developer/companies/${companyId}/billing`, {
    cache: 'no-store',
    headers: buildDevHeaders(companyId),
  });
  return readJson(res, 'Falha ao carregar billing.');
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
  const res = await fetch(`${API_BASE}/v2/developer/companies/${companyId}/billing-account`, {
    method: 'PUT',
    headers: buildDevHeaders(companyId),
    body: JSON.stringify(input),
  });
  return readJson(res, 'Falha ao salvar billing account.');
}

export async function listDeveloperCompanyInvoices(companyId: string): Promise<Invoice[]> {
  const res = await fetch(`${API_BASE}/v2/developer/companies/${companyId}/invoices`, {
    cache: 'no-store',
    headers: buildDevHeaders(companyId),
  });
  return readJson(res, 'Falha ao listar faturas.');
}

export async function createDeveloperMockInvoice(companyId: string): Promise<Invoice> {
  const res = await fetch(`${API_BASE}/v2/developer/companies/${companyId}/invoices/mock`, {
    method: 'POST',
    headers: buildDevHeaders(companyId),
  });
  return readJson(res, 'Falha ao gerar fatura mock.');
}

export async function payDeveloperMockInvoice(companyId: string, invoiceId: string): Promise<Invoice> {
  const res = await fetch(`${API_BASE}/v2/developer/invoices/${invoiceId}/pay/mock`, {
    method: 'POST',
    headers: buildDevHeaders(companyId),
  });
  return readJson(res, 'Falha ao pagar fatura mock.');
}

export async function createDeveloperInvoicePaymentLink(companyId: string, invoiceId: string): Promise<BillingPaymentLink> {
  const res = await fetch(`${API_BASE}/v2/developer/invoices/${invoiceId}/payment-link`, {
    method: 'POST',
    headers: buildDevHeaders(companyId),
  });
  return readJson(res, 'Falha ao gerar link de pagamento.');
}

export async function runDeveloperBillingCycle(companyId: string, referenceDate?: string): Promise<{ companyId: string; createdInvoiceId: string | null }> {
  const res = await fetch(`${API_BASE}/v2/developer/companies/${companyId}/billing/run-cycle`, {
    method: 'POST',
    headers: buildDevHeaders(companyId),
    body: JSON.stringify({ referenceDate }),
  });
  return readJson(res, 'Falha ao executar ciclo de billing.');
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
  const res = await fetch(`${API_BASE}/v2/developer/companies/${companyId}/subscription`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readJson<CompanySubscription>(res, 'Falha ao criar assinatura.');
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
  const res = await fetch(`${API_BASE}/v2/developer/companies/${companyId}/subscription/${subscriptionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readJson<CompanySubscription>(res, 'Falha ao atualizar assinatura.');
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
