import { apiFetch } from '@/lib/api-fetch';
import type { CheckoutHeaders } from './checkout.api';

export interface OrderTrackingResponse {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  timeline: Array<{
    status: string;
    message: string;
    createdAt: string;
  }>;
  estimatedMinutes?: number;
  deliveryDistanceMeters: number;
  deliveryFee: number;
  total: number;
  trackingSecurity: 'tenant_header' | 'public_token';
}

export async function fetchOrderTracking(input: {
  headers: CheckoutHeaders;
  orderId: string;
}): Promise<OrderTrackingResponse> {
  return apiFetch<OrderTrackingResponse>(`/v2/orders/${encodeURIComponent(input.orderId)}/tracking`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-company-id': input.headers.companyId,
      ...(input.headers.branchId ? { 'x-branch-id': input.headers.branchId } : {}),
      'x-channel': 'delivery',
    },
  });
}

export async function fetchPublicOrderTracking(token: string): Promise<OrderTrackingResponse> {
  return apiFetch<OrderTrackingResponse>(`/v2/orders/tracking/${encodeURIComponent(token)}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-channel': 'delivery',
    },
  });
}

