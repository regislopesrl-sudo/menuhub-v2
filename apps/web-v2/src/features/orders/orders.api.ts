export interface OrderListItem {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  paymentStatus: string;
  createdAt: string;
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
  preparationStartedAt?: string;
  readyAt?: string;
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
  page?: number;
  limit?: number;
  createdFrom?: string;
  createdTo?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_V2_URL ?? 'http://localhost:3202';

function buildHeaders(input: OrdersHeaders): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-company-id': input.companyId,
    ...(input.branchId ? { 'x-branch-id': input.branchId } : {}),
    'x-user-role': input.userRole ?? 'admin',
  };
}

export async function listOrders(input: ListOrdersInput): Promise<OrdersListResponse> {
  const params = new URLSearchParams();
  if (input.status) params.set('status', input.status);
  if (input.page) params.set('page', String(input.page));
  if (input.limit) params.set('limit', String(input.limit));
  if (input.createdFrom) params.set('createdFrom', input.createdFrom);
  if (input.createdTo) params.set('createdTo', input.createdTo);

  const url = `${API_BASE}/v2/orders${params.toString() ? `?${params.toString()}` : ''}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(input.headers),
    cache: 'no-store',
  });

  if (!res.ok) {
    const message = await safeReadError(res);
    throw new Error(message || 'Falha ao listar pedidos.');
  }

  return (await res.json()) as OrdersListResponse;
}

export async function getOrderById(input: { id: string; headers: OrdersHeaders }): Promise<OrderDetail> {
  const res = await fetch(`${API_BASE}/v2/orders/${input.id}`, {
    method: 'GET',
    headers: buildHeaders(input.headers),
    cache: 'no-store',
  });

  if (!res.ok) {
    const message = await safeReadError(res);
    throw new Error(message || 'Falha ao carregar detalhe do pedido.');
  }

  return (await res.json()) as OrderDetail;
}

export async function patchOrderStatus(input: {
  id: string;
  status: string;
  headers: OrdersHeaders;
}): Promise<OrderDetail> {
  const url = `${API_BASE}/v2/orders/${input.id}/status`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: buildHeaders(input.headers),
    body: JSON.stringify({ status: input.status }),
  });

  if (!res.ok) {
    const message = await safeReadError(res);
    throw new Error(message || 'Falha ao atualizar status do pedido.');
  }

  return (await res.json()) as OrderDetail;
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
