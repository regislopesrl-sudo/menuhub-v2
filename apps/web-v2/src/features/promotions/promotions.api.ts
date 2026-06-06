import { apiFetch } from '@/lib/api-fetch';

export type Promotion = {
  id: string;
  name: string;
  description?: string;
  startsAt?: string;
  endsAt?: string;
  channels: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export function listPromotions() {
  return apiFetch<{ branchId: string; provider: string; items: Promotion[] }>('/v2/promotions', { method: 'GET' });
}

export function createPromotion(input: Partial<Promotion>) {
  return apiFetch<Promotion>('/v2/promotions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updatePromotion(id: string, input: Partial<Promotion>) {
  return apiFetch<Promotion>(`/v2/promotions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}
