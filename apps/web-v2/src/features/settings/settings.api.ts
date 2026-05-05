import { apiFetch } from '@/lib/api-fetch';

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
  pixActive: boolean;
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

function buildHeaders(input: SettingsHeaders) {
  return {
    'Content-Type': 'application/json',
    'x-company-id': input.companyId,
    ...(input.branchId ? { 'x-branch-id': input.branchId } : {}),
    'x-channel': 'admin_panel',
  };
}

export function getCompanySettings(headers: SettingsHeaders) {
  return apiFetch<CompanySettingsResponse>('/v2/settings/company', {
    method: 'GET',
    headers: buildHeaders(headers),
  });
}

export function patchCompanySettings(headers: SettingsHeaders, body: Partial<CompanySettingsResponse>) {
  return apiFetch<CompanySettingsResponse>('/v2/settings/company', {
    method: 'PATCH',
    headers: buildHeaders(headers),
    body: JSON.stringify(body),
  });
}

export function getBranchSettings(headers: SettingsHeaders) {
  return apiFetch<BranchSettingsResponse>('/v2/settings/branch', {
    method: 'GET',
    headers: buildHeaders(headers),
  });
}

export function patchBranchSettings(headers: SettingsHeaders, body: Partial<BranchSettingsResponse>) {
  return apiFetch<BranchSettingsResponse>('/v2/settings/branch', {
    method: 'PATCH',
    headers: buildHeaders(headers),
    body: JSON.stringify(body),
  });
}

export function getOperationSettings(headers: SettingsHeaders) {
  return apiFetch<OperationSettingsResponse>('/v2/settings/operation', {
    method: 'GET',
    headers: buildHeaders(headers),
  });
}

export function patchOperationSettings(headers: SettingsHeaders, body: Record<string, unknown>) {
  return apiFetch<OperationSettingsResponse>('/v2/settings/operation', {
    method: 'PATCH',
    headers: buildHeaders(headers),
    body: JSON.stringify(body),
  });
}

export function getPaymentSettings(headers: SettingsHeaders) {
  return apiFetch<PaymentSettingsResponse>('/v2/settings/payments', {
    method: 'GET',
    headers: buildHeaders(headers),
  });
}

export function patchPaymentSettings(headers: SettingsHeaders, body: Partial<PaymentSettingsResponse>) {
  return apiFetch<PaymentSettingsResponse>('/v2/settings/payments', {
    method: 'PATCH',
    headers: buildHeaders(headers),
    body: JSON.stringify(body),
  });
}

