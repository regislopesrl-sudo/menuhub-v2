import { apiFetch } from '@/lib/api-fetch';

export type ReportsPeriod = {
  from: string;
  to: string;
  maxDays: number;
};

export type ReportsSummary = {
  totalOrders: number;
  activeOrders: number;
  delayedOrders: number;
  completedOrders: number;
  canceledOrders: number;
  grossRevenue: number;
  netRevenue: number;
  canceledRevenue: number;
  paidRevenue: number;
  averageTicket: number;
  subtotal?: number;
  deliveryFee: number;
  extraFee?: number;
  discount: number;
  completionRate: number;
  cancelRate: number;
};

export type ReportBreakdownRow = {
  key: string;
  label: string;
  orders?: number;
  payments?: number;
  revenue?: number;
  amount?: number;
  refundedAmount?: number;
  percent: number;
};

export type SalesByDayRow = {
  date: string;
  orders: number;
  revenue: number;
  averageTicket: number;
};

export type PeakHourRow = {
  hour: number;
  label: string;
  orders: number;
  revenue: number;
  averageTicket: number;
};

export type TopProductRow = {
  rank: number;
  productId: string | null;
  name: string;
  quantity: number;
  revenue: number;
  cogs: number;
  grossMargin: number;
  grossMarginPercent: number;
  cogsStatus: 'READY' | 'PARTIAL_DATA';
  orders: number;
};

export type OperatorRankingRow = {
  rank: number;
  userId: string | null;
  name: string;
  orders: number;
  revenue: number;
};

export type BranchRankingRow = {
  branchId: string;
  label: string;
  location: string | null;
  orders: number;
  revenue: number;
  percent: number;
};

export type NeighborhoodRankingRow = {
  key: string;
  label: string;
  orders: number;
  revenue: number;
  deliveryFee: number;
  averageTicket: number;
  averageDeliveryFee: number;
  percent: number;
};

export type FinancialBreakdownRow = {
  key: string;
  label: string;
  revenue: number;
  expense: number;
  pendingReceivable: number;
  pendingPayable: number;
};

export type ReportsFinancial = {
  allowed: boolean;
  error: string | null;
  dre: {
    grossRevenue: number;
    netRevenue: number;
    cogs: number;
    cogsSource: string;
    cogsStatus?: 'READY' | 'PARTIAL_DATA';
    grossMargin: number;
    grossMarginPercent: number;
    operatingExpenses: number;
    operatingProfit: number;
    operatingProfitPercent: number;
  } | null;
  cashFlow: {
    realized: { inflow: number; outflow: number; balance: number };
    forecast: { receivables: number; payables: number; balance: number };
    sources: { paidOrders: number; ledgerEntries: number; payables: number; receivables: number };
  } | null;
  reconciliationSummary: { totalItems: number; divergent: number; pending: number } | null;
  openPayables: number | null;
  openReceivables: number | null;
  breakdowns: {
    categories: FinancialBreakdownRow[];
    costCenters: FinancialBreakdownRow[];
  };
};

export type ReportsOverview = {
  generatedAt: string;
  period: ReportsPeriod;
  scope: { companyId: string; branchId: string | null };
  permissions: { financial: boolean };
  summary: ReportsSummary;
  charts: {
    salesByDay: SalesByDayRow[];
    peakHours: PeakHourRow[];
  };
  breakdowns: {
    channels: ReportBreakdownRow[];
    statuses: ReportBreakdownRow[];
    paymentStatuses: ReportBreakdownRow[];
    paymentMethods: ReportBreakdownRow[];
    neighborhoods?: NeighborhoodRankingRow[];
    branches: BranchRankingRow[];
  };
  rankings: {
    topProducts: TopProductRow[];
    operators: OperatorRankingRow[];
  };
  financial: ReportsFinancial;
};

export type ReportsInventory = {
  generatedAt: string;
  dataStatus: 'READY' | 'PARTIAL_DATA';
  summary: {
    itemsCount: number;
    lowStockItems: number;
    criticalItems: number;
    balanceRows: number;
    estimatedStockValue: number;
  };
  movements: Array<{
    key: string;
    label: string;
    count: number;
    quantity: number;
    totalCost: number;
  }>;
  lowStockRanking: Array<{
    stockItemId: string;
    name: string;
    currentQuantity: number;
    minimumQuantity: number;
    unit: string | null;
    estimatedValue: number;
    critical: boolean;
  }>;
  purchaseSuggestions: Array<{
    stockItemId: string;
    name: string;
    type: string | null;
    category: string | null;
    currentQuantity: number;
    minimumQuantity: number;
    reorderPoint: number;
    suggestedQuantity: number;
    unit: string | null;
    leadTimeDays: number;
    estimatedPurchaseCost: number;
    critical: boolean;
  }>;
};

