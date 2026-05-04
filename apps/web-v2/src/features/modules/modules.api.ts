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
    includedInPlan: boolean;
    overrideEnabled: boolean | null;
    effectiveEnabled: boolean;
    source: 'plan' | 'override';
    adminOnly: boolean;
    enabledByDefault: boolean;
  }>;
}

const API_BASE = process.env.NEXT_PUBLIC_API_V2_URL ?? 'http://localhost:3202';
export type AppUserRole = 'admin' | 'master' | 'user' | 'developer';

function buildHeaders(input: { companyId: string; branchId?: string; userRole?: AppUserRole }) {
  return {
    'Content-Type': 'application/json',
    'x-company-id': input.companyId,
    ...(input.branchId ? { 'x-branch-id': input.branchId } : {}),
    'x-user-role': input.userRole ?? 'admin',
  };
}

export async function listModules(headers: { companyId: string; branchId?: string; userRole?: AppUserRole }) {
  const res = await fetch(`${API_BASE}/v2/modules`, {
    method: 'GET',
    headers: buildHeaders(headers),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error((await safeReadError(res)) ?? 'Falha ao listar modulos.');
  }
  return (await res.json()) as ModuleDefinition[];
}

export async function listCurrentCompanyModules(headers: {
  companyId: string;
  branchId?: string;
  userRole?: AppUserRole;
}) {
  const res = await fetch(`${API_BASE}/v2/companies/current/modules`, {
    method: 'GET',
    headers: buildHeaders(headers),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error((await safeReadError(res)) ?? 'Falha ao carregar modulos da empresa.');
  }
  return (await res.json()) as CompanyModuleAccess[];
}

export async function patchCurrentCompanyModule(input: {
  headers: { companyId: string; branchId?: string; userRole?: AppUserRole };
  moduleKey: string;
  enabled: boolean | null;
  reason?: string;
}) {
  const res = await fetch(`${API_BASE}/v2/companies/current/modules/${input.moduleKey}`, {
    method: 'PATCH',
    headers: buildHeaders(input.headers),
    body: JSON.stringify({ enabled: input.enabled, reason: input.reason }),
  });
  if (!res.ok) {
    throw new Error((await safeReadError(res)) ?? 'Falha ao atualizar modulo.');
  }
  return (await res.json()) as CompanyModuleAccess;
}

export async function getCompanyModulesCommercialView(input: {
  headers: { companyId: string; branchId?: string; userRole?: AppUserRole };
  targetCompanyId: string;
}) {
  const res = await fetch(`${API_BASE}/v2/companies/${input.targetCompanyId}/modules`, {
    method: 'GET',
    headers: buildHeaders(input.headers),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error((await safeReadError(res)) ?? 'Falha ao carregar visao comercial de modulos.');
  }
  return (await res.json()) as CompanyModulesCommercialView;
}

async function safeReadError(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(', ');
    if (typeof body.message === 'string') return body.message;
    return null;
  } catch {
    return null;
  }
}
