import { apiFetch, getApiBase } from '@/lib/api-fetch';
import { getAuthSession } from '@/lib/auth-session';

export interface SettingsHeaders {
  companyId: string;
  branchId?: string;
  userRole?: 'admin' | 'master' | 'developer' | 'user';
}

export interface CompanySettingsResponse {
  companyId: string;
  branchId: string;
  tradeName: string;
  legalName: string;
  cnpj: string;
  phone: string;
  whatsapp: string;
  email: string;
  logoUrl: string;
  brandColor: string;
  timezone: string;
  currency: 'BRL';
  status: 'ACTIVE' | 'INACTIVE';
  publicTitle: string;
  publicDescription: string;
  deliveryStoreName?: string;
  deliveryHeroMedia?: string;
  bannerUrl: string;
  closedMessage: string;
}

export interface BranchSettingsResponse {
  branchId: string;
  companyId: string;
  name: string;
  code: string;
  phone: string;
  whatsapp: string;
  email: string;
  city: string;
  state: string;
  zipCode: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
  responsible: string;
  isOpen: boolean;
}

export interface BranchCepLookupResponse {
  cep: string;
  street: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
}

export interface OperationScheduleChannel {
  enabled: boolean;
  openAt: string | null;
  closeAt: string | null;
}

export interface OperationScheduleEntry {
  dayKey: string;
  label: string;
  isOpen: boolean;
  openAt: string | null;
  closeAt: string | null;
  breakStart: string | null;
  breakEnd: string | null;
  channels: Record<string, OperationScheduleChannel>;
}

export interface OperationSettingsResponse {
  branchId: string;
  schedules: OperationScheduleEntry[];
  channels: Record<string, boolean>;
  delivery: {
    minimumOrder: number;
    averagePrepMinutes: number;
    averageDeliveryMinutes: number;
    allowPickup: boolean;
    allowDelivery: boolean;
    serviceFee: number;
    pricingMode: 'area' | 'km';
    blockOutsideArea: boolean;
    allowCashOnDelivery: boolean;
    areas: Array<{
      id: string;
      name: string;
      pricingMode: 'area' | 'km';
      deliveryFee: number;
      baseFee: number;
      pricePerKm: number;
      estimatedMinutes: number;
      active: boolean;
      priority: number;
    }>;
  };
  fiscal: {
    serviceTax: number;
    fiscalObservation: string;
    futureFiscalEnabled: boolean;
    fiscalConfigured: boolean;
    fiscalEnvironment: string;
  };
  users: {
    enabled: boolean;
    message: string;
  };
  devices: {
    enabled: boolean;
    message: string;
  };
}

export interface PaymentSettingsResponse {
  branchId: string;
  debitActive: boolean;
  creditActive: boolean;
  pixActive: boolean;
  pixOnlineActive: boolean;
  creditOnlineActive: boolean;
  foodVoucherActive: boolean;
  mealVoucherActive: boolean;
  cashActive: boolean;
  onlineCardActive: boolean;
  presentCardActive: boolean;
  mercadoPagoMode: 'sandbox' | 'production';
  cardMode: 'mock' | 'mercadopago';
  webhookUrl: string;
  providerName: string;
  providerStatus: 'configured' | 'not_configured' | 'mock';
  secretStatus: 'configured' | 'not_configured';
}

export interface BranchSalesHistoryImportSummary {
  mode?: 'PREVIEW' | 'IMPORT';
  source?: 'IMPORTED_HISTORY' | 'IMPORTED_REAL_ORDERS';
  biCoverage?: 'LIVE_AND_IMPORTED' | 'LIVE_ORDERS';
  totalRows?: number;
  validRows?: number;
  invalidRows?: number;
  periodStart?: string | null;
  periodEnd?: string | null;
  grossAmount?: number;
  netAmount?: number;
  createdCount?: number;
  updatedCount?: number;
  skippedCount?: number;
  errorCount?: number;
  orderGroups?: number;
  stockConsumedOrders?: number;
  stockWarnings?: number;
  warningCount?: number;
  channels?: Record<string, number>;
  statuses?: Record<string, number>;
  paymentMethods?: Record<string, number>;
  missingDetails?: string[];
}

