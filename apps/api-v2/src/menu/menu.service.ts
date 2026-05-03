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
  featured?: boolean;
  featuredSortOrder?: number;
  recommendations?: {
    title: string;
    type: string;
    limit: number;
    active: boolean;
    productIds: string[];
  };
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
        ...this.channelAvailabilityWhere(ctx),
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

    const recommendations = await this.readRecommendations(ctx);

    return products.map((product: any) => {
      const deliveryPrice = Number(product.deliveryPickupPrice);
      const salePrice = Number(product.salePrice);
      const promotionalPrice = product.promotionalPrice ? Number(product.promotionalPrice) : undefined;
      const resolvedPrice = promotionalPrice ?? (deliveryPrice > 0 ? deliveryPrice : salePrice);

      const addonGroups = product.addonLinks.map((link: any) => ({
        id: link.addonGroup.id,
        name: link.addonGroup.name,
        minSelect: link.addonGroup.minSelect,
        maxSelect: link.addonGroup.maxSelect,
        required: link.addonGroup.required,
        allowMultiple: link.addonGroup.allowMultiple,
        options: link.addonGroup.items.map((item: any) => ({
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
        available: Boolean(product.isActive && this.isAvailableForChannel(product, ctx) && !product.deletedAt),
        featured: Boolean(product.isFeatured),
        featuredSortOrder: Number(product.sortOrder ?? 0),
        recommendations: this.normalizeRecommendation(recommendations[product.id]),
        addonGroups,
      };
    });
  }

  private async readRecommendations(ctx: RequestContext): Promise<Record<string, any>> {
    const branchId = ctx.branchId ?? (await this.prisma.branch.findFirst({
      where: { companyId: ctx.companyId },
      select: { id: true },
    }))?.id;
    if (!branchId) return {};
    const setting = await this.prisma.companySetting.findFirst({
      where: { companyId: ctx.companyId, branchId, key: 'menu.recommendations' },
      select: { value: true },
    });
    return setting?.value && typeof setting.value === 'object' && !Array.isArray(setting.value)
      ? (setting.value as Record<string, any>)
      : {};
  }

  private normalizeRecommendation(input: any) {
    if (!input) return undefined;
    return {
      title: input.title ?? 'Peca tambem',
      type: input.type ?? 'manual',
      limit: Number(input.limit ?? 4),
      active: input.active !== false,
      productIds: Array.isArray(input.productIds) ? input.productIds : [],
    };
  }

  private channelAvailabilityWhere(ctx: RequestContext) {
    if (ctx.channel === 'pdv') return { availableCounter: true };
    if (ctx.channel === 'kiosk') return { availableKiosk: true };
    if (ctx.channel === 'waiter_app') return { availableTable: true };
    return { availableDelivery: true };
  }

  private isAvailableForChannel(product: any, ctx: RequestContext): boolean {
    if (ctx.channel === 'pdv') return Boolean(product.availableCounter);
    if (ctx.channel === 'kiosk') return Boolean(product.availableKiosk);
    if (ctx.channel === 'waiter_app') return Boolean(product.availableTable);
    return Boolean(product.availableDelivery);
  }
}
