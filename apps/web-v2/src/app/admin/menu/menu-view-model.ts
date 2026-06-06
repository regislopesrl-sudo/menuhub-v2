import type { MenuProduct } from '@/features/menu/menu.mock';

export type AvailabilityFilter = 'all' | 'active' | 'inactive';
export type ChannelFilter = 'all' | keyof NonNullable<MenuProduct['channels']>;
export type AddonFilter = 'all' | 'with' | 'without';
export type ModalMode = 'create' | 'edit' | 'addons' | 'variations' | 'recommendations';
export type MenuTab =
  | 'products'
  | 'categories'
  | 'addons'
  | 'options'
  | 'combos'
  | 'availability'
  | 'media'
  | 'deliveryPublication'
  | 'featured'
  | 'import'
  | 'recommendations'
  | 'audit';
export type CategorySummary = { id?: string; name: string; count: number; active?: boolean; sortOrder?: number };
export type MenuStats = { active: number; unavailable: number; categoryCount: number; featured: number; noPrice: number };

export const CHANNEL_LABELS: Array<{ key: keyof NonNullable<MenuProduct['channels']>; label: string }> = [
  { key: 'delivery', label: 'Delivery' },
  { key: 'pdv', label: 'PDV' },
  { key: 'kiosk', label: 'Kiosk/Totem' },
  { key: 'waiter', label: 'Waiter' },
];

export function brl(value: number | undefined) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value ?? 0));
}

export function primaryPrice(product: MenuProduct): number {
  return Number(product.promotionalPrice ?? product.deliveryPrice ?? product.price ?? 0);
}

export function normalizeProduct(product: MenuProduct): MenuProduct {
  const available = product.available !== false;
  return {
    ...product,
    description: product.description ?? '',
    categoryName: product.categoryName ?? 'Sem categoria',
    sortOrder: Number(product.sortOrder ?? product.featuredSortOrder ?? 0),
    available,
    channels: {
      delivery: product.channels?.delivery ?? available,
      pdv: product.channels?.pdv ?? true,
      kiosk: product.channels?.kiosk ?? true,
      waiter: product.channels?.waiter ?? true,
    },
    variations: product.variations ?? [],
    comboItems: product.comboItems ?? [],
    addonGroups: product.addonGroups ?? [],
  };
}
