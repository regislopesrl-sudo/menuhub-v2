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

const API_BASE = process.env.NEXT_PUBLIC_API_V2_URL ?? 'http://localhost:3202';

function buildHeaders(input: { companyId: string; branchId?: string; userRole?: 'admin' | 'master' | 'user' }) {
  return {
    'Content-Type': 'application/json',
    'x-company-id': input.companyId,
    ...(input.branchId ? { 'x-branch-id': input.branchId } : {}),
    'x-user-role': input.userRole ?? 'admin',
  };
}

export async function listModules(headers: { companyId: string; branchId?: string; userRole?: 'admin' | 'master' | 'user' }) {
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
  userRole?: 'admin' | 'master' | 'user';
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
  headers: { companyId: string; branchId?: string; userRole?: 'admin' | 'master' | 'user' };
  moduleKey: string;
  enabled: boolean;
}) {
  const res = await fetch(`${API_BASE}/v2/companies/current/modules/${input.moduleKey}`, {
    method: 'PATCH',
    headers: buildHeaders(input.headers),
    body: JSON.stringify({ enabled: input.enabled }),
  });
  if (!res.ok) {
    throw new Error((await safeReadError(res)) ?? 'Falha ao atualizar modulo.');
  }
  return (await res.json()) as CompanyModuleAccess;
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

