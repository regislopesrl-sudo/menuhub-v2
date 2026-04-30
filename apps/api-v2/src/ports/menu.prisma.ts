import { Injectable } from '@nestjs/common';
import type { MenuPort } from '@delivery-futuro/order-core';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class MenuPrismaPort implements MenuPort {
  constructor(private readonly prisma: PrismaService) {}

  async validateItems(input: Parameters<MenuPort['validateItems']>[0]) {
    const productIds = [...new Set(input.items.map((item) => item.productId))];
    const products = await this.prisma.product.findMany({
      where: {
        id: { in: productIds },
        companyId: input.companyId,
      },
      include: {
        addonLinks: {
          include: {
            addonGroup: {
              include: {
                items: {
                  where: { isActive: true },
                  select: {
                    id: true,
                    name: true,
                    price: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const productMap = new Map(products.map((product) => [product.id, product]));

    const validatedItems = input.items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new Error(`Item inexistente ou sem acesso para a empresa atual: ${item.productId}`);
      }
      if (!product.isActive || !product.availableDelivery || product.deletedAt) {
        throw new Error(`Item indisponivel para delivery: ${item.productId}`);
      }

      const deliveryPrice = this.resolveDeliveryPrice({
        deliveryPickupPrice: product.deliveryPickupPrice,
        promotionalPrice: product.promotionalPrice,
        salePrice: product.salePrice,
      });
      const allowedGroupMap = new Map(
        product.addonLinks.map((link) => [link.addonGroup.id, link.addonGroup]),
      );
      const selectedOptions = (item.selectedOptions ?? []).map((selectedOption) => {
        const group = allowedGroupMap.get(selectedOption.groupId);
        if (!group) {
          throw new Error(
            `Opcional invalido para item ${item.productId}: grupo ${selectedOption.groupId} nao pertence ao produto`,
          );
        }

        const option = group.items.find((groupItem) => groupItem.id === selectedOption.optionId);
        if (!option) {
          throw new Error(
            `Opcional invalido para item ${item.productId}: opcao ${selectedOption.optionId} nao encontrada`,
          );
        }

        return {
          groupId: group.id,
          optionId: option.id,
          name: option.name,
          price: Number(option.price),
        };
      });
      this.validateGroupRules(product.id, selectedOptions, allowedGroupMap);

      return {
        productId: product.id,
        name: product.name,
        quantity: item.quantity,
        unitPrice: deliveryPrice,
        selectedOptions,
      };
    });

    return {
      storeId: input.storeId,
      items: validatedItems,
    };
  }

  private resolveDeliveryPrice(input: {
    deliveryPickupPrice: unknown;
    promotionalPrice: unknown;
    salePrice: unknown;
  }): number {
    const deliveryPickupPrice = Number(input.deliveryPickupPrice ?? 0);
    if (deliveryPickupPrice > 0) {
      return deliveryPickupPrice;
    }

    const promotionalPrice = Number(input.promotionalPrice ?? 0);
    if (promotionalPrice > 0) {
      return promotionalPrice;
    }

    return Number(input.salePrice);
  }

  private validateGroupRules(
    productId: string,
    selectedOptions: Array<{ groupId: string; optionId: string; name: string; price: number }>,
    allowedGroupMap: Map<
      string,
      {
        id: string;
        name: string;
        minSelect: number;
        maxSelect: number;
        required: boolean;
        allowMultiple: boolean;
      }
    >,
  ): void {
    for (const group of allowedGroupMap.values()) {
      const selectedInGroup = selectedOptions.filter((option) => option.groupId === group.id);
      const selectedCount = selectedInGroup.length;

      if (group.required && selectedCount === 0) {
        throw new Error(
          `Grupo obrigatorio '${group.name}' sem selecao para item ${productId}`,
        );
      }

      if (group.minSelect > 0 && selectedCount < group.minSelect) {
        throw new Error(
          `Grupo '${group.name}' exige no minimo ${group.minSelect} opcao(oes) para item ${productId}`,
        );
      }

      if (group.maxSelect > 0 && selectedCount > group.maxSelect) {
        throw new Error(
          `Grupo '${group.name}' permite no maximo ${group.maxSelect} opcao(oes) para item ${productId}`,
        );
      }

      if (!group.allowMultiple && selectedCount > 1) {
        throw new Error(
          `Grupo '${group.name}' nao permite multiplas opcoes para item ${productId}`,
        );
      }
    }
  }
}
