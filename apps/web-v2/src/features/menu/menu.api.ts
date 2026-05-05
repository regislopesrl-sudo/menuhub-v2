import { mockMenuProducts, type MenuProduct, type MenuRecommendationConfig } from './menu.mock';
import { apiFetch } from '@/lib/api-fetch';

type MenuApiItem = {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  price: number;
  salePrice?: number;
  deliveryPrice?: number;
  promotionalPrice?: number;
  categoryId?: string;
  categoryName?: string;
  available?: boolean;
  availableDelivery?: boolean;
  availablePdv?: boolean;
  availableKiosk?: boolean;
  availableWaiter?: boolean;
  featured?: boolean;
  featuredSortOrder?: number;
  recommendations?: MenuRecommendationConfig;
  addonGroups?: Array<{
    id: string;
    name: string;
    minSelect: number;
    maxSelect: number;
    required: boolean;
    allowMultiple: boolean;
    options: Array<{
      id: string;
      name: string;
      price: number;
      available: boolean;
    }>;
  }>;
};

export async function fetchDeliveryMenu(input: {
  companyId: string;
  branchId?: string;
}): Promise<MenuProduct[]> {
  const payload = await apiFetch<unknown>('/v2/menu', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-company-id': input.companyId,
      ...(input.branchId ? { 'x-branch-id': input.branchId } : {}),
      'x-channel': 'delivery',
    },
  });

  const items = Array.isArray(payload) ? (payload as MenuApiItem[]) : [];
  return items
    .filter((item) => item.available !== false)
    .map(mapMenuItem);
}

export function getMenuFallback(): MenuProduct[] {
  return mockMenuProducts;
}

export async function fetchAdminMenu(input: {
  companyId: string;
  branchId?: string;
}): Promise<MenuProduct[]> {
  const request = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-company-id': input.companyId,
      ...(input.branchId ? { 'x-branch-id': input.branchId } : {}),
      'x-channel': 'admin',
    },
  } satisfies RequestInit;

  const payload = await apiFetch<unknown>('/v2/admin/menu/products', request).catch(() =>
    apiFetch<unknown>('/v2/menu', request),
  );

  const items = Array.isArray(payload) ? (payload as MenuApiItem[]) : [];

  return items.map(mapMenuItem);
}

function mapMenuItem(item: MenuApiItem): MenuProduct {
  const available = item.available !== false;
  return {
    id: item.id,
    name: item.name,
    description: item.description ?? '',
    imageUrl: item.imageUrl,
    price: Number(item.price ?? 0),
    salePrice: item.salePrice !== undefined ? Number(item.salePrice) : undefined,
    deliveryPrice: item.deliveryPrice !== undefined ? Number(item.deliveryPrice) : undefined,
    promotionalPrice: item.promotionalPrice !== undefined ? Number(item.promotionalPrice) : undefined,
    categoryId: item.categoryId,
    categoryName: item.categoryName ?? 'Sem categoria',
    available,
    featured: item.featured === true,
    featuredSortOrder: Number(item.featuredSortOrder ?? 0),
    recommendations: item.recommendations,
    channels: {
      delivery: item.availableDelivery ?? available,
      pdv: item.availablePdv ?? true,
      kiosk: item.availableKiosk ?? true,
      waiter: item.availableWaiter ?? true,
    },
    addonGroups: (item.addonGroups ?? []).map((group) => ({
      ...group,
      options: (group.options ?? []).map((option) => ({
        ...option,
        price: Number(option.price ?? 0),
        available: option.available !== false,
      })),
    })),
  };
}

export type AdminMenuProductPayload = {
  name: string;
  description?: string;
  categoryName?: string;
  salePrice: number;
  deliveryPrice?: number;
  promotionalPrice?: number | null;
  imageUrl?: string;
  available?: boolean;
  channels?: {
    delivery?: boolean;
    pdv?: boolean;
    kiosk?: boolean;
    waiter?: boolean;
  };
};

export type AdminMenuAddonGroupPayload = {
  name?: string;
  minSelect?: number;
  maxSelect?: number;
  required?: boolean;
  allowMultiple?: boolean;
};

export type AdminMenuAddonOptionPayload = {
  name?: string;
  price?: number;
  available?: boolean;
  sortOrder?: number;
};

export type MenuAddonGroup = NonNullable<MenuProduct['addonGroups']>[number];
export type MenuAddonOption = MenuAddonGroup['options'][number];
export type AdminMenuCategory = {
  id: string;
  name: string;
  count: number;
  active: boolean;
};

