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
  cogsStatus?: 'COMPLETE' | 'PARTIAL_DATA' | 'NO_DATA' | 'READY';
  grossMargin: number;
  grossMarginPercent: number;
  operatingExpenses: number;
  operatingProfit: number;
  operatingProfitPercent: number;
};

export type DreComparison = {
  previousPeriod: FinancePeriod;
  previous: Dre;
  deltas: Record<
    'grossRevenue' | 'netRevenue' | 'cogs' | 'grossMargin' | 'operatingExpenses' | 'operatingProfit',
    {
      current: number;
      previous: number;
      amount: number;
      percent: number | null;
    }
  >;
};

export type DailyCashFlowRow = {
  date: string;
  salesRevenue: number;
  manualRevenue: number;
  receivedReceivables: number;
  manualExpenses: number;
  paidPayables: number;
  realizedInflow: number;
  realizedOutflow: number;
  realizedBalance: number;
  cumulativeBalance: number;
  forecastReceivables: number;
  forecastPayables: number;
  forecastBalance: number;
};

export type CmvProductRow = {
  productId: string | null;
  productName: string;
  categoryName: string | null;
  quantitySold: number;
  revenue: number;
  cogs: number;
  grossMargin: number;
  grossMarginPercent: number;
  averageUnitCost: number;
  itemsWithoutCost: number;
  hasRecipe: boolean;
  dataStatus: 'COMPLETE' | 'PARTIAL_DATA' | 'NO_DATA';
};

export type CmvReport = {
  period: FinancePeriod;
  branchId: string | null;
  summary: {
    totalRevenue: number;
    totalCogs: number;
    grossMargin: number;
    grossMarginPercent: number;
    soldItems: number;
    soldProducts: number;
    itemsWithoutCost: number;
    productsWithoutRecipe: number;
    fallbackCostItems: number;
    dataStatus: 'COMPLETE' | 'PARTIAL_DATA' | 'NO_DATA';
  };
  products: CmvProductRow[];
};

export type ExecutiveAlert = {
  severity: 'danger' | 'warning' | 'info';
  title: string;
  detail: string;
  metric: string;
};

export type FinanceHealth = {
  score: number;
  status: 'SAUDAVEL' | 'ATENCAO' | 'CRITICO';
  penalties: string[];
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
  financialAccountId?: string | null;
  categoryId?: string | null;
  costCenterId?: string | null;
  entryType: string;
  status?: string;
  originType: string;
  amount: number;
  category: string | null;
  costCenter?: string | null;
  financialAccount?: { id: string; name: string; type: string | null } | null;
  description: string | null;
  externalReference: string | null;
  createdAt: string;
  canceledAt?: string | null;
  cancellationReason?: string | null;
};

export type FinanceOption = {
  key: string;
  label: string;
  id?: string;
  type?: string;
  name?: string;
  description?: string | null;
  status?: string;
  branchId?: string | null;
  sortOrder?: number;
  parentId?: string | null;
};

export type FinancialAccountOption = FinanceOption & {
  id: string;
  type: 'CASH' | 'BANK' | 'PIX' | 'CARD' | 'MARKETPLACE' | 'TRANSITORY' | 'OTHER' | string;
  name: string;
  openingBalance: number;
  currentBalance: number;
  status: string;
};

