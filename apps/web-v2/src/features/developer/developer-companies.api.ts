import { apiFetch } from '@/lib/api-fetch';

export type DeveloperCompany = {
  id: string;
  name: string | null;
  legalName: string;
  document: string | null;
  slug: string | null;
  email: string | null;
  phone: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  subscriptionStatus: 'ACTIVE' | 'TRIAL' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED' | null;
  planKey: string | null;
  planName: string | null;
  createdAt?: string;
  moduleStats: {
    totalInPlan: number;
    blockedOrOff: number;
    overrides: number;
  };
};

export type DeveloperCompanyModulesView = {
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
    source: 'plan' | 'override' | 'default';
    planKey: string | null;
    blockedReason: string | null;
    adminOnly: boolean;
    enabledByDefault: boolean;
  }>;
};

export async function listDeveloperCompanies(): Promise<DeveloperCompany[]> {
  return apiFetch<DeveloperCompany[]>('/v2/developer/companies', { method: 'GET' });
}

export async function getDeveloperCompanyModules(companyId: string): Promise<DeveloperCompanyModulesView> {
  return apiFetch<DeveloperCompanyModulesView>(`/v2/developer/companies/${companyId}/modules`, { method: 'GET' });
}

export async function patchDeveloperCompanyModule(input: {
  companyId: string;
  moduleKey: string;
  enabled: boolean;
}): Promise<unknown> {
  return apiFetch(`/v2/developer/companies/${input.companyId}/modules/${input.moduleKey}`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled: input.enabled }),
  });
}
