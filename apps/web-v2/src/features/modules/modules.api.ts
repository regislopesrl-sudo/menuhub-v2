import { buildDeveloperAccessHeaders } from '@/lib/developer-session';
import { apiFetch } from '@/lib/api-fetch';

export interface ModuleDefinition {
  key: string;
  name: string;
  enabledByDefault: boolean;
  adminOnly: boolean;
}

export interface CompanyModuleAccess {
  companyId: string;
  moduleKey: string;
  enabled: boolean;
  adminOnly: boolean;
  enabledByDefault: boolean;
  source: 'company_override' | 'plan' | 'default';
  planKey?: 'basic' | 'starter' | 'pro' | 'enterprise';
}

export interface CompanyModulesCommercialView {
  company: {
    id: string;
    name: string;
    legalName: string;
    document: string | null;
    slug: string | null;
    status: string;
  };
  subscription: {
    id: string;
    status: 'ACTIVE' | 'TRIAL' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';
    startsAt: string;
    endsAt: string | null;
    trialEndsAt: string | null;
  } | null;
  plan: {
    id: string;
    key: string;
    name: string;
  } | null;
  modules: Array<{
    moduleKey: string;
    key: string;
    label: string;
    description: string;
    includedInPlan: boolean;
    overrideEnabled: boolean | null;
    effectiveEnabled: boolean;
    source: 'plan' | 'override';
    planKey: string | null;
    blockedReason: string | null;
    adminOnly: boolean;
    enabledByDefault: boolean;
  }>;
}

export type AppUserRole = 'admin' | 'master' | 'user' | 'developer';

function buildHeaders(input: { companyId: string; branchId?: string; userRole?: AppUserRole }) {
  return {
    'Content-Type': 'application/json',
    'x-company-id': input.companyId,
    ...(input.branchId ? { 'x-branch-id': input.branchId } : {}),
    'x-user-role': input.userRole ?? 'admin',
    ...buildDeveloperAccessHeaders(),
  };
}

export async function listModules(headers: { companyId: string; branchId?: string; userRole?: AppUserRole }) {
  return apiFetch<ModuleDefinition[]>('/v2/modules', {
    method: 'GET',
    headers: buildHeaders(headers),
  });
}

export async function listCurrentCompanyModules(headers: {
  companyId: string;
  branchId?: string;
  userRole?: AppUserRole;
}) {
  return apiFetch<CompanyModuleAccess[]>('/v2/companies/current/modules', {
    method: 'GET',
    headers: buildHeaders(headers),
  });
}

export async function patchCurrentCompanyModule(input: {
  headers: { companyId: string; branchId?: string; userRole?: AppUserRole };
  moduleKey: string;
  enabled: boolean | null;
  reason?: string;
}) {
  return apiFetch<CompanyModuleAccess>(`/v2/companies/current/modules/${input.moduleKey}`, {
    method: 'PATCH',
    headers: buildHeaders(input.headers),
    body: JSON.stringify({ enabled: input.enabled, reason: input.reason }),
  });
}

export async function getCompanyModulesCommercialView(input: {
  headers: { companyId: string; branchId?: string; userRole?: AppUserRole };
  targetCompanyId: string;
}) {
  return apiFetch<CompanyModulesCommercialView>(`/v2/developer/companies/${input.targetCompanyId}/modules`, {
    method: 'GET',
    headers: buildHeaders(input.headers),
  });
}
