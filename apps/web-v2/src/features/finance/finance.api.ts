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

export type FinanceOption = {
  key: string;
  label: string;
};

export type FinanceAccount = {
  id: string;
  branchId: string;
  description: string;
  amount: number;
  paidAmount: number;
  dueDate: string | null;
  status: string;
  category?: string | null;
  costCenter?: string | null;
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

export type FinanceBreakdownItem = {
  key: string;
  label: string;
  revenue: number;
  expense: number;
  pendingReceivable: number;
  pendingPayable: number;
};

export type FinanceReport = {
  generatedAt: string;
  period: FinancePeriod;
  branchId: string | null;
  overview: FinanceOverview;
  cashFlow: CashFlow;
  dre: Dre;
  reconciliation: FinanceReconciliation;
  ledger: FinanceLedgerEntry[];
  payables: FinanceAccount[];
  receivables: FinanceAccount[];
  categories: FinanceOption[];
  costCenters: FinanceOption[];
  breakdowns: {
    categories: FinanceBreakdownItem[];
    costCenters: FinanceBreakdownItem[];
  };
  totals: {
    ledgerEntries: number;
    payables: number;
    receivables: number;
    openPayables: number;
    openReceivables: number;
  };
};

function query(params?: { from?: string; to?: string; branchId?: string }) {
  const search = new URLSearchParams();
  if (params?.from) search.set('from', params.from);
  if (params?.to) search.set('to', params.to);
  if (params?.branchId) search.set('branchId', params.branchId);
  const value = search.toString();
  return value ? `?${value}` : '';
}

export function getFinanceReport(params?: { from?: string; to?: string; branchId?: string }) {
  return apiFetch<FinanceReport>(`/v2/admin/finance/report${query(params)}`, { method: 'GET' });
}
export function getFinanceOverview(params?: { from?: string; to?: string; branchId?: string }) {
  return apiFetch<FinanceOverview>(`/v2/admin/finance/overview${query(params)}`, { method: 'GET' });
}

export function listFinanceLedger(params?: { from?: string; to?: string; branchId?: string }) {
  return apiFetch<FinanceLedgerEntry[]>(`/v2/admin/finance/ledger${query(params)}`, { method: 'GET' });
}

export function listFinanceCategories(params?: { from?: string; to?: string; branchId?: string }) {
  return apiFetch<FinanceOption[]>(`/v2/admin/finance/categories${query(params)}`, { method: 'GET' });
}

export function listFinanceCostCenters(params?: { from?: string; to?: string; branchId?: string }) {
  return apiFetch<FinanceOption[]>(`/v2/admin/finance/cost-centers${query(params)}`, { method: 'GET' });
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

export function createManualPayable(input: {
  description: string;
  amount: number;
  dueDate: string;
  category?: string;
  costCenter?: string;
}) {
  return apiFetch<FinanceAccount>('/v2/admin/finance/payables/manual', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function createManualReceivable(input: {
  description: string;
  amount: number;
  dueDate?: string;
  category?: string;
  costCenter?: string;
}) {
  return apiFetch<FinanceAccount>('/v2/admin/finance/receivables/manual', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function settlePayable(id: string, input: { amount: number; settlementMethod?: string; reasonText?: string }) {
  return apiFetch<FinanceAccount>(`/v2/admin/finance/payables/${id}/settle`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function settleReceivable(id: string, input: { amount: number; settlementMethod?: string; reasonText?: string }) {
  return apiFetch<FinanceAccount>(`/v2/admin/finance/receivables/${id}/settle`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
