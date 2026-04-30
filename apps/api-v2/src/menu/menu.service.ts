import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { RequestContext } from '../common/request-context';

export interface MenuItemDto {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  price: number;
  categoryName?: string;
  available: boolean;
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
}

@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ctx: RequestContext): Promise<MenuItemDto[]> {
    const products = await this.prisma.product.findMany({
      where: {
        companyId: ctx.companyId,
        isActive: true,
        deletedAt: null,
        availableDelivery: true,
      },
      include: {
        category: {
          select: {
            name: true,
          },
        },
        addonLinks: {
          include: {
            addonGroup: {
              include: {
                items: {
                  where: {
                    isActive: true,
                  },
                  orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
                },
              },
            },
          },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return products.map((product) => {
      const deliveryPrice = Number(product.deliveryPickupPrice);
      const salePrice = Number(product.salePrice);
      const promotionalPrice = product.promotionalPrice ? Number(product.promotionalPrice) : undefined;
      const resolvedPrice = promotionalPrice ?? (deliveryPrice > 0 ? deliveryPrice : salePrice);

      const addonGroups = product.addonLinks.map((link) => ({
        id: link.addonGroup.id,
        name: link.addonGroup.name,
        minSelect: link.addonGroup.minSelect,
        maxSelect: link.addonGroup.maxSelect,
        required: link.addonGroup.required,
        allowMultiple: link.addonGroup.allowMultiple,
        options: link.addonGroup.items.map((item) => ({
          id: item.id,
          name: item.name,
          price: Number(item.price),
          available: Boolean(item.isActive),
        })),
      }));

      return {
        id: product.id,
        name: product.name,
        description: product.description ?? undefined,
        imageUrl: product.imageUrl ?? undefined,
        price: resolvedPrice,
        categoryName: product.category?.name ?? undefined,
        available: Boolean(product.isActive && product.availableDelivery && !product.deletedAt),
        addonGroups,
      };
    });
  }
}
