import { mockMenuProducts, type MenuProduct } from './menu.mock';

const API_BASE = process.env.NEXT_PUBLIC_API_V2_URL ?? 'http://localhost:3202';

export async function fetchDeliveryMenu(input: {
  companyId: string;
  branchId?: string;
}): Promise<MenuProduct[]> {
  const res = await fetch(`${API_BASE}/v2/menu`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-company-id': input.companyId,
      ...(input.branchId ? { 'x-branch-id': input.branchId } : {}),
      'x-user-role': 'user',
      'x-channel': 'delivery',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error('Falha ao carregar cardapio real.');
  }

  const payload = (await res.json()) as Array<{
    id: string;
    name: string;
    description?: string;
    price: number;
    categoryName?: string;
    available?: boolean;
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
  }>;

  return payload
    .filter((item) => item.available !== false)
    .map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description ?? '',
      price: Number(item.price),
      categoryName: item.categoryName,
      addonGroups: (item.addonGroups ?? []).map((group) => ({
        ...group,
        options: group.options.map((option) => ({
          ...option,
          price: Number(option.price),
        })),
      })),
    }));
}

export function getMenuFallback(): MenuProduct[] {
  return mockMenuProducts;
}