export type FinanceAccount = {
  id: string;
  branchId: string;
  description: string;
  amount: number;
  paidAmount: number;
  dueDate: string | null;
  status: string;
  financialAccountId?: string | null;
  categoryId?: string | null;
  costCenterId?: string | null;
  category?: string | null;
  costCenter?: string | null;
  financialAccount?: { id: string; name: string; type: string | null } | null;
  externalReference?: string | null;
  settledAt?: string | null;
  canceledAt?: string | null;
  expectedSettlementDate?: string | null;
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

export type PaymentFee = {
  id: string;
  branchId: string | null;
  paymentId: string | null;
  orderId: string | null;
  provider: string | null;
  method: string | null;
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
  feePct: number | null;
  occurredAt: string;
};

export type ReceivableSchedule = {
  id: string;
  branchId: string | null;
  accountReceivableId: string | null;
  paymentId: string | null;
  provider: string | null;
  method: string | null;
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
  expectedDate: string;
  receivedAt: string | null;
  status: string;
};

export type FinanceReport = {
  generatedAt: string;
  period: FinancePeriod;
  branchId: string | null;
  overview: FinanceOverview;
  cashFlow: CashFlow;
  dre: Dre;
  dreComparison?: DreComparison;
  dailyCashFlow?: DailyCashFlowRow[];
  cmv?: CmvReport;
  executiveAlerts?: ExecutiveAlert[];
  financeHealth?: FinanceHealth;
  reconciliation: FinanceReconciliation;
  ledger: FinanceLedgerEntry[];
  payables: FinanceAccount[];
  receivables: FinanceAccount[];
  categories: FinanceOption[];
  costCenters: FinanceOption[];
  financialAccounts: FinancialAccountOption[];
  paymentFees: PaymentFee[];
  receivableSchedules: ReceivableSchedule[];
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

export function listFinancialAccounts(params?: { from?: string; to?: string; branchId?: string }) {
  return apiFetch<FinancialAccountOption[]>(`/v2/admin/finance/financial-accounts${query(params)}`, { method: 'GET' });
}

export function listPaymentFees(params?: { from?: string; to?: string; branchId?: string }) {
  return apiFetch<PaymentFee[]>(`/v2/admin/finance/payment-fees${query(params)}`, { method: 'GET' });
}

export function listReceivableSchedules(params?: { from?: string; to?: string; branchId?: string }) {
  return apiFetch<ReceivableSchedule[]>(`/v2/admin/finance/receivable-schedules${query(params)}`, { method: 'GET' });
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

export function getFinanceCmv(params?: { from?: string; to?: string; branchId?: string }) {
  return apiFetch<CmvReport>(`/v2/admin/finance/cmv${query(params)}`, { method: 'GET' });
}

export function createManualFinanceEntry(input: {
  entryType: 'REVENUE' | 'EXPENSE';
  amount: number;
  description?: string;
  category?: string;
  categoryId?: string;
  costCenter?: string;
  costCenterId?: string;
  financialAccountId?: string;
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
  categoryId?: string;
  costCenter?: string;
  costCenterId?: string;
  financialAccountId?: string;
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
  categoryId?: string;
  costCenter?: string;
  costCenterId?: string;
  financialAccountId?: string;
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

export function createFinanceCategory(input: {
  name: string;
  type?: 'REVENUE' | 'EXPENSE' | 'BOTH';
  description?: string;
  status?: string;
  sortOrder?: number;
}) {
  return apiFetch<FinanceOption>('/v2/admin/finance/categories', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function createFinanceCostCenter(input: { name: string; description?: string; status?: string }) {
  return apiFetch<FinanceOption>('/v2/admin/finance/cost-centers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function createFinancialAccount(input: {
  name: string;
  type?: FinancialAccountOption['type'];
  description?: string;
  openingBalance?: number;
  currentBalance?: number;
  status?: string;
}) {
  return apiFetch<FinancialAccountOption>('/v2/admin/finance/financial-accounts', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateFinanceAccountRecord(
  kind: 'payable' | 'receivable',
  id: string,
  input: Partial<{
    description: string;
    amount: number;
    dueDate: string;
    categoryId: string;
    costCenterId: string;
    financialAccountId: string;
    status: string;
  }>,
) {
  const base = kind === 'payable' ? 'payables' : 'receivables';
  return apiFetch<FinanceAccount>(`/v2/admin/finance/${base}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function cancelFinanceAccountRecord(kind: 'payable' | 'receivable', id: string, reason?: string) {
  const base = kind === 'payable' ? 'payables' : 'receivables';
  return apiFetch<FinanceAccount>(`/v2/admin/finance/${base}/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function cancelFinanceLedger(id: string, reason?: string) {
  return apiFetch<FinanceLedgerEntry>(`/v2/admin/finance/ledger/${id}/cancel`, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
  });
}

export function confirmReconciliationItem(id: string) {
  return apiFetch<FinanceReconciliation['items'][number]>(`/v2/admin/finance/reconciliation/${id}/confirm`, {
    method: 'POST',
  });
}

export function ignoreReconciliationItem(id: string, reason: string) {
  return apiFetch<FinanceReconciliation['items'][number]>(`/v2/admin/finance/reconciliation/${id}/ignore`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}
