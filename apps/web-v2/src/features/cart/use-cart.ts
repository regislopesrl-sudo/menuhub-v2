'use client';

import { useMemo, useState } from 'react';
import type { MenuProduct } from '@/features/menu/menu.mock';

export interface CartItem {
  productId: string;
  name: string;
  unitPrice: number;
  addons: Array<{
    groupId: string;
    optionId: string;
    name: string;
    price: number;
  }>;
  quantity: number;
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = (
    product: MenuProduct,
    selectedAddons: Array<{ groupId: string; optionId: string; name: string; price: number }> = [],
  ) => {
    const addonsKey = selectedAddons.map((addon) => addon.optionId).sort().join('|');
    setItems((prev) => {
      const found = prev.find(
        (item) =>
          item.productId === product.id &&
          item.addons.map((addon) => addon.optionId).sort().join('|') === addonsKey,
      );
      if (found) {
        return prev.map((item) =>
          item === found ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          unitPrice: product.price,
          addons: selectedAddons,
          quantity: 1,
        },
      ];
    });
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateQuantity = (index: number, quantity: number) => {
    if (quantity <= 0) {
      removeItem(index);
      return;
    }
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, quantity } : item)));
  };

  const clearCart = () => setItems([]);

  const subtotal = useMemo(
    () =>
      items.reduce((sum, item) => {
        const addonsTotal = item.addons.reduce((addonsSum, addon) => addonsSum + addon.price, 0);
        return sum + item.quantity * (item.unitPrice + addonsTotal);
      }, 0),
    [items],
  );

  return {
    items,
    subtotal,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
  };
}