function adminHeaders(input: { companyId: string; branchId?: string }) {
  return {
    'Content-Type': 'application/json',
    'x-company-id': input.companyId,
    ...(input.branchId ? { 'x-branch-id': input.branchId } : {}),
    'x-channel': 'admin',
  };
}

export async function createAdminMenuProduct(input: {
  companyId: string;
  branchId?: string;
  payload: AdminMenuProductPayload;
}): Promise<MenuProduct> {
  return apiFetch<MenuProduct>('/v2/admin/menu/products', {
    method: 'POST',
    headers: adminHeaders(input),
    body: JSON.stringify(input.payload),
  });
}

export async function updateAdminMenuProduct(input: {
  companyId: string;
  branchId?: string;
  productId: string;
  payload: AdminMenuProductPayload;
}): Promise<MenuProduct> {
  return apiFetch<MenuProduct>(`/v2/admin/menu/products/${input.productId}`, {
    method: 'PATCH',
    headers: adminHeaders(input),
    body: JSON.stringify(input.payload),
  });
}

export async function updateAdminMenuProductAvailability(input: {
  companyId: string;
  branchId?: string;
  productId: string;
  available: boolean;
  channels?: AdminMenuProductPayload['channels'];
}): Promise<MenuProduct> {
  return apiFetch<MenuProduct>(`/v2/admin/menu/products/${input.productId}/availability`, {
    method: 'PATCH',
    headers: adminHeaders(input),
    body: JSON.stringify({ available: input.available, channels: input.channels }),
  });
}

export async function duplicateAdminMenuProduct(input: {
  companyId: string;
  branchId?: string;
  productId: string;
}): Promise<MenuProduct> {
  return apiFetch<MenuProduct>(`/v2/admin/menu/products/${input.productId}/duplicate`, {
    method: 'POST',
    headers: adminHeaders(input),
  });
}

export async function fetchAdminMenuCategories(input: {
  companyId: string;
  branchId?: string;
}): Promise<AdminMenuCategory[]> {
  return apiFetch<AdminMenuCategory[]>('/v2/admin/menu/categories', {
    method: 'GET',
    headers: adminHeaders(input),
  });
}

export async function createAdminMenuCategory(input: {
  companyId: string;
  branchId?: string;
  name: string;
}): Promise<AdminMenuCategory> {
  return apiFetch<AdminMenuCategory>('/v2/admin/menu/categories', {
    method: 'POST',
    headers: adminHeaders(input),
    body: JSON.stringify({ name: input.name }),
  });
}

export async function updateAdminMenuCategory(input: {
  companyId: string;
  branchId?: string;
  categoryId: string;
  payload: { name?: string; active?: boolean };
}): Promise<AdminMenuCategory> {
  return apiFetch<AdminMenuCategory>(`/v2/admin/menu/categories/${input.categoryId}`, {
    method: 'PATCH',
    headers: adminHeaders(input),
    body: JSON.stringify(input.payload),
  });
}

export async function deleteAdminMenuCategory(input: {
  companyId: string;
  branchId?: string;
  categoryId: string;
}): Promise<{ deleted: boolean; id: string; affectedProducts: number }> {
  return apiFetch(`/v2/admin/menu/categories/${input.categoryId}`, {
    method: 'DELETE',
    headers: adminHeaders(input),
  });
}

export type MenuImportPreview = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rows: Array<{
    line: number;
    raw: Record<string, string>;
    payload: Partial<AdminMenuProductPayload>;
    valid: boolean;
    errors: string[];
  }>;
};

export async function previewAdminMenuImport(input: {
  companyId: string;
  branchId?: string;
  csv: string;
}): Promise<MenuImportPreview> {
  return apiFetch<MenuImportPreview>('/v2/admin/menu/import/preview', {
    method: 'POST',
    headers: adminHeaders(input),
    body: JSON.stringify({ csv: input.csv }),
  });
}

export async function commitAdminMenuImport(input: {
  companyId: string;
  branchId?: string;
  csv: string;
}): Promise<{ importedCount: number; skippedCount: number; products: MenuProduct[]; errors: Array<{ line: number; error: string }> }> {
  return apiFetch('/v2/admin/menu/import/commit', {
    method: 'POST',
    headers: adminHeaders(input),
    body: JSON.stringify({ csv: input.csv }),
  });
}

