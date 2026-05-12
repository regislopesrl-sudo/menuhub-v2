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

export type PurchaseDocumentItem = {
  id: string;
  lineNumber: number | null;
  description: string;
  quantity: number;
  unit: string | null;
  unitPrice: number | null;
  totalAmount: number | null;
  mappedStockItemId: string | null;
  conversionFactor: number;
  batchNumber: string | null;
  expirationDate: string | null;
  status: 'UNMAPPED' | 'MAPPED' | 'IGNORED' | 'CONFIRMED';
};

export type PurchaseDocument = {
  id: string;
  supplierId: string | null;
  documentType: 'NFE' | 'NFCE';
  accessKey: string;
  issuerCnpj: string | null;
  issuerName: string | null;
  emittedAt: string | null;
  totalAmount: number | null;
  status: 'PENDING_REVIEW' | 'PARTIALLY_MAPPED' | 'READY_TO_CONFIRM' | 'CONFIRMED' | 'CANCELED' | 'LOOKUP_FAILED';
  providerName: string | null;
  createdAt: string;
  items: PurchaseDocumentItem[];
};

export function listSuppliers() {
  return apiFetch<Supplier[]>('/v2/admin/procurement/suppliers', { method: 'GET' });
}

export function createSupplier(input: { name: string; document?: string; email?: string; phone?: string; notes?: string }) {
  return apiFetch<Supplier>('/v2/admin/procurement/suppliers', { method: 'POST', body: JSON.stringify(input) });
}

export function updateSupplier(supplierId: string, input: Partial<Pick<Supplier, 'name' | 'document' | 'email' | 'phone' | 'notes' | 'active'>>) {
  return apiFetch<Supplier>(`/v2/admin/procurement/suppliers/${supplierId}`, { method: 'PATCH', body: JSON.stringify(input) });
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

export function approvePurchaseOrder(purchaseOrderId: string) {
  return apiFetch<PurchaseOrder>(`/v2/admin/procurement/purchase-orders/${purchaseOrderId}/approve`, { method: 'POST' });
}

export function cancelPurchaseOrder(purchaseOrderId: string) {
  return apiFetch<PurchaseOrder>(`/v2/admin/procurement/purchase-orders/${purchaseOrderId}/cancel`, { method: 'POST' });
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

export function listPurchaseDocuments() {
  return apiFetch<PurchaseDocument[]>('/v2/admin/procurement/fiscal-documents', { method: 'GET' });
}

export function importPurchaseFiscalDocument(input: { accessKey: string; supplierId?: string; documentType?: 'NFE' | 'NFCE' }) {
  return apiFetch<PurchaseDocument>('/v2/admin/procurement/fiscal-documents/import-by-access-key', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function mapPurchaseFiscalDocumentItem(documentId: string, itemId: string, input: { stockItemId: string; conversionFactor?: number }) {
  return apiFetch<PurchaseDocumentItem>(`/v2/admin/procurement/fiscal-documents/${documentId}/items/${itemId}/mapping`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function ignorePurchaseFiscalDocumentItem(documentId: string, itemId: string) {
  return apiFetch<PurchaseDocumentItem>(`/v2/admin/procurement/fiscal-documents/${documentId}/items/${itemId}/ignore`, {
    method: 'PATCH',
  });
}

export function confirmPurchaseFiscalDocumentStockEntry(documentId: string) {
  return apiFetch<{ documentId: string; confirmed: boolean; movementsCreated?: number; reason?: string }>(
    `/v2/admin/procurement/fiscal-documents/${documentId}/confirm-stock-entry`,
    { method: 'POST' },
  );
}

