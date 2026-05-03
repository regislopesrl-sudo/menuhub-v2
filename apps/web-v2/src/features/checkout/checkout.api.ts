import type { CartItem } from '@/features/cart/use-cart';

export interface CheckoutHeaders {
  companyId: string;
  branchId?: string;
}

export interface OnlineCardPaymentInput {
  cardToken: string;
  paymentMethodId: string;
  installments: number;
  issuerId?: string;
  payerEmail: string;
  identificationType?: string;
  identificationNumber?: string;
}

export interface DeliveryCheckoutResponse {
  order: {
    id: string;
    orderNumber?: string;
    trackingToken?: string;
    status: string;
    totals: {
      subtotal: number;
      discount: number;
      deliveryFee: number;
      total: number;
    };
  };
  payment: {
    id?: string;
    provider?: string;
    providerPaymentId?: string;
    method?: string;
    status: string;
    transactionId?: string;
    reason?: string;
    qrCode?: string;
    qrCodeText?: string;
    expiresAt?: string;
  };
}

const API_BASE = process.env.NEXT_PUBLIC_API_V2_URL ?? 'http://localhost:3202';

export async function submitDeliveryCheckout(input: {
  headers: CheckoutHeaders;
  storeId: string;
  customer: {
    name: string;
    phone: string;
  };
  deliveryAddress: {
    cep?: string;
    street: string;
    number: string;
    neighborhood: string;
    city?: string;
    reference?: string;
  };
  items: CartItem[];
  couponCode?: string;
  paymentMethod: string;
  cardPayment?: OnlineCardPaymentInput;
}): Promise<DeliveryCheckoutResponse> {
  const res = await fetch(`${API_BASE}/v2/channels/delivery/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-company-id': input.headers.companyId,
      ...(input.headers.branchId ? { 'x-branch-id': input.headers.branchId } : {}),
      'x-channel': 'delivery',
    },
    body: JSON.stringify({
      storeId: input.storeId,
      customer: input.customer,
      deliveryAddress: input.deliveryAddress,
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
      paymentMethod: input.paymentMethod,
      cardPayment: input.cardPayment,
    }),
  });

  if (!res.ok) {
    const message = await safeReadError(res);
    throw new Error(message || 'Falha ao finalizar checkout.');
  }

  return (await res.json()) as DeliveryCheckoutResponse;
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


