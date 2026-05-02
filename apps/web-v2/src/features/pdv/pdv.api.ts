import type { MenuProduct } from '@/features/menu/menu.mock';
import { fetchDeliveryMenu } from '@/features/menu/menu.api';

const API_BASE = process.env.NEXT_PUBLIC_API_V2_URL ?? 'http://localhost:3202';

export type PdvPaymentMethod = 'CASH' | 'PIX' | 'CREDIT_CARD';

export interface PdvCheckoutPayload {
  storeId: string;
  items: Array<{
    productId: string;
    quantity: number;
    selectedOptions?: Array<{
      groupId: string;
      optionId: string;
      name: string;
      price: number;
    }>;
  }>;
  paymentMethod: PdvPaymentMethod;
  customer?: {
    name: string;
    phone: string;
  };
  startInPreparation?: boolean;
}

export interface PdvSessionSummary {
  sessionId: string;
  branchId: string;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  closedAt?: string;
  totalSales: number;
  totalOrders: number;
  avgTicket: number;
  totalsByMethod: {
    cash: number;
    pix: number;
    card: number;
  };
  movementTotals: {
    supply: number;
    withdrawal: number;
    sale: number;
    adjustment: number;
  };
  expectedCashAmount: number;
  movementsCount: number;
}

export type PdvMovementType = 'SUPPLY' | 'WITHDRAWAL' | 'SALE' | 'ADJUSTMENT';

export interface PdvSessionMovement {
  id: string;
  sessionId: string;
  branchId: string;
  type: PdvMovementType;
  amount: number;
  reason?: string;
  createdAt: string;
}

export async function fetchPdvMenu(input: { companyId: string; branchId?: string }): Promise<MenuProduct[]> {
  return fetchDeliveryMenu(input);
}

