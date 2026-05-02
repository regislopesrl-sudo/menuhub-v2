const API_BASE = process.env.NEXT_PUBLIC_API_V2_URL ?? 'http://localhost:3202';

export interface DeliveryQuoteResponse {
  available: boolean;
  areaId: string | null;
  areaName: string | null;
  fee: number;
  distanceMeters: number | null;
  distanceKm: number | null;
  durationSeconds: number | null;
  message: string | null;
  reason: string | null;
  estimatedMinutes: number;
  minimumOrder: number | null;
  address: {
    cep: string;
    street: string;
    neighborhood: string;
    city: string;
    state: string;
    lat: number;
    lng: number;
  };
}

export async function getDeliveryQuote(input: {
  companyId: string;
  branchId?: string;
  cep: string;
  number: string;
  subtotal?: number;
}): Promise<DeliveryQuoteResponse> {
  const params = new URLSearchParams({
    cep: input.cep,
    number: input.number,
    ...(typeof input.subtotal === 'number' ? { subtotal: String(input.subtotal) } : {}),
  });

  const res = await fetch(`${API_BASE}/v2/delivery/quote?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-company-id': input.companyId,
      ...(input.branchId ? { 'x-branch-id': input.branchId } : {}),
      'x-user-role': 'user',
      'x-channel': 'delivery',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error((await safeReadError(res)) ?? 'Falha ao cotar entrega.');
  }

  return (await res.json()) as DeliveryQuoteResponse;
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
