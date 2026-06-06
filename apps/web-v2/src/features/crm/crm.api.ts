import { apiFetch } from '@/lib/api-fetch';

export type CrmCustomer = {
  id: string;
  name: string;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  cpfCnpj?: string | null;
  isVip: boolean;
  isBlocked: boolean;
  loyaltyBalance: number;
  lastOrders: Array<{ id: string; totalAmount: number; createdAt: string; status: string }>;
  createdAt: string;
  updatedAt: string;
};

export type CrmCustomerHistory = {
  customer: CrmCustomer;
  orders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    channel: string;
    totalAmount: number;
    createdAt: string;
    items: Array<{ name: string; quantity: number; totalPrice: number }>;
  }>;
  loyaltyTransactions: Array<{
    id: string;
    transactionType: string;
    points: number;
    monetaryValue: number | null;
    balanceBefore: number | null;
    balanceAfter: number | null;
    description: string | null;
    createdAt: string;
  }>;
  reviews: unknown[];
};

export function listCrmCustomers(params?: { search?: string; limit?: number }) {
  const query = new URLSearchParams();
  if (params?.search) query.set('search', params.search);
  if (params?.limit) query.set('limit', String(params.limit));
  const qs = query.toString();
  return apiFetch<{ items: CrmCustomer[] }>(`/v2/crm/customers${qs ? `?${qs}` : ''}`, { method: 'GET' });
}

export function getCustomerHistory(customerId: string) {
  return apiFetch<CrmCustomerHistory>(`/v2/crm/customers/${customerId}/history`, { method: 'GET' });
}

export function getCustomerLoyalty(customerId: string) {
  return apiFetch<{ id: string; companyId: string; customerId: string; balance: number }>(`/v2/crm/loyalty/${customerId}`, {
    method: 'GET',
  });
}

export function adjustCustomerLoyalty(customerId: string, input: { points: number; reason?: string }) {
  return apiFetch<{ account: { balance: number }; transaction: { id: string; points: number } }>(
    `/v2/crm/loyalty/${customerId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
}
