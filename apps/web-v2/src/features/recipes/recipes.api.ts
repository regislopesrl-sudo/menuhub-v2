import { apiFetch } from '@/lib/api-fetch';

export type RecipeType = 'SALE' | 'PRODUCTION';

export type RecipeCost = {
  grossCost: number;
  totalCost: number;
  costPerYieldUnit: number;
};

export type RecipeItem = {
  id: string;
  stockItemId: string;
  stockItemName: string | null;
  quantity: number;
  unit: string;
  stockQuantity?: number | null;
  stockUnit?: string | null;
  optional: boolean;
  affectsStock: boolean;
  affectsCost: boolean;
  averageCost: number;
  totalCost: number;
};

export type Recipe = {
  id: string;
  companyId: string;
  name: string;
  type: RecipeType;
  yieldQuantity: number;
  yieldUnit: string;
  lossPercent: number | null;
  preparationSummary: string | null;
  notes: string | null;
  active: boolean;
  cost: RecipeCost;
  items: RecipeItem[];
  createdAt: string;
  updatedAt: string;
};

export type ProductRecipeComposition = {
  productId: string;
  productName: string;
  sku: string | null;
  recipeId: string | null;
  recipe: Recipe | null;
};

export type RecipeItemPayload = {
  stockItemId: string;
  quantity: number;
  unit: string;
  optional?: boolean;
  affectsStock?: boolean;
  affectsCost?: boolean;
};

export type RecipeCreatePayload = {
  name: string;
  type: RecipeType;
  yieldQuantity: number;
  yieldUnit: string;
  lossPercent?: number | null;
  preparationSummary?: string | null;
  notes?: string | null;
  items: RecipeItemPayload[];
};

export type RecipeUpdatePayload = Partial<{
  name: string;
  type: RecipeType;
  yieldQuantity: number;
  yieldUnit: string;
  lossPercent: number | null;
  preparationSummary: string | null;
  notes: string | null;
  active: boolean;
}>;

export type ProductRecipeCost = {
  productId: string;
  productName: string;
  recipeId: string;
  salePrice: number;
  promotionalPrice: number | null;
  effectiveSalePrice: number;
  soldPortionQuantity: number;
  soldPortionUnit: string;
  cost: {
    recipeTotalCost: number;
    recipeYieldQuantity: number;
    soldCost: number;
  };
  margin: {
    grossMarginValue: number;
    grossMarginPercent: number | null;
  };
};

export function listRecipes() {
  return apiFetch<Recipe[]>('/v2/admin/recipes', { method: 'GET' });
}

export function getProductRecipeComposition(productId: string) {
  return apiFetch<ProductRecipeComposition>(`/v2/admin/recipes/compositions/products/${productId}`, { method: 'GET' });
}

export function createRecipe(payload: RecipeCreatePayload) {
  return apiFetch<Recipe>('/v2/admin/recipes', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateRecipe(recipeId: string, payload: RecipeUpdatePayload) {
  return apiFetch<Recipe>(`/v2/admin/recipes/${recipeId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function replaceRecipeItems(recipeId: string, items: RecipeItemPayload[]) {
  return apiFetch<Recipe>(`/v2/admin/recipes/${recipeId}/items`, {
    method: 'PUT',
    body: JSON.stringify({ items }),
  });
}

export function linkProductRecipe(productId: string, recipeId: string | null) {
  return apiFetch<ProductRecipeComposition>(`/v2/admin/recipes/compositions/products/${productId}`, {
    method: 'PATCH',
    body: JSON.stringify({ recipeId }),
  });
}

export function getProductRecipeCost(productId: string) {
  return apiFetch<ProductRecipeCost>(`/v2/admin/recipes/compositions/products/${productId}/cost`, { method: 'GET' });
}
