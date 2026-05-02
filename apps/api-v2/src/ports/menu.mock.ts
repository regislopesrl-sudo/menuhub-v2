import { Injectable } from '@nestjs/common';
import type { MenuPort } from '@delivery-futuro/order-core';

const MENU_CATALOG: Record<string, { name: string; unitPrice: number }> = {
  pizza_1: { name: 'Pizza Calabresa', unitPrice: 59.9 },
  refri_1: { name: 'Refrigerante Lata', unitPrice: 7.5 },
};

const ADDON_CATALOG: Record<string, { groupId: string; name: string; price: number }> = {
  add_1: { groupId: 'grp_1', name: 'Queijo extra', price: 4 },
  add_2: { groupId: 'grp_1', name: 'Bacon', price: 6 },
};

@Injectable()
export class MenuPortMock implements MenuPort {
  async validateItems(input: Parameters<MenuPort['validateItems']>[0]) {
    const validatedItems = input.items.map((item) => {
      const catalogItem = MENU_CATALOG[item.productId];
      if (!catalogItem) {
        throw new Error(`Item inexistente no cardapio: ${item.productId}`);
      }
      const selectedOptions = (item.selectedOptions ?? []).map((selectedOption) => {
        const catalogOption = ADDON_CATALOG[selectedOption.optionId];
        if (!catalogOption || catalogOption.groupId !== selectedOption.groupId) {
          throw new Error(`Opcional invalido para item ${item.productId}: ${selectedOption.optionId}`);
        }
        return {
          groupId: catalogOption.groupId,
          optionId: selectedOption.optionId,
          name: catalogOption.name,
          price: catalogOption.price,
        };
      });
      return {
        productId: item.productId,
        name: catalogItem.name,
        quantity: item.quantity,
        unitPrice: catalogItem.unitPrice,
        selectedOptions,
      };
    });

    return {
      storeId: input.storeId,
      items: validatedItems,
    };
  }
}
