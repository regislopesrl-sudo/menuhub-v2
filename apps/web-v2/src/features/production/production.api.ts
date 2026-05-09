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

function adminHeaders() {
  const companyId = process.env.NEXT_PUBLIC_MOCK_COMPANY_ID ?? 'company-demo';
  const branchId = process.env.NEXT_PUBLIC_MOCK_BRANCH_ID;
  return {
    'Content-Type': 'application/json',
    'x-channel': 'admin_panel',
    'x-company-id': companyId,
    ...(branchId ? { 'x-branch-id': branchId } : {}),
  };
}

export function listProductionOrders() {
  return apiFetch<ProductionOrder[]>('/v2/admin/recipes/production-orders', {
    method: 'GET',
    headers: adminHeaders(),
  });
}

export function createProductionOrder(input: {
  stockItemId: string;
  recipeId?: string | null;
  plannedQuantity: number;
}) {
  return apiFetch<ProductionOrder>('/v2/admin/recipes/production-orders', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(input),
  });
}

export function startProductionOrder(orderId: string) {
  return apiFetch<ProductionOrder>(`/v2/admin/recipes/production-orders/${orderId}/start`, {
    method: 'PATCH',
    headers: adminHeaders(),
  });
}

export function finishProductionOrder(orderId: string, actualQuantity?: number) {
  return apiFetch<ProductionOrder>(`/v2/admin/recipes/production-orders/${orderId}/finish`, {
    method: 'PATCH',
    headers: adminHeaders(),
    body: JSON.stringify(actualQuantity ? { actualQuantity } : {}),
  });
}

export function cancelProductionOrder(orderId: string, reason: string) {
  return apiFetch<ProductionOrder>(`/v2/admin/recipes/production-orders/${orderId}/cancel`, {
    method: 'PATCH',
    headers: adminHeaders(),
    body: JSON.stringify({ reason }),
  });
}

export function listProductionLosses() {
  return apiFetch<ProductionLossEvent[]>('/v2/admin/recipes/production-losses', {
    method: 'GET',
    headers: adminHeaders(),
  });
}

export function registerProductionLoss(orderId: string, input: { quantity: number; reason?: string }) {
  return apiFetch<ProductionLossEvent>(`/v2/admin/recipes/production-orders/${orderId}/loss`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(input),
  });
}

export function previewRecipeSubstitution(
  recipeId: string,
  input: { fromStockItemId: string; toStockItemId: string; quantityRatio?: number },
) {
  return apiFetch<RecipeSubstitutionPreview>(`/v2/admin/recipes/${recipeId}/substitutions/preview`, {
    method: 'POST',
    headers: adminHeaders(),
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
      headers: adminHeaders(),
      body: JSON.stringify(input),
    },
  );
}
