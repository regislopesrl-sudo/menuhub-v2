import type { CheckoutHeaders } from './checkout.api';

const API_BASE = process.env.NEXT_PUBLIC_API_V2_URL ?? 'http://localhost:3202';

export interface PixPaymentStatusResponse {
  providerPaymentId: string;
  paymentStatus: string;
  orderStatus: string;
  orderId: string;
  orderNumber: string;
}

export async function fetchPixPaymentStatus(input: {
  headers: CheckoutHeaders;
  providerPaymentId: string;
}): Promise<PixPaymentStatusResponse> {
  const res = await fetch(`${API_BASE}/v2/payments/${encodeURIComponent(input.providerPaymentId)}/status`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-company-id': input.headers.companyId,
      ...(input.headers.branchId ? { 'x-branch-id': input.headers.branchId } : {}),
      'x-user-role': 'user',
      'x-channel': 'delivery',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await safeReadError(res);
    throw new Error(text || 'Falha ao consultar status de pagamento PIX.');
  }

  return (await res.json()) as PixPaymentStatusResponse;
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