export async function createPdvOrder(input: {
  companyId: string;
  branchId?: string;
  payload: PdvCheckoutPayload;
}) {
  const res = await fetch(`${API_BASE}/v2/channels/pdv/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-company-id': input.companyId,
      ...(input.branchId ? { 'x-branch-id': input.branchId } : {}),
      'x-user-role': 'admin',
      'x-channel': 'pdv',
    },
    body: JSON.stringify(input.payload),
  });

  if (!res.ok) {
    const message = await safeReadError(res);
    throw new Error(message ?? 'Falha ao finalizar pedido no PDV.');
  }

  return res.json();
}

export async function openPdvSession(input: {
  companyId: string;
  branchId?: string;
  openingBalance?: number;
}) {
  const res = await fetch(`${API_BASE}/v2/pdv/sessions/open`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-company-id': input.companyId,
      ...(input.branchId ? { 'x-branch-id': input.branchId } : {}),
      'x-user-role': 'admin',
      'x-channel': 'pdv',
    },
    body: JSON.stringify({ openingBalance: input.openingBalance ?? 0 }),
  });
  if (!res.ok) {
    throw new Error((await safeReadError(res)) ?? 'Falha ao abrir caixa.');
  }
  return res.json();
}

export async function getCurrentOpenPdvSession(input: { companyId: string; branchId?: string }) {
  const res = await fetch(`${API_BASE}/v2/pdv/sessions/current/open`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-company-id': input.companyId,
      ...(input.branchId ? { 'x-branch-id': input.branchId } : {}),
      'x-user-role': 'admin',
      'x-channel': 'pdv',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error((await safeReadError(res)) ?? 'Falha ao carregar caixa atual.');
  }
  const payload = await res.json();
  return payload && typeof payload === 'object' ? payload : null;
}

export async function getPdvSessionSummary(input: {
  companyId: string;
  branchId?: string;
  sessionId: string;
}): Promise<PdvSessionSummary> {
  const res = await fetch(`${API_BASE}/v2/pdv/sessions/${input.sessionId}/summary`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-company-id': input.companyId,
      ...(input.branchId ? { 'x-branch-id': input.branchId } : {}),
      'x-user-role': 'admin',
      'x-channel': 'pdv',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error((await safeReadError(res)) ?? 'Falha ao carregar resumo do caixa.');
  }
  return normalizeSessionSummary(await res.json(), input.sessionId);
}

export async function closePdvSession(input: {
  companyId: string;
  branchId?: string;
  sessionId: string;
  declaredCashAmount?: number;
}) {
  const res = await fetch(`${API_BASE}/v2/pdv/sessions/${input.sessionId}/close`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-company-id': input.companyId,
      ...(input.branchId ? { 'x-branch-id': input.branchId } : {}),
      'x-user-role': 'admin',
      'x-channel': 'pdv',
    },
    body: JSON.stringify({ declaredCashAmount: input.declaredCashAmount }),
  });
  if (!res.ok) {
    throw new Error((await safeReadError(res)) ?? 'Falha ao fechar caixa.');
  }
  return res.json();
}

export async function createPdvMovement(input: {
  companyId: string;
  branchId?: string;
  sessionId: string;
  type: PdvMovementType;
  amount: number;
  reason?: string;
}): Promise<PdvSessionMovement> {
  const res = await fetch(`${API_BASE}/v2/pdv/sessions/${input.sessionId}/movements`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-company-id': input.companyId,
      ...(input.branchId ? { 'x-branch-id': input.branchId } : {}),
      'x-user-role': 'admin',
      'x-channel': 'pdv',
    },
    body: JSON.stringify({
      type: input.type,
      amount: input.amount,
      reason: input.reason,
    }),
  });
  if (!res.ok) {
    throw new Error((await safeReadError(res)) ?? 'Falha ao registrar movimentacao.');
  }
  return (await res.json()) as PdvSessionMovement;
}

export async function listPdvMovements(input: {
  companyId: string;
  branchId?: string;
  sessionId: string;
}): Promise<PdvSessionMovement[]> {
  const res = await fetch(`${API_BASE}/v2/pdv/sessions/${input.sessionId}/movements`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-company-id': input.companyId,
      ...(input.branchId ? { 'x-branch-id': input.branchId } : {}),
      'x-user-role': 'admin',
      'x-channel': 'pdv',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error((await safeReadError(res)) ?? 'Falha ao carregar movimentacoes.');
  }
  const payload = await res.json();
  return Array.isArray(payload) ? payload.map(normalizeMovement) : [];
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSessionSummary(payload: unknown, sessionId: string): PdvSessionSummary {
  const data = payload && typeof payload === 'object' ? payload as Partial<PdvSessionSummary> : {};
  return {
    sessionId: typeof data.sessionId === 'string' ? data.sessionId : sessionId,
    branchId: typeof data.branchId === 'string' ? data.branchId : '',
    status: data.status === 'CLOSED' ? 'CLOSED' : 'OPEN',
    openedAt: typeof data.openedAt === 'string' ? data.openedAt : new Date().toISOString(),
    closedAt: typeof data.closedAt === 'string' ? data.closedAt : undefined,
    totalSales: toNumber(data.totalSales),
    totalOrders: toNumber(data.totalOrders),
    avgTicket: toNumber(data.avgTicket),
    totalsByMethod: {
      cash: toNumber(data.totalsByMethod?.cash),
      pix: toNumber(data.totalsByMethod?.pix),
      card: toNumber(data.totalsByMethod?.card),
    },
    movementTotals: {
      supply: toNumber(data.movementTotals?.supply),
      withdrawal: toNumber(data.movementTotals?.withdrawal),
      sale: toNumber(data.movementTotals?.sale),
      adjustment: toNumber(data.movementTotals?.adjustment),
    },
    expectedCashAmount: toNumber(data.expectedCashAmount),
    movementsCount: toNumber(data.movementsCount),
  };
}

function normalizeMovement(payload: unknown): PdvSessionMovement {
  const data = payload && typeof payload === 'object' ? payload as Partial<PdvSessionMovement> : {};
  return {
    id: typeof data.id === 'string' ? data.id : crypto.randomUUID(),
    sessionId: typeof data.sessionId === 'string' ? data.sessionId : '',
    branchId: typeof data.branchId === 'string' ? data.branchId : '',
    type: data.type ?? 'ADJUSTMENT',
    amount: toNumber(data.amount),
    reason: typeof data.reason === 'string' ? data.reason : undefined,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
  };
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
