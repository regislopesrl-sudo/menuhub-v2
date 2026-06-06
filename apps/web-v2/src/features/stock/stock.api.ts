import { apiFetch } from '@/lib/api-fetch';

export type StockItemType = 'PRODUCT' | 'RAW_MATERIAL' | 'ADDON';

export type StockCategory = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  _count?: { items: number };
};

export type StockItem = {
  id: string;
  categoryId?: string | null;
  supplierId?: string | null;
  sector?: string | null;
  notes?: string | null;
  category?: StockCategory | null;
  name: string;
  code: string | null;
  stockType: StockItemType;
  stockUnit: string | null;
  purchaseUnit: string | null;
  productionUnit?: string | null;
  conversionFactor?: number;
  currentQuantity: number;
  committedQuantity?: number;
  availableQuantity?: number;
  committedOrderCount?: number;
  minimumQuantity: number;
  reorderPoint: number;
  averageCost: number;
  lastCost?: number;
  standardCost?: number;
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
  isActive?: boolean;
  updatedAt: string;
};

export type StockDashboard = {
  totalItems: number;
  byType: Record<StockItemType, number>;
  totalValue: number;
  availableValue?: number;
  committedValue?: number;
  committedQuantity?: number;
  belowMinimum: number;
  belowAvailableMinimum?: number;
  reorderAttention: number;
  perishable: number;
  batchControlled: number;
  blockedBatches: number;
  expiringBatches: number;
  generatedAt: string;
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


export type StockOrderConsumptionReconcileResult = {
  orderId: string;
  orderNumber?: string;
  status?: string;
  action: 'consumed' | 'would_consume' | 'skip' | 'error';
  reason?: string;
  error?: string;
  movementCount?: number;
  totalCost?: number;
};

export type StockOrderConsumptionReconcileResponse = {
  dryRun: boolean;
  requested: number;
  scanned: number;
  consumed: number;
  wouldConsume: number;
  skipped: number;
  errors: number;
  results: StockOrderConsumptionReconcileResult[];
};

export type StockBreakageAlert = {
  stockItemId: string;
  name: string;
  stockUnit: string | null;
  currentQuantity: number;
  committedQuantity?: number;
  availableQuantity?: number;
  minimumQuantity: number;
  reorderPoint: number;
  severity: 'medium' | 'high' | 'critical';
  type: 'stockout' | 'below_minimum' | 'below_reorder' | 'committed_stockout' | 'available_below_minimum' | 'available_below_reorder' | 'batch_expired' | 'batch_expiring';
  batchId?: string;
  batchNumber?: string | null;
  expirationDate?: string;
};

export type StockProductAvailabilityIngredient = {
  stockItemId: string;
  name: string;
  code: string | null;
  stockType: StockItemType | null;
  stockUnit: string | null;
  recipeUnit: string | null;
  requiredPerUnit: number;
  currentQuantity: number;
  committedQuantity: number;
  availableQuantity: number;
  availableToSell: number;
  averageCost: number;
  costPerProductUnit: number;
  minimumQuantity: number;
  reorderPoint: number;
  controlsStock: boolean;
  isActive: boolean;
  optional: boolean;
};

export type StockProductAvailability = {
  productId: string;
  name: string;
  sku: string | null;
  categoryId: string | null;
  category: { id: string; name: string; sortOrder: number } | null;
  salePrice: number;
  costPrice: number;
  controlsStock: boolean;
  recipeId: string | null;
  recipe?: {
    id: string;
    name: string;
    yieldQuantity: number;
    yieldUnit: string | null;
    lossPercent: number;
    active: boolean;
  };
  availabilityStatus: 'available' | 'low_stock' | 'out_of_stock' | 'missing_recipe' | 'recipe_without_stock_items' | 'not_controlled';
  availableToSell: number | null;
  technicalCost: number;
  grossMargin: number | null;
  grossMarginPercent?: number | null;
  ingredients: StockProductAvailabilityIngredient[];
  limitingIngredients: StockProductAvailabilityIngredient[];
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

export function listStockCategories(includeInactive = false) {
  const query = includeInactive ? '?includeInactive=true' : '';
  return apiFetch<StockCategory[]>(`/v2/admin/stock/categories${query}`, { method: 'GET' });
}

export function createStockCategory(input: { name: string; sortOrder?: number; isActive?: boolean }) {
  return apiFetch<StockCategory>('/v2/admin/stock/categories', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateStockCategory(id: string, input: Partial<{ name: string; sortOrder: number; isActive: boolean }>) {
  return apiFetch<StockCategory>(`/v2/admin/stock/categories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function updateStockCategoryStatus(id: string, input: { isActive: boolean }) {
  return apiFetch<StockCategory>(`/v2/admin/stock/categories/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function getStockDashboard() {
  return apiFetch<StockDashboard>('/v2/admin/stock/dashboard', { method: 'GET' });
}

export function listStockAvailability() {
  return apiFetch<Array<{
    stockItemId: string;
    name: string;
    code: string | null;
    stockType: StockItemType;
    stockUnit: string | null;
    currentQuantity: number;
    committedQuantity: number;
    availableQuantity: number;
    committedOrderCount: number;
    minimumQuantity: number;
    reorderPoint: number;
    averageCost: number;
    availableValue: number;
    committedValue: number;
  }>>('/v2/admin/stock/availability', { method: 'GET' });
}

export function listStockProductAvailability() {
  return apiFetch<StockProductAvailability[]>('/v2/admin/stock/product-availability', { method: 'GET' });
}

export function updateProductStockControl(productId: string, controlsStock: boolean) {
  return apiFetch<{ id: string; controlsStock?: boolean }>(`/v2/admin/menu/products/${productId}`, {
    method: 'PATCH',
    body: JSON.stringify({ controlsStock }),
  });
}

export function getStockItem(id: string) {
  return apiFetch<StockItem>(`/v2/admin/stock/items/${id}`, { method: 'GET' });
}

export function createStockItem(input: {
  name: string;
  code?: string;
  categoryId?: string | null;
  supplierId?: string | null;
  sector?: string | null;
  notes?: string | null;
  stockType?: StockItemType;
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
    categoryId: string | null;
    supplierId: string | null;
    sector: string | null;
    notes: string | null;
    stockType: StockItemType;
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

export function updateStockItemStatus(id: string, input: { isActive: boolean }) {
  return apiFetch<StockItem>(`/v2/admin/stock/items/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function listStockMovements(filters?: {
  stockItemId?: string;
  batchId?: string;
  movementType?: string;
  from?: string;
  to?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.stockItemId) params.set('stockItemId', filters.stockItemId);
  if (filters?.batchId) params.set('batchId', filters.batchId);
  if (filters?.movementType) params.set('movementType', filters.movementType);
  if (filters?.from) params.set('from', filters.from);
  if (filters?.to) params.set('to', filters.to);
  const query = params.toString() ? `?${params.toString()}` : '';
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

export function applyBatchInventoryCount(input: {
  stockItemId: string;
  batchId: string;
  countedQuantity: number;
  reasonCode?: string;
  notes?: string;
}) {
  return apiFetch<{
    stockItemId: string;
    batchId: string;
    previousBatchQuantity: number;
    countedQuantity: number;
    delta: number;
    movementId: string | null;
    batch?: StockBatch;
    item?: StockItem;
  }>('/v2/admin/stock/inventory/batch-counts', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateStockBatchStatus(
  stockItemId: string,
  batchId: string,
  input: { status: 'AVAILABLE' | 'OPENED' | 'QUARANTINED' | 'DISCARDED' | 'EXPIRED'; notes?: string },
) {
  return apiFetch<StockBatch | { batch: StockBatch; item: StockItem }>(`/v2/admin/stock/items/${stockItemId}/batches/${batchId}/status`, {
    method: 'PATCH',
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


export function reconcileStockOrderConsumption(input: {
  orderId?: string;
  orderIds?: string[];
  dryRun?: boolean;
  limit?: number;
}) {
  return apiFetch<StockOrderConsumptionReconcileResponse>('/v2/admin/stock/orders/consumption/reconcile', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
