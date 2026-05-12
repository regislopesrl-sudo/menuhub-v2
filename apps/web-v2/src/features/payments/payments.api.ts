import { apiFetch } from '@/lib/api-fetch';

export type PaymentReconciliationDivergence =
  | 'reconciled'
  | 'pending'
  | 'missing_payment_snapshot'
  | 'status_mismatch';

export type PaymentReconciliationItem = {
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  paymentStatus: string;
  expectedPaymentStatus: 'PAID' | 'UNPAID' | 'PENDING' | 'REFUNDED' | null;
  provider: string | null;
  providerPaymentId: string | null;
  providerStatus: string | null;
  method: string | null;
  totalAmount: number;
  paidAmount: number;
  refundedAmount: number;
  divergence: PaymentReconciliationDivergence;
  recommendedAction: string;
  createdAt: string;
  updatedAt: string | null;
};

export type PaymentReconciliationResponse = {
  mode: 'mock';
  provider: string;
  scope: {
    companyId?: string | null;
    branchId?: string | null;
  };
  filters: {
    dateFrom: string | null;
    dateTo: string | null;
    limit: number;
  };
  summary: {
    totalOrders: number;
    reconciled: number;
    pending: number;
    missingPaymentSnapshot: number;
    statusMismatch: number;
    totalAmount: number;
    paidAmount: number;
    refundedAmount: number;
  };
  items: PaymentReconciliationItem[];
};

export async function getMockPaymentReconciliation(params?: { dateFrom?: string; dateTo?: string; limit?: number }) {
  const search = new URLSearchParams();
  if (params?.dateFrom) search.set('dateFrom', params.dateFrom);
  if (params?.dateTo) search.set('dateTo', params.dateTo);
  if (params?.limit) search.set('limit', String(params.limit));
  const qs = search.toString() ? `?${search.toString()}` : '';
  return apiFetch<PaymentReconciliationResponse>(`/v2/payments/reconciliation/mock${qs}`, { method: 'GET' });
}
