const API_BASE = process.env.NEXT_PUBLIC_API_V2_URL ?? 'http://localhost:3202';

export async function getDeliveryFee(input: {
  companyId: string;
  branchId?: string;
  neighborhood: string;
}): Promise<number> {
  const params = new URLSearchParams({ neighborhood: input.neighborhood });
  const res = await fetch(`${API_BASE}/v2/delivery/fee?${params.toString()}`, {
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
    throw new Error('Falha ao calcular frete.');
  }

  const payload = (await res.json()) as { deliveryFee: number };
  return Number(payload.deliveryFee);
}

