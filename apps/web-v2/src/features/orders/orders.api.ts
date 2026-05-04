import { apiFetch } from '@/lib/api-fetch';

export interface OrderListItem {
  id: string;
  orderNumber: string;
  channel?: string;
  customerName?: string;
  status: string;
  total: number;
  paymentStatus: string;
  createdAt: string;
  updatedAt?: string;
  statusUpdatedAt?: string;
  elapsedMinutes: number;
  isDelayed: boolean;
  delayLevel: 'none' | 'attention' | 'urgent';
}

export interface OrderDetailItem {
  id: string;
  productId?: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  selectedOptions?: Array<{
    optionId?: string | null;
    name: string;
    price: number;
    quantity: number;
  }>;
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  channel?: string;
  status: string;
  totals: {
    subtotal: number;
    discount: number;
    deliveryFee: number;
    total: number;
  };
  items: OrderDetailItem[];
  customer?: {
    name: string;
    phone?: string;
  };
  deliveryAddress?: {
    street?: string;
    number?: string;
    neighborhood?: string;
    reference?: string;
  };
  paymentSummary?: {
    status: string;
    paidAmount: number;
    refundedAmount: number;
  };
  createdAt: string;
  updatedAt?: string;
  statusUpdatedAt?: string;
  elapsedMinutes: number;
  isDelayed: boolean;
  delayLevel: 'none' | 'attention' | 'urgent';
  preparationStartedAt?: string;
  readyAt?: string;
  timeline?: Array<{
    type: string;
    label: string;
    status: string;
    message: string;
    createdAt: string;
    at: string;
    actor: {
      role: string;
      name: string;
    };
  }>;
  timelineSource?: 'events' | 'fallback';
}

export interface OrderSummary {
  totalOrders: number;
  activeOrders: number;
  delayedOrders: number;
  preparingOrders: number;
  readyOrders: number;
  canceledOrders: number;
  grossRevenue: number;
  netRevenue: number;
  canceledRevenue: number;
  averageTicket: number;
  ordersByChannel: Record<string, number>;
  ordersByStatus: Record<string, number>;
  paymentsByStatus: Record<string, number>;
  dateFrom: string;
  dateTo: string;
}

export interface OrdersListResponse {
  data: OrderListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface OrdersHeaders {
  companyId: string;
  branchId?: string;
  userRole?: 'admin' | 'master' | 'user';
}

export interface ListOrdersInput {
  headers: OrdersHeaders;
  status?: string;
  channel?: string;
  paymentStatus?: string;
  activeOnly?: boolean;
  delayedOnly?: boolean;
  search?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'total' | 'status';
  sortDirection?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  createdFrom?: string;
  createdTo?: string;
}

export interface GetOrderSummaryInput {
  headers: OrdersHeaders;
  dateFrom?: string;
  dateTo?: string;
  channel?: string;
}

function buildHeaders(input: OrdersHeaders): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-company-id': input.companyId,
    ...(input.branchId ? { 'x-branch-id': input.branchId } : {}),
  };
}

export async function listOrders(input: ListOrdersInput): Promise<OrdersListResponse> {
  const params = new URLSearchParams();
  if (input.status) params.set('status', input.status);
  if (input.channel) params.set('channel', input.channel);
  if (input.paymentStatus) params.set('paymentStatus', input.paymentStatus);
  if (input.activeOnly !== undefined) params.set('activeOnly', String(input.activeOnly));
  if (input.delayedOnly !== undefined) params.set('delayedOnly', String(input.delayedOnly));
  if (input.search) params.set('search', input.search);
  if (input.sortBy) params.set('sortBy', input.sortBy);
  if (input.sortDirection) params.set('sortDirection', input.sortDirection);
  if (input.page) params.set('page', String(input.page));
  if (input.limit) params.set('limit', String(input.limit));
  if (input.createdFrom) params.set('createdFrom', input.createdFrom);
  if (input.createdTo) params.set('createdTo', input.createdTo);

  const path = `/v2/orders${params.toString() ? `?${params.toString()}` : ''}`;
  return apiFetch<OrdersListResponse>(path, {
    method: 'GET',
    headers: buildHeaders(input.headers),
  });
}

export async function getOrderSummary(input: GetOrderSummaryInput): Promise<OrderSummary> {
  const params = new URLSearchParams();
  if (input.dateFrom) params.set('dateFrom', input.dateFrom);
  if (input.dateTo) params.set('dateTo', input.dateTo);
  if (input.channel) params.set('channel', input.channel);

  const path = `/v2/orders/summary${params.toString() ? `?${params.toString()}` : ''}`;
  return apiFetch<OrderSummary>(path, {
    method: 'GET',
    headers: buildHeaders(input.headers),
  });
}

export async function getOrderById(input: { id: string; headers: OrdersHeaders }): Promise<OrderDetail> {
  return apiFetch<OrderDetail>(`/v2/orders/${input.id}`, {
    method: 'GET',
    headers: buildHeaders(input.headers),
  });
}

export async function patchOrderStatus(input: {
  id: string;
  status: string;
  headers: OrdersHeaders;
}): Promise<OrderDetail> {
  return apiFetch<OrderDetail>(`/v2/orders/${input.id}/status`, {
    method: 'PATCH',
    headers: buildHeaders(input.headers),
    body: JSON.stringify({ status: input.status }),
  });
}

