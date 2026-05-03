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
  planKey?: 'basic' | 'pro' | 'enterprise';
}

function buildHeaders(input: { companyId?: string; branchId?: string; userRole?: string }) {
  return {
    'Content-Type': 'application/json',
    ...(input.branchId ? { 'x-branch-id': input.branchId } : {}),
  };
}

export async function listModules(headers: { companyId?: string; branchId?: string; userRole?: string }) {
  return apiFetch<ModuleDefinition[]>('/v2/modules', {
    method: 'GET',
    headers: buildHeaders(headers),
  });
}

export async function listCurrentCompanyModules(headers: { companyId?: string; branchId?: string; userRole?: string }) {
  return apiFetch<CompanyModuleAccess[]>('/v2/companies/current/modules', {
    method: 'GET',
    headers: buildHeaders(headers),
  });
}

export async function patchCurrentCompanyModule(input: {
  headers: { companyId?: string; branchId?: string; userRole?: string };
  moduleKey: string;
  enabled: boolean;
}) {
  return apiFetch<CompanyModuleAccess>(`/v2/companies/current/modules/${input.moduleKey}`, {
    method: 'PATCH',
    headers: buildHeaders(input.headers),
    body: JSON.stringify({ enabled: input.enabled }),
  });
}
