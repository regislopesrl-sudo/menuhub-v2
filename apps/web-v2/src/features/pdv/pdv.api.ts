import type { MenuProduct } from '@/features/menu/menu.mock';
import { fetchDeliveryMenu } from '@/features/menu/menu.api';
import { apiFetch } from '@/lib/api-fetch';

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
  openingBalance: number;
  totalSales: number;
  totalOrders: number;
  ordersCount: number;
  avgTicket: number;
  averageTicket: number;
  totalsByMethod: {
    cash: number;
    pix: number;
    card: number;
  };
  totalByPaymentMethod: {
    CASH: number;
    PIX: number;
    CARD: number;
  };
  cashSales: number;
  movementTotals: {
    supply: number;
    withdrawal: number;
    sale: number;
    adjustment: number;
  };
  supplies: number;
  withdrawals: number;
  adjustments: number;
  expectedCashAmount: number;
  declaredCashAmount?: number;
  cashDifference?: number;
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

export interface PdvOrderCheckoutResponse {
  order: {
    id: string;
    status: string;
  };
  payment?: {
    qrCode?: string;
    qrCodeText?: string;
  };
}

export interface PdvOpenSession {
  id: string;
  branchId: string;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  openingBalance: number;
}

export async function fetchPdvMenu(input: { companyId: string; branchId?: string }): Promise<MenuProduct[]> {
  return fetchDeliveryMenu(input);
}

export async function createPdvOrder(input: {
  companyId: string;
  branchId?: string;
  payload: PdvCheckoutPayload;
}): Promise<PdvOrderCheckoutResponse> {
  return apiFetch<PdvOrderCheckoutResponse>('/v2/channels/pdv/checkout', {
    method: 'POST',
    headers: pdvHeaders(input),
    body: JSON.stringify(input.payload),
  });
}

export async function openPdvSession(input: {
  companyId: string;
  branchId?: string;
  openingBalance?: number;
}): Promise<PdvOpenSession> {
  return apiFetch<PdvOpenSession>('/v2/pdv/sessions/open', {
    method: 'POST',
    headers: pdvHeaders(input),
    body: JSON.stringify({ openingBalance: input.openingBalance ?? 0 }),
  });
}

export async function getCurrentOpenPdvSession(input: { companyId: string; branchId?: string }): Promise<PdvOpenSession | null> {
  const payload = await apiFetch<unknown>('/v2/pdv/sessions/current/open', {
    method: 'GET',
    headers: pdvHeaders(input),
  });
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as Partial<PdvOpenSession>;
  if (!data.id || !data.branchId || !data.openedAt) return null;
  return {
    id: data.id,
    branchId: data.branchId,
    status: data.status === 'CLOSED' ? 'CLOSED' : 'OPEN',
    openedAt: data.openedAt,
    openingBalance: toNumber(data.openingBalance),
  };
}

export async function getPdvSessionSummary(input: {
  companyId: string;
  branchId?: string;
  sessionId: string;
}): Promise<PdvSessionSummary> {
  const payload = await apiFetch<unknown>(`/v2/pdv/sessions/${input.sessionId}/summary`, {
    method: 'GET',
    headers: pdvHeaders(input),
  });
  return normalizeSessionSummary(payload, input.sessionId);
}

export async function getCurrentPdvSessionSummary(input: {
  companyId: string;
  branchId?: string;
}): Promise<PdvSessionSummary | null> {
  const payload = await apiFetch<unknown>('/v2/pdv/sessions/current/summary', {
    method: 'GET',
    headers: pdvHeaders(input),
  });
  return payload ? normalizeSessionSummary(payload, '') : null;
}

export async function closePdvSession(input: {
  companyId: string;
  branchId?: string;
  sessionId: string;
  declaredCashAmount?: number;
}) {
  return apiFetch(`/v2/pdv/sessions/${input.sessionId}/close`, {
    method: 'POST',
    headers: pdvHeaders(input),
    body: JSON.stringify({ declaredCashAmount: input.declaredCashAmount }),
  });
}

