export type MenuPublicChannel = 'delivery' | 'pdv' | 'kiosk' | 'waiter';

export interface MenuVisibilityInput {
  isActive: boolean;
  deletedAt: Date | string | null;
  availableDelivery?: boolean | null;
  availableCounter?: boolean | null;
  availableKiosk?: boolean | null;
  availableTable?: boolean | null;
}

export function isProductVisibleOnChannel(
  product: MenuVisibilityInput,
  channel: MenuPublicChannel,
): boolean {
  if (!product.isActive || product.deletedAt) return false;
  if (channel === 'delivery') return Boolean(product.availableDelivery);
  if (channel === 'pdv') return Boolean(product.availableCounter);
  if (channel === 'kiosk') return Boolean(product.availableKiosk ?? product.availableCounter);
  return Boolean(product.availableTable);
}

export function resolvePublicMenuPrice(input: {
  salePrice: unknown;
  deliveryPickupPrice?: unknown;
  promotionalPrice?: unknown;
}): number {
  const salePrice = Number(input.salePrice ?? 0);
  const deliveryPrice = Number(input.deliveryPickupPrice ?? 0);
  const promotionalPrice =
    input.promotionalPrice === null || input.promotionalPrice === undefined
      ? undefined
      : Number(input.promotionalPrice);

  const base = promotionalPrice ?? (deliveryPrice > 0 ? deliveryPrice : salePrice);
  return Number.isFinite(base) && base >= 0 ? base : 0;
}
