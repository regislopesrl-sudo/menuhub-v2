import { apiFetch } from '@/lib/api-fetch';

export type Supplier = {
  id: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  active: boolean;
};

export type PurchaseOrder = {
  id: string;
  status: string;
  supplierId: string;
  branchId: string;
  totalAmount: number;
  createdAt: string;
  supplier?: { id: string; name: string };
  items?: Array<{ id: string; stockItemId: string; quantity: number; unitCost: number; totalCost: number; unit: string }>;
};

export function listSuppliers() {
  return apiFetch<Supplier[]>('/v2/admin/procurement/suppliers', { method: 'GET' });
}

export function createSupplier(input: { name: string; document?: string; email?: string; phone?: string; notes?: string }) {
  return apiFetch<Supplier>('/v2/admin/procurement/suppliers', { method: 'POST', body: JSON.stringify(input) });
}

export function listPurchaseOrders() {
  return apiFetch<PurchaseOrder[]>('/v2/admin/procurement/purchase-orders', { method: 'GET' });
}

export function createPurchaseOrder(input: {
  supplierId: string;
  notes?: string;
  expectedDeliveryDate?: string;
  items: Array<{ stockItemId: string; quantity: number; unitCost: number; unit?: string }>;
}) {
  return apiFetch<PurchaseOrder>('/v2/admin/procurement/purchase-orders', { method: 'POST', body: JSON.stringify(input) });
}

export function receivePurchaseOrder(
  purchaseOrderId: string,
  input: {
    invoiceNumber?: string;
    invoiceKey?: string;
    dueDate?: string;
    items: Array<{ stockItemId: string; receivedQuantity: number; unitCost: number; orderedQuantity?: number; batchNumber?: string; expirationDate?: string }>;
  },
) {
  return apiFetch<{ receiptId: string; payableId: string; hasDivergence: boolean; totalReceived: number }>(
    `/v2/admin/procurement/purchase-orders/${purchaseOrderId}/receive`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export function listAccountsPayable() {
  return apiFetch<Array<{ id: string; description: string; amount: number; status: string; dueDate: string; supplier?: { id: string; name: string } }>>(
    '/v2/admin/procurement/accounts-payable',
    { method: 'GET' },
  );
}