export async function createPdvMovement(input: {
  companyId: string;
  branchId?: string;
  sessionId: string;
  type: PdvMovementType;
  amount: number;
  reason?: string;
}): Promise<PdvSessionMovement> {
  return apiFetch(`/v2/pdv/sessions/${input.sessionId}/movements`, {
    method: 'POST',
    headers: pdvHeaders(input),
    body: JSON.stringify({
      type: input.type,
      amount: input.amount,
      reason: input.reason,
    }),
  });
}

export async function listPdvMovements(input: {
  companyId: string;
  branchId?: string;
  sessionId: string;
}): Promise<PdvSessionMovement[]> {
  const payload = await apiFetch<unknown>(`/v2/pdv/sessions/${input.sessionId}/movements`, {
    method: 'GET',
    headers: pdvHeaders(input),
  });
  return Array.isArray(payload) ? payload.map(normalizeMovement) : [];
}

export async function listCurrentPdvMovements(input: {
  companyId: string;
  branchId?: string;
}): Promise<PdvSessionMovement[]> {
  const payload = await apiFetch<unknown>('/v2/pdv/sessions/current/movements', {
    method: 'GET',
    headers: pdvHeaders(input),
  });
  return Array.isArray(payload) ? payload.map(normalizeMovement) : [];
}

function pdvHeaders(input: { companyId: string; branchId?: string }): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-company-id': input.companyId,
    ...(input.branchId ? { 'x-branch-id': input.branchId } : {}),
    'x-channel': 'pdv',
  };
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSessionSummary(payload: unknown, sessionId: string): PdvSessionSummary {
  const data = payload && typeof payload === 'object' ? (payload as Partial<PdvSessionSummary>) : {};
  return {
    sessionId: typeof data.sessionId === 'string' ? data.sessionId : sessionId,
    branchId: typeof data.branchId === 'string' ? data.branchId : '',
    status: data.status === 'CLOSED' ? 'CLOSED' : 'OPEN',
    openedAt: typeof data.openedAt === 'string' ? data.openedAt : new Date().toISOString(),
    closedAt: typeof data.closedAt === 'string' ? data.closedAt : undefined,
    openingBalance: toNumber(data.openingBalance),
    totalSales: toNumber(data.totalSales),
    totalOrders: toNumber(data.totalOrders),
    ordersCount: toNumber((data as any).ordersCount ?? data.totalOrders),
    avgTicket: toNumber(data.avgTicket),
    averageTicket: toNumber((data as any).averageTicket ?? data.avgTicket),
    totalsByMethod: {
      cash: toNumber(data.totalsByMethod?.cash),
      pix: toNumber(data.totalsByMethod?.pix),
      card: toNumber(data.totalsByMethod?.card),
    },
    totalByPaymentMethod: {
      CASH: toNumber((data as any).totalByPaymentMethod?.CASH ?? data.totalsByMethod?.cash),
      PIX: toNumber((data as any).totalByPaymentMethod?.PIX ?? data.totalsByMethod?.pix),
      CARD: toNumber((data as any).totalByPaymentMethod?.CARD ?? data.totalsByMethod?.card),
    },
    cashSales: toNumber((data as any).cashSales ?? data.totalsByMethod?.cash),
    movementTotals: {
      supply: toNumber(data.movementTotals?.supply),
      withdrawal: toNumber(data.movementTotals?.withdrawal),
      sale: toNumber(data.movementTotals?.sale),
      adjustment: toNumber(data.movementTotals?.adjustment),
    },
    supplies: toNumber((data as any).supplies ?? data.movementTotals?.supply),
    withdrawals: toNumber((data as any).withdrawals ?? data.movementTotals?.withdrawal),
    adjustments: toNumber((data as any).adjustments ?? data.movementTotals?.adjustment),
    expectedCashAmount: toNumber(data.expectedCashAmount),
    declaredCashAmount: (data as any).declaredCashAmount !== undefined ? toNumber((data as any).declaredCashAmount) : undefined,
    cashDifference: (data as any).cashDifference !== undefined ? toNumber((data as any).cashDifference) : undefined,
    movementsCount: toNumber(data.movementsCount),
  };
}

function normalizeMovement(payload: unknown): PdvSessionMovement {
  const data = payload && typeof payload === 'object' ? (payload as Partial<PdvSessionMovement>) : {};
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
