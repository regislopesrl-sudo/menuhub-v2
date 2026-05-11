import { apiFetch } from '@/lib/api-fetch';

export type StockItem = {
  id: string;
  name: string;
  code: string | null;
  stockUnit: string | null;
  purchaseUnit: string | null;
  productionUnit?: string | null;
  conversionFactor?: number;
  currentQuantity: number;
  minimumQuantity: number;
  reorderPoint: number;
  averageCost: number;
  lastCost?: number;
  leadTimeDays?: number;
  controlsStock?: boolean;
  controlsBatch: boolean;
  controlsExpiry: boolean;
  requiresFefo?: boolean;
  isPerishable: boolean;
  isFractionable?: boolean;
  isCritical?: boolean;
  isHighTurnover?: boolean;
  allowNegativeStock: boolean;
  updatedAt: string;
};

export type StockMovement = {
  id: string;
  stockItemId: string;
  batchId?: string | null;
  movementType: 'ENTRY' | 'EXIT' | 'ADJUSTMENT' | 'LOSS' | 'TRANSFER' | 'PRODUCTION_CONSUMPTION' | 'PRODUCTION_OUTPUT' | 'SALE_CONSUMPTION' | 'RETURN';
  movementTypeDetailed: string | null;
  quantity: number;
  unitCost: number;
  totalCost: number;
  previousStock: number | null;
  newStock: number | null;
  batch?: { batchNumber: string | null; expirationDate: string | null; status: string } | null;
  reasonCode: string | null;
  notes: string | null;
  createdAt: string;
};

export type StockBreakageAlert = {
  stockItemId: string;
  name: string;
  stockUnit: string | null;
  currentQuantity: number;
  minimumQuantity: number;
  reorderPoint: number;
  severity: 'medium' | 'high' | 'critical';
  type: 'stockout' | 'below_minimum' | 'below_reorder' | 'batch_expired' | 'batch_expiring';
  batchId?: string;
  batchNumber?: string | null;
  expirationDate?: string;
};

export type StockBatch = {
  id: string;
  stockItemId: string;
  batchNumber: string | null;
  receivedDate: string | null;
  expirationDate: string | null;
  initialQuantity: number;
  quantityRemaining: number;
  unitCost: number;
  status: string;
  sanitaryNotes: string | null;
  createdAt: string;
};

export function listStockItems() {
  return apiFetch<StockItem[]>('/v2/admin/stock/items', { method: 'GET' });
}

export function createStockItem(input: {
  name: string;
  code?: string;
  stockUnit?: string;
  purchaseUnit?: string;
  productionUnit?: string;
  conversionFactor?: number;
  minimumQuantity?: number;
  reorderPoint?: number;
  averageCost?: number;
  leadTimeDays?: number;
  controlsStock?: boolean;
  controlsBatch?: boolean;
  controlsExpiry?: boolean;
  requiresFefo?: boolean;
  isPerishable?: boolean;
  isFractionable?: boolean;
  isCritical?: boolean;
  isHighTurnover?: boolean;
  allowNegativeStock?: boolean;
}) {
  return apiFetch<StockItem>('/v2/admin/stock/items', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateStockItem(
  id: string,
  input: Partial<{
    name: string;
    code: string;
    stockUnit: string;
    purchaseUnit: string;
    productionUnit: string;
    conversionFactor: number;
    minimumQuantity: number;
    reorderPoint: number;
    averageCost: number;
    leadTimeDays: number;
    controlsStock: boolean;
    controlsBatch: boolean;
    controlsExpiry: boolean;
    requiresFefo: boolean;
    isPerishable: boolean;
    isFractionable: boolean;
    isCritical: boolean;
    isHighTurnover: boolean;
    allowNegativeStock: boolean;
  }>,
) {
  return apiFetch<StockItem>(`/v2/admin/stock/items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function listStockMovements(stockItemId?: string) {
  const query = stockItemId ? `?stockItemId=${encodeURIComponent(stockItemId)}` : '';
  return apiFetch<StockMovement[]>(`/v2/admin/stock/movements${query}`, { method: 'GET' });
}

export function stockManualEntry(input: {
  stockItemId: string;
  quantity: number;
  unitCost?: number;
  batchId?: string;
  reasonCode?: string;
  notes?: string;
}) {
  return apiFetch<{ item: StockItem; movement: StockMovement; movements?: StockMovement[] }>('/v2/admin/stock/movements/entry', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function stockManualExit(input: {
  stockItemId: string;
  quantity: number;
  unitCost?: number;
  batchId?: string;
  reasonCode?: string;
  notes?: string;
}) {
  return apiFetch<{ item: StockItem; movement: StockMovement; movements?: StockMovement[] }>('/v2/admin/stock/movements/exit', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function stockRegisterLoss(input: {
  stockItemId: string;
  quantity: number;
  unitCost?: number;
  batchId?: string;
  reasonCode?: string;
  notes?: string;
}) {
  return apiFetch<{ item: StockItem; movement: StockMovement; movements?: StockMovement[] }>('/v2/admin/stock/movements/loss', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function applyInventoryCounts(input: {
  counts: Array<{ stockItemId: string; countedQuantity: number; reasonCode?: string; notes?: string }>;
  notes?: string;
}) {
  return apiFetch<{
    appliedAt: string;
    totalItems: number;
    changedItems: number;
    results: Array<{ stockItemId: string; previousStock: number; countedQuantity: number; delta: number; movementId: string | null }>;
  }>('/v2/admin/stock/inventory/counts', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listStockBreakageAlerts() {
  return apiFetch<StockBreakageAlert[]>('/v2/admin/stock/alerts/breakage', { method: 'GET' });
}

export function listStockBatches(stockItemId: string) {
  return apiFetch<StockBatch[]>(`/v2/admin/stock/items/${stockItemId}/batches`, { method: 'GET' });
}

export function createStockBatch(
  stockItemId: string,
  input: { batchNumber?: string; expirationDate?: string; receivedDate?: string; initialQuantity: number; unitCost?: number; notes?: string },
) {
  return apiFetch<StockBatch>(`/v2/admin/stock/items/${stockItemId}/batches`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function estimateStockConversion(input: { stockItemId: string; quantity: number; fromUnit: string; toUnit: string }) {
  return apiFetch<{ stockItemId: string; fromUnit: string; toUnit: string; inputQuantity: number; convertedQuantity: number; conversionFactor: number }>(
    '/v2/admin/stock/conversions/estimate',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}