export type CmvProductRow = {
  rank: number;
  productId: string | null;
  name: string;
  categoryId: string | null;
  categoryName: string;
  quantity: number;
  revenue: number;
  cogs: number;
  orderItems: number;
  itemsWithoutCost: number;
  fallbackCostItems: number;
  averageUnitCost: number;
  grossMargin: number;
  grossMarginPercent: number;
  cogsStatus: 'READY' | 'PARTIAL_DATA';
  lossMaking: boolean;
};

export type CmvCategoryRow = {
  categoryId: string | null;
  categoryName: string;
  products: number;
  quantity: number;
  revenue: number;
  cogs: number;
  lossMakingProducts: number;
  productsWithoutCost: number;
  productsWithPartialCost: number;
  grossMargin: number;
  grossMarginPercent: number;
  cogsStatus: 'READY' | 'PARTIAL_DATA';
};

export type ReportsCmv = {
  generatedAt: string;
  cmvStatus: 'READY' | 'PARTIAL_DATA';
  summary: {
    grossSales: number;
    cogs: number;
    quantity: number;
    grossMargin: number;
    grossMarginPercent: number;
    products: number;
    categories: number;
    lossMakingProducts: number;
    productsWithoutCost: number;
    productsWithPartialCost: number;
  };
  products: CmvProductRow[];
  categories: CmvCategoryRow[];
  lossMaking: CmvProductRow[];
  notes: string[];
};

export type AbcClass = 'A' | 'B' | 'C';

export type ReportsAbcStockItemRow = {
  rank: number;
  stockItemId: string;
  name: string;
  code: string | null;
  categoryName: string;
  unit: string | null;
  quantity: number;
  totalPurchased: number;
  samples: number;
  averageCost: number;
  weightedAverageCost: number;
  percent: number;
  cumulativePercent: number;
  abcClass: AbcClass;
  suggestedAction: string;
};

export type ReportsAbcStockItems = {
  generatedAt: string;
  source: string;
  summary: {
    items: number;
    totalPurchased: number;
    classA: number;
    classB: number;
    classC: number;
  };
  items: ReportsAbcStockItemRow[];
};

export type ReportsAbcProductRow = CmvProductRow & {
  percent: number;
  cumulativePercent: number;
  abcClass: AbcClass;
  suggestedAction: string;
};

export type ReportsAbcProducts = {
  generatedAt: string;
  source: string;
  summary: {
    products: number;
    revenue: number;
    classA: number;
    classB: number;
    classC: number;
  };
  items: ReportsAbcProductRow[];
};

export type ReportsWaiter = {
  generatedAt: string;
  items: Array<{
    rank: number;
    waiterUserId: string | null;
    name: string;
    orders: number;
    revenue: number;
    averageTicket: number;
  }>;
};

export type ReportsQueryParams = {
  from?: string;
  to?: string;
  branchId?: string;
  channel?: string;
};

export type ReportsPremium = {
  generatedAt: string;
  period: ReportsPeriod;
  scope: { companyId: string; branchId: string | null };
  executive: ReportsSummary;
  highlights: Record<string, unknown>;
  operational: Record<string, unknown>;
  sales: Record<string, unknown>;
  inventory: ReportsInventory;
  cmv: ReportsCmv;
  financial: Record<string, unknown>;
  branches: Record<string, unknown>;
  operators: Record<string, unknown>;
  sources: Record<string, boolean>;
};

function query(params?: ReportsQueryParams) {
  const search = new URLSearchParams();
  if (params?.from) search.set('from', params.from);
  if (params?.to) search.set('to', params.to);
  if (params?.branchId) search.set('branchId', params.branchId);
  if (params?.channel && params.channel !== 'ALL') search.set('channel', params.channel);
  const value = search.toString();
  return value ? `?${value}` : '';
}

export function getReportsOverview(params?: ReportsQueryParams) {
  return apiFetch<ReportsOverview>(`/v2/admin/reports/overview${query(params)}`, { method: 'GET' });
}

export function getReportsPremium(params?: ReportsQueryParams) {
  return apiFetch<ReportsPremium>(`/v2/admin/reports/premium${query(params)}`, { method: 'GET' });
}

export function getReportsInventory(params?: ReportsQueryParams) {
  return apiFetch<ReportsInventory>(`/v2/admin/reports/inventory${query(params)}`, { method: 'GET' });
}

export function getReportsAbcStockItems(params?: ReportsQueryParams) {
  return apiFetch<ReportsAbcStockItems>(`/v2/admin/reports/abc-stock-items${query(params)}`, { method: 'GET' });
}

export function getReportsAbcProducts(params?: ReportsQueryParams) {
  return apiFetch<ReportsAbcProducts>(`/v2/admin/reports/abc-products${query(params)}`, { method: 'GET' });
}

export function getReportsCmv(params?: ReportsQueryParams) {
  return apiFetch<ReportsCmv>(`/v2/admin/reports/cmv${query(params)}`, { method: 'GET' });
}

export function getReportsByWaiter(params?: ReportsQueryParams) {
  return apiFetch<ReportsWaiter>(`/v2/admin/reports/by-waiter${query(params)}`, { method: 'GET' });
}
