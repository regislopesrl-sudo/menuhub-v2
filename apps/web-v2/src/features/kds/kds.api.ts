import type { OrdersHeaders } from '@/features/orders/orders.api';
import { apiFetch } from '@/lib/api-fetch';

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
  };
}

export async function listKdsOrders(headers: OrdersHeaders): Promise<KdsBoardResponse> {
  return apiFetch<KdsBoardResponse>('/v2/kds/orders', {
    method: 'GET',
    headers: buildHeaders(headers),
  });
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
  return apiFetch<KdsOrderCard>(path, {
    method: 'PATCH',
    headers: buildHeaders(headers),
  });
}
