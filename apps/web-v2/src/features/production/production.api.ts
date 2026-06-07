import { apiFetch } from '@/lib/api-fetch';

export type ProductionOrderStatus = 'PLANNED' | 'IN_PROGRESS' | 'FINISHED' | 'CANCELED';

export interface ProductionOrder {
  id: string;
  branchId: string;
  stockItemId: string;
  recipeId: string | null;
  plannedQuantity: number;
  actualQuantity: number | null;
  status: ProductionOrderStatus;
  startedAt: string | null;
  finishedAt: string | null;
  canceledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  stockItem?: { id: string; name: string } | null;
  recipe?: { id: string; name: string; yieldQuantity?: number; yieldUnit?: string } | null;
}

export interface ProductionLossEvent {
  id: string;
  sourceId: string | null;
  stockItemId: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  reasonCode: string | null;
  notes: string | null;
  createdAt: string;
}

export interface RecipeSubstitutionPreview {
  recipeId: string;
  from: { stockItemId: string; name: string | null; quantity: number; unitCost: number; totalCost: number };
  to: { stockItemId: string; name: string | null; quantity: number; unitCost: number; totalCost: number };
  ratio: number;
  impact: {
    grossCostBefore: number;
    grossCostAfter: number;
    totalCostBefore: number;
    totalCostAfter: number;
    deltaGrossCost: number;
    deltaTotalCost: number;
  };
}

export interface ProductMarginItem {
  productId: string;
  productName: string;
  recipeId: string;
  salePrice: number;
  promotionalPrice: number | null;
  effectiveSalePrice: number;
  costPerUnit: number;
  marginValue: number;
  marginPercent: number | null;
  health: 'unknown' | 'critical' | 'warning' | 'healthy';
}

export interface ProductMarginResponse {
  summary: { total: number; critical: number; warning: number; healthy: number };
  items: ProductMarginItem[];
}

export interface RecipeOption {
  id: string;
  name: string;
  yieldQuantity: number;
  yieldUnit: string;
  cost?: { totalCost?: number; costPerYieldUnit?: number };
}

export interface StockItemOption {
  id: string;
  name: string;
  code: string | null;
  stockType?: 'PRODUCT' | 'RAW_MATERIAL' | 'ADDON';
  category?: { id: string; name: string } | null;
  notes?: string | null;
  stockUnit?: string | null;
  purchaseUnit?: string | null;
  productionUnit?: string | null;
  conversionFactor?: number | null;
  currentQuantity?: number;
  averageCost?: number;
}

export function listProductionOrders() {
  return apiFetch<ProductionOrder[]>('/v2/admin/recipes/production-orders', {
    method: 'GET',
  });
}

export function listProductionRecipes() {
  return apiFetch<RecipeOption[]>('/v2/admin/recipes', {
    method: 'GET',
  });
}

export function listProductionStockItems() {
  return apiFetch<StockItemOption[]>('/v2/admin/stock/items', {
    method: 'GET',
  });
}

export function createProductionOrder(input: {
  stockItemId: string;
  recipeId?: string | null;
  plannedQuantity: number;
}) {
  return apiFetch<ProductionOrder>('/v2/admin/recipes/production-orders', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function startProductionOrder(orderId: string) {
  return apiFetch<ProductionOrder>(`/v2/admin/recipes/production-orders/${orderId}/start`, {
    method: 'PATCH',
  });
}

export function finishProductionOrder(orderId: string, actualQuantity?: number) {
  return apiFetch<ProductionOrder>(`/v2/admin/recipes/production-orders/${orderId}/finish`, {
    method: 'PATCH',
    body: JSON.stringify(actualQuantity ? { actualQuantity } : {}),
  });
}

export function cancelProductionOrder(orderId: string, reason: string) {
  return apiFetch<ProductionOrder>(`/v2/admin/recipes/production-orders/${orderId}/cancel`, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
  });
}

export function listProductionLosses() {
  return apiFetch<ProductionLossEvent[]>('/v2/admin/recipes/production-losses', {
    method: 'GET',
  });
}

export function registerProductionLoss(orderId: string, input: { quantity: number; reason?: string }) {
  return apiFetch<ProductionLossEvent>(`/v2/admin/recipes/production-orders/${orderId}/loss`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function previewRecipeSubstitution(
  recipeId: string,
  input: { fromStockItemId: string; toStockItemId: string; quantityRatio?: number },
) {
  return apiFetch<RecipeSubstitutionPreview>(`/v2/admin/recipes/${recipeId}/substitutions/preview`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function applyRecipeSubstitution(
  recipeId: string,
  input: { fromStockItemId: string; toStockItemId: string; quantityRatio?: number; reason?: string },
) {
  return apiFetch<{ applied: boolean; preview: RecipeSubstitutionPreview }>(
    `/v2/admin/recipes/${recipeId}/substitutions/apply`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function listProductMargins(minMarginPercent?: number) {
  const query = minMarginPercent === undefined ? '' : `?minMarginPercent=${encodeURIComponent(String(minMarginPercent))}`;
  return apiFetch<ProductMarginResponse>(`/v2/admin/recipes/compositions/products/margins${query}`, {
    method: 'GET',
  });
}
