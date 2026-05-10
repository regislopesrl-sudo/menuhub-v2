import { apiFetch } from '@/lib/api-fetch';

export type StockItem = {
  id: string;
  name: string;
  code: string | null;
  stockUnit: string | null;
  purchaseUnit: string | null;
  currentQuantity: number;
  minimumQuantity: number;
  reorderPoint: number;
  averageCost: number;
  controlsBatch: boolean;
  controlsExpiry: boolean;
  isPerishable: boolean;
  allowNegativeStock: boolean;
  updatedAt: string;
};

export type StockMovement = {
  id: string;
  stockItemId: string;
  movementType: 'ENTRY' | 'EXIT' | 'ADJUSTMENT' | 'LOSS' | 'TRANSFER' | 'PRODUCTION_CONSUMPTION' | 'PRODUCTION_OUTPUT' | 'SALE_CONSUMPTION' | 'RETURN';
  movementTypeDetailed: string | null;
  quantity: number;
  unitCost: number;
  totalCost: number;
  previousStock: number | null;
  newStock: number | null;
  reasonCode: string | null;
  notes: string | null;
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
  minimumQuantity?: number;
  reorderPoint?: number;
  averageCost?: number;
}) {
  return apiFetch<StockItem>('/v2/admin/stock/items', {
    method: 'POST',
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
  reasonCode?: string;
  notes?: string;
}) {
  return apiFetch<{ item: StockItem; movement: StockMovement }>('/v2/admin/stock/movements/entry', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function stockManualExit(input: {
  stockItemId: string;
  quantity: number;
  unitCost?: number;
  reasonCode?: string;
  notes?: string;
}) {
  return apiFetch<{ item: StockItem; movement: StockMovement }>('/v2/admin/stock/movements/exit', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
