import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { RequestContext } from '../common/request-context';
import { ModulesService } from '../modules/modules.service';
import { isProductVisibleOnChannel, resolvePublicMenuPrice } from './menu-visibility.policy';

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
  variations?: Array<{
    id: string;
    name: string;
    sku?: string;
    priceDelta: number;
    localPriceDelta: number;
    deliveryPriceDelta: number;
    active: boolean;
    sortOrder: number;
  }>;
}

@Injectable()
export class MenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly modulesService: ModulesService,
  ) {}

  async list(ctx: RequestContext): Promise<MenuItemDto[]> {
    if (!ctx?.companyId?.trim()) {
      throw new BadRequestException('Contexto de empresa ausente para carregar o cardapio.');
    }
    await this.assertMenuModuleEnabled(ctx.companyId);
    return this.listByCompanyId(ctx.companyId);
  }

  async listPublicByCompanySlug(companySlug: string, branchId?: string): Promise<MenuItemDto[]> {
    const slug = String(companySlug ?? '').trim().toLowerCase();
    if (!slug) {
      throw new BadRequestException('Slug da empresa e obrigatorio para carregar o cardapio publico.');
    }

    const company = await this.prisma.company.findFirst({
      where: { slug, status: 'ACTIVE' },
      select: { id: true },
    });

    if (!company) {
      throw new NotFoundException('Cardapio publico nao encontrado para esta empresa.');
    }

    await this.assertMenuModuleEnabled(company.id);
    if (branchId?.trim()) {
      await this.assertPublicBranchBelongsToCompany(company.id, branchId);
    }

    return this.listByCompanyId(company.id);
  }

  private async assertMenuModuleEnabled(companyId: string): Promise<void> {
    const access = await this.modulesService.checkAccess({
      companyId,
      moduleKey: 'menu',
      isAdmin: false,
    });

    if (!access.allowed) {
      throw new ForbiddenException('Cardapio indisponivel para esta empresa.');
    }
  }

  private async assertPublicBranchBelongsToCompany(companyId: string, branchId: string): Promise<void> {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId.trim(), companyId, isActive: true },
      select: { id: true },
    });
    if (!branch) {
      throw new NotFoundException('Filial publica nao encontrada para esta empresa.');
    }
  }

  private async listByCompanyId(companyId: string): Promise<MenuItemDto[]> {
    const products = await this.prisma.product.findMany({
      where: {
        companyId,
        isActive: true,
        deletedAt: null,
        availableDelivery: true,
      },
      include: {
        category: {
          select: {
            name: true,
            isActive: true,
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
        variations: {
          where: {
            isActive: true,
          },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return products
      .filter((product) => isProductVisibleOnChannel(product, 'delivery'))
      .filter((product) => product.category?.isActive !== false)
      .map((product) => {
      const resolvedPrice = resolvePublicMenuPrice({
        salePrice: product.salePrice,
        deliveryPickupPrice: product.deliveryPickupPrice,
        promotionalPrice: product.promotionalPrice,
      });

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
      const variations = (product.variations ?? []).map((variation: any) => ({
        id: variation.id,
        name: variation.name,
        sku: variation.sku ?? undefined,
        priceDelta: Number(variation.priceDelta ?? 0),
        localPriceDelta: Number(variation.localPriceDelta ?? 0),
        deliveryPriceDelta: Number(variation.deliveryPriceDelta ?? 0),
        active: variation.isActive !== false,
        sortOrder: Number(variation.sortOrder ?? 0),
      }));

        return {
        id: product.id,
        name: product.name,
        description: product.description ?? undefined,
        imageUrl: product.imageUrl ?? undefined,
        price: resolvedPrice,
        categoryName: product.category?.name ?? undefined,
        available: isProductVisibleOnChannel(product, 'delivery'),
        addonGroups,
        variations,
      };
      });
  }
}
