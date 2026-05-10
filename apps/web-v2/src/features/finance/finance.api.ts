import { apiFetch } from '@/lib/api-fetch';

export type FinancePeriod = {
  from: string;
  to: string;
};

export type CashFlow = {
  period: FinancePeriod;
  branchId: string | null;
  realized: { inflow: number; outflow: number; balance: number };
  forecast: { receivables: number; payables: number; balance: number };
  sources: { paidOrders: number; ledgerEntries: number; payables: number; receivables: number };
};

export type Dre = {
  period: FinancePeriod;
  branchId: string | null;
  grossRevenue: number;
  canceledAmount: number;
  netRevenue: number;
  cogs: number;
  cogsSource: string;
  grossMargin: number;
  grossMarginPercent: number;
  operatingExpenses: number;
  operatingProfit: number;
  operatingProfitPercent: number;
};

export type FinanceOverview = {
  period: FinancePeriod;
  branchId: string | null;
  cashFlow: CashFlow;
  dre: Dre;
  reconciliationSummary: { totalItems: number; divergent: number; pending: number };
  openPayables: number;
  openReceivables: number;
};

export type FinanceLedgerEntry = {
  id: string;
  branchId: string;
  entryType: string;
  originType: string;
  amount: number;
  category: string | null;
  description: string | null;
  externalReference: string | null;
  createdAt: string;
};

export type FinanceAccount = {
  id: string;
  branchId: string;
  description: string;
  amount: number;
  paidAmount: number;
  dueDate: string | null;
  status: string;
  supplier?: { id: string; name: string } | null;
  orderId?: string | null;
  paymentId?: string | null;
};

export type FinanceReconciliation = {
  period: FinancePeriod;
  branchId: string | null;
  summary: { totalItems: number; divergent: number; pending: number };
  items: Array<{
    type: string;
    referenceId: string;
    expectedAmount: number;
    actualAmount: number;
    differenceAmount: number;
    status: string;
  }>;
};

function query(params?: { from?: string; to?: string; branchId?: string }) {
  const search = new URLSearchParams();
  if (params?.from) search.set('from', params.from);
  if (params?.to) search.set('to', params.to);
  if (params?.branchId) search.set('branchId', params.branchId);
  const value = search.toString();
  return value ? `?${value}` : '';
}

export function getFinanceOverview(params?: { from?: string; to?: string; branchId?: string }) {
  return apiFetch<FinanceOverview>(`/v2/admin/finance/overview${query(params)}`, { method: 'GET' });
}

export function listFinanceLedger(params?: { from?: string; to?: string; branchId?: string }) {
  return apiFetch<FinanceLedgerEntry[]>(`/v2/admin/finance/ledger${query(params)}`, { method: 'GET' });
}

export function listFinancePayables(params?: { from?: string; to?: string; branchId?: string }) {
  return apiFetch<FinanceAccount[]>(`/v2/admin/finance/payables${query(params)}`, { method: 'GET' });
}

export function listFinanceReceivables(params?: { from?: string; to?: string; branchId?: string }) {
  return apiFetch<FinanceAccount[]>(`/v2/admin/finance/receivables${query(params)}`, { method: 'GET' });
}

export function getFinanceReconciliation(params?: { from?: string; to?: string; branchId?: string }) {
  return apiFetch<FinanceReconciliation>(`/v2/admin/finance/reconciliation${query(params)}`, { method: 'GET' });
}

export function createManualFinanceEntry(input: {
  entryType: 'REVENUE' | 'EXPENSE';
  amount: number;
  description?: string;
  category?: string;
  costCenter?: string;
}) {
  return apiFetch<FinanceLedgerEntry>('/v2/admin/finance/ledger/manual', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
