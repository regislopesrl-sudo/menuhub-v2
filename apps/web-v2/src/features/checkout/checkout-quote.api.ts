import type { CartItem } from '@/features/cart/use-cart';

const API_BASE = process.env.NEXT_PUBLIC_API_V2_URL ?? 'http://localhost:3202';

export interface CheckoutQuoteResponse {
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  deliveryQuote: {
    available: boolean;
    areaId: string | null;
    areaName: string | null;
    fee: number;
    distanceMeters: number | null;
    distanceKm: number | null;
    durationSeconds: number | null;
    message: string | null;
    reason: string | null;
  };
  items: Array<{
    productId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    selectedOptions: Array<{ groupId: string; optionId: string; name: string; price: number }>;
    totalPrice: number;
  }>;
}

export async function postCheckoutQuote(input: {
  companyId: string;
  branchId?: string;
  storeId: string;
  items: CartItem[];
  couponCode?: string;
  deliveryAddress: {
    cep: string;
    number: string;
  };
}): Promise<CheckoutQuoteResponse> {
  const res = await fetch(`${API_BASE}/v2/checkout/quote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-company-id': input.companyId,
      ...(input.branchId ? { 'x-branch-id': input.branchId } : {}),
      'x-user-role': 'user',
      'x-channel': 'delivery',
    },
    body: JSON.stringify({
      storeId: input.storeId,
      items: input.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        selectedOptions: item.addons.map((addon) => ({
          groupId: addon.groupId,
          optionId: addon.optionId,
          name: addon.name,
          price: addon.price,
        })),
      })),
      couponCode: input.couponCode?.trim() ? input.couponCode.trim() : undefined,
      deliveryAddress: input.deliveryAddress,
    }),
  });

  if (!res.ok) {
    throw new Error((await safeReadError(res)) ?? 'Falha ao calcular pre-checkout.');
  }

  return (await res.json()) as CheckoutQuoteResponse;
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