export async function updateAdminMenuProductFeatured(input: {
  companyId: string;
  branchId?: string;
  productId: string;
  featured: boolean;
}): Promise<MenuProduct> {
  return apiFetch<MenuProduct>(`/v2/admin/menu/products/${input.productId}/featured`, {
    method: 'PATCH',
    headers: adminHeaders(input),
    body: JSON.stringify({ featured: input.featured }),
  });
}

export async function reorderAdminMenuFeatured(input: {
  companyId: string;
  branchId?: string;
  productIds: string[];
}): Promise<{ products: MenuProduct[] }> {
  return apiFetch('/v2/admin/menu/featured/reorder', {
    method: 'PATCH',
    headers: adminHeaders(input),
    body: JSON.stringify({ productIds: input.productIds }),
  });
}

export async function fetchAdminMenuRecommendations(input: {
  companyId: string;
  branchId?: string;
  productId: string;
}): Promise<MenuRecommendationConfig> {
  return apiFetch<MenuRecommendationConfig>(`/v2/admin/menu/products/${input.productId}/recommendations`, {
    method: 'GET',
    headers: adminHeaders(input),
  });
}

export async function saveAdminMenuRecommendations(input: {
  companyId: string;
  branchId?: string;
  productId: string;
  payload: MenuRecommendationConfig;
}): Promise<MenuRecommendationConfig> {
  return apiFetch<MenuRecommendationConfig>(`/v2/admin/menu/products/${input.productId}/recommendations`, {
    method: 'PUT',
    headers: adminHeaders(input),
    body: JSON.stringify(input.payload),
  });
}

export async function fetchAdminMenuProductAddonGroups(input: {
  companyId: string;
  branchId?: string;
  productId: string;
}): Promise<MenuAddonGroup[]> {
  return apiFetch<MenuAddonGroup[]>(`/v2/admin/menu/products/${input.productId}/addon-groups`, {
    method: 'GET',
    headers: adminHeaders(input),
  });
}

export async function createAdminMenuAddonGroup(input: {
  companyId: string;
  branchId?: string;
  productId: string;
  payload: AdminMenuAddonGroupPayload;
}): Promise<MenuAddonGroup> {
  return apiFetch<MenuAddonGroup>(`/v2/admin/menu/products/${input.productId}/addon-groups`, {
    method: 'POST',
    headers: adminHeaders(input),
    body: JSON.stringify(input.payload),
  });
}

export async function updateAdminMenuAddonGroup(input: {
  companyId: string;
  branchId?: string;
  groupId: string;
  payload: AdminMenuAddonGroupPayload;
}): Promise<MenuAddonGroup> {
  return apiFetch<MenuAddonGroup>(`/v2/admin/menu/addon-groups/${input.groupId}`, {
    method: 'PATCH',
    headers: adminHeaders(input),
    body: JSON.stringify(input.payload),
  });
}

export async function deleteAdminMenuAddonGroup(input: {
  companyId: string;
  branchId?: string;
  groupId: string;
}): Promise<{ deleted: boolean }> {
  return apiFetch(`/v2/admin/menu/addon-groups/${input.groupId}`, {
    method: 'DELETE',
    headers: adminHeaders(input),
  });
}

export async function createAdminMenuAddonOption(input: {
  companyId: string;
  branchId?: string;
  groupId: string;
  payload: AdminMenuAddonOptionPayload;
}): Promise<MenuAddonOption> {
  return apiFetch<MenuAddonOption>(`/v2/admin/menu/addon-groups/${input.groupId}/options`, {
    method: 'POST',
    headers: adminHeaders(input),
    body: JSON.stringify(input.payload),
  });
}

export async function updateAdminMenuAddonOption(input: {
  companyId: string;
  branchId?: string;
  optionId: string;
  payload: AdminMenuAddonOptionPayload;
}): Promise<MenuAddonOption> {
  return apiFetch<MenuAddonOption>(`/v2/admin/menu/addon-options/${input.optionId}`, {
    method: 'PATCH',
    headers: adminHeaders(input),
    body: JSON.stringify(input.payload),
  });
}

export async function deleteAdminMenuAddonOption(input: {
  companyId: string;
  branchId?: string;
  optionId: string;
}): Promise<{ deleted: boolean }> {
  return apiFetch(`/v2/admin/menu/addon-options/${input.optionId}`, {
    method: 'DELETE',
    headers: adminHeaders(input),
  });
}

