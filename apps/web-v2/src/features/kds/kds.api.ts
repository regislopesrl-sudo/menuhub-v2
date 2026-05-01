import type { OrdersHeaders } from '@/features/orders/orders.api';

const API_BASE = process.env.NEXT_PUBLIC_API_V2_URL ?? 'http://localhost:3202';

export interface KdsOrderCard {
  id: string;
  orderNumber: string;
  channel: string;
  status: string;
  createdAt: string;
  preparationStartedAt?: string;
  readyAt?: string;
  elapsedMinutes: number;
  totals: {
    subtotal: number;
    discount: number;
    deliveryFee: number;
    total: number;
  };
  customer?: {
    name: string;
    phone?: string;
  };
  deliveryAddress?: {
    street?: string;
    number?: string;
    neighborhood?: string;
    city?: string;
    reference?: string;
  };
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    selectedOptions?: Array<{
      optionId?: string | null;
      name: string;
      price: number;
      quantity: number;
    }>;
  }>;
}

export interface KdsBoardResponse {
  data: KdsOrderCard[];
  columns: {
    new: KdsOrderCard[];
    preparing: KdsOrderCard[];
    ready: KdsOrderCard[];
  };
}

function buildHeaders(input: OrdersHeaders): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-company-id': input.companyId,
    ...(input.branchId ? { 'x-branch-id': input.branchId } : {}),
    'x-user-role': input.userRole ?? 'admin',
  };
}

export async function listKdsOrders(headers: OrdersHeaders): Promise<KdsBoardResponse> {
  const res = await fetch(`${API_BASE}/v2/kds/orders`, {
    method: 'GET',
    headers: buildHeaders(headers),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error((await safeReadError(res)) ?? 'Falha ao carregar pedidos da cozinha.');
  }
  return (await res.json()) as KdsBoardResponse;
}

export async function startKdsOrder(id: string, headers: OrdersHeaders): Promise<KdsOrderCard> {
  return patchKdsOrder(`/v2/kds/orders/${id}/start`, headers);
}

export async function readyKdsOrder(id: string, headers: OrdersHeaders): Promise<KdsOrderCard> {
  return patchKdsOrder(`/v2/kds/orders/${id}/ready`, headers);
}

export async function bumpKdsOrder(id: string, headers: OrdersHeaders): Promise<KdsOrderCard> {
  return patchKdsOrder(`/v2/kds/orders/${id}/bump`, headers);
}

async function patchKdsOrder(path: string, headers: OrdersHeaders): Promise<KdsOrderCard> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: buildHeaders(headers),
  });
  if (!res.ok) {
    throw new Error((await safeReadError(res)) ?? 'Falha ao atualizar pedido da cozinha.');
  }
  return (await res.json()) as KdsOrderCard;
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