export interface BranchSalesHistoryImport {
  id: string;
  companyId: string;
  branchId: string;
  fileName: string;
  sourceFormat: string;
  status: 'PREVIEWED' | 'PROCESSING' | 'COMPLETED' | 'COMPLETED_WITH_ERRORS' | 'FAILED';
  detectedDelimiter: string | null;
  detectedColumns: string[] | null;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  summary: BranchSalesHistoryImportSummary | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface BranchSalesHistoryImportListResponse {
  items: BranchSalesHistoryImport[];
  total: number;
  source: 'IMPORTED_HISTORY' | 'IMPORTED_REAL_ORDERS';
}

function buildHeaders(input?: SettingsHeaders, withContentType = true) {
  return {
    ...(withContentType ? { 'Content-Type': 'application/json' } : {}),
    'x-channel': 'admin_panel',
    ...(input?.companyId ? { 'x-company-id': input.companyId } : {}),
    ...(input?.branchId ? { 'x-branch-id': input.branchId } : {}),
  };
}

function buildRawHeaders(input?: SettingsHeaders) {
  const headers = new Headers(buildHeaders(input, false));
  const session = getAuthSession();
  if (session?.accessToken) {
    headers.set('Authorization', `Bearer ${session.accessToken}`);
  }
  return headers;
}

export function getCompanySettings(headers?: SettingsHeaders) {
  return apiFetch<CompanySettingsResponse>('/v2/settings/company', {
    method: 'GET',
    headers: buildHeaders(headers),
  });
}

export function patchCompanySettings(headers: SettingsHeaders | undefined, body: Partial<CompanySettingsResponse>) {
  return apiFetch<CompanySettingsResponse>('/v2/settings/company', {
    method: 'PATCH',
    headers: buildHeaders(headers),
    body: JSON.stringify(body),
  });
}

export function getBranchSettings(headers?: SettingsHeaders) {
  return apiFetch<BranchSettingsResponse>('/v2/settings/branch', {
    method: 'GET',
    headers: buildHeaders(headers),
  });
}

export function patchBranchSettings(headers: SettingsHeaders | undefined, body: Partial<BranchSettingsResponse>) {
  return apiFetch<BranchSettingsResponse>('/v2/settings/branch', {
    method: 'PATCH',
    headers: buildHeaders(headers),
    body: JSON.stringify(body),
  });
}

export function lookupBranchAddressByCep(headers: SettingsHeaders | undefined, cep: string) {
  return apiFetch<BranchCepLookupResponse>(`/v2/settings/cep/${encodeURIComponent(cep)}`, {
    method: 'GET',
    headers: buildHeaders(headers),
  });
}

export function getOperationSettings(headers?: SettingsHeaders) {
  return apiFetch<OperationSettingsResponse>('/v2/settings/operation', {
    method: 'GET',
    headers: buildHeaders(headers),
  });
}

export function patchOperationSettings(headers: SettingsHeaders | undefined, body: Record<string, unknown>) {
  return apiFetch<OperationSettingsResponse>('/v2/settings/operation', {
    method: 'PATCH',
    headers: buildHeaders(headers),
    body: JSON.stringify(body),
  });
}

export function getPaymentSettings(headers?: SettingsHeaders) {
  return apiFetch<PaymentSettingsResponse>('/v2/settings/payments', {
    method: 'GET',
    headers: buildHeaders(headers),
  });
}

export function patchPaymentSettings(headers: SettingsHeaders | undefined, body: Partial<PaymentSettingsResponse>) {
  return apiFetch<PaymentSettingsResponse>('/v2/settings/payments', {
    method: 'PATCH',
    headers: buildHeaders(headers),
    body: JSON.stringify(body),
  });
}

export function listBranchSalesHistoryImports(headers: SettingsHeaders | undefined, branchId: string) {
  return apiFetch<BranchSalesHistoryImportListResponse>(
    `/v2/settings/branches/${encodeURIComponent(branchId)}/sales-history/imports`,
    {
      method: 'GET',
      headers: buildHeaders(headers),
    },
  );
}

export async function uploadBranchSalesHistory(
  headers: SettingsHeaders | undefined,
  branchId: string,
  file: File,
  mode: 'import' | 'validate' | 'import-real' | 'validate-real' = 'import',
) {
  const formData = new FormData();
  formData.append('file', file);
  const real = mode === 'import-real' || mode === 'validate-real';
  const validate = mode === 'validate' || mode === 'validate-real';
  const response = await fetch(
    `${getApiBase()}/v2/settings/branches/${encodeURIComponent(branchId)}/sales-history/import${
      real ? '/real' : ''
    }${validate ? '/validate' : ''}`,
    {
      method: 'POST',
      headers: buildRawHeaders(headers),
      body: formData,
      cache: 'no-store',
    },
  );
  if (!response.ok) {
    throw await buildRawRequestError(response);
  }
  return (await response.json()) as BranchSalesHistoryImport;
}

export async function downloadBranchSalesHistoryTemplate(
  headers: SettingsHeaders | undefined,
  branchId: string,
  target: 'history' | 'real' = 'history',
) {
  const response = await fetch(
    `${getApiBase()}/v2/settings/branches/${encodeURIComponent(branchId)}/sales-history/template${
      target === 'real' ? '/real' : ''
    }`,
    {
      method: 'GET',
      headers: buildRawHeaders(headers),
      cache: 'no-store',
    },
  );
  if (!response.ok) {
    throw await buildRawRequestError(response);
  }
  return response.blob();
}

async function buildRawRequestError(response: Response): Promise<Error> {
  let reason = `HTTP ${response.status}`;
  try {
    const body = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(body.message) && body.message.length > 0) {
      reason = body.message.join(', ');
    } else if (typeof body.message === 'string' && body.message.trim()) {
      reason = body.message;
    }
  } catch {
    // keep fallback reason
  }
  return new Error(reason);
}
