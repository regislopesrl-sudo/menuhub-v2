import { apiFetch } from '@/lib/api-fetch';

export type DeveloperPlan = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  modules: Array<{ moduleKey: string; enabled: boolean; adminOnly: boolean }>;
  limits: Array<{ limitKey: string; limitValue: number }>;
};

export function listDeveloperPlans() {
  return apiFetch<DeveloperPlan[]>('/v2/developer/plans', { method: 'GET' });
}

export function createDeveloperPlan(body: {
  key: string;
  name: string;
  description?: string;
  modules?: Array<{ moduleKey: string; enabled?: boolean; adminOnly?: boolean }>;
}) {
  return apiFetch<DeveloperPlan>('/v2/developer/plans', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateDeveloperPlan(
  id: string,
  body: {
    name?: string;
    description?: string | null;
    isActive?: boolean;
    modules?: Array<{ moduleKey: string; enabled?: boolean; adminOnly?: boolean }>;
  },
) {
  return apiFetch<DeveloperPlan>(`/v2/developer/plans/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function listDeveloperCompanyModules(companyId: string) {
  return apiFetch<Array<{ companyId: string; moduleKey: string; enabled: boolean; source: string; planKey?: string }>>(
    `/v2/developer/companies/${encodeURIComponent(companyId)}/modules`,
    { method: 'GET' },
  );
}

export function patchDeveloperCompanyModule(companyId: string, moduleKey: string, enabled: boolean) {
  return apiFetch<{ companyId: string; moduleKey: string; enabled: boolean; source: string; planKey?: string }>(
    `/v2/developer/companies/${encodeURIComponent(companyId)}/modules/${encodeURIComponent(moduleKey)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    },
  );
}
