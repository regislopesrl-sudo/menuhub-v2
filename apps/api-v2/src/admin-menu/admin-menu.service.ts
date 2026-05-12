import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { RequestContext } from '../common/request-context';
import { PrismaService } from '../database/prisma.service';
import type {
  CreateAddonGroupDto,
  CreateAddonOptionDto,
  CreateComboDto,
  CreateCategoryDto,
  CreateProductDto,
  CreateProductVariationDto,
  FeaturedReorderDto,
  ImportPreviewDto,
  ProductRecommendationDto,
  UpdateAddonGroupDto,
  UpdateAddonOptionDto,
  UpdateAvailabilityDto,
  UpdateComboDto,
  UpdateCategoryDto,
  UpdateAddonGroupProductsDto,
  UpdateProductDto,
  UpdateProductVariationDto,
} from './dto/admin-menu.dto';

type AdminMenuProductInput = CreateProductDto | UpdateProductDto;
type AdminMenuCategoryInput = CreateCategoryDto | UpdateCategoryDto;
type AdminMenuProductAvailabilityInput = UpdateAvailabilityDto;
type AdminMenuImportInput = ImportPreviewDto;
type AdminMenuRecommendationInput = ProductRecommendationDto;
type AdminMenuAddonGroupInput = CreateAddonGroupDto | UpdateAddonGroupDto;
type AdminMenuAddonGroupProductsInput = UpdateAddonGroupProductsDto;
type AdminMenuAddonOptionInput = CreateAddonOptionDto | UpdateAddonOptionDto;
type AdminMenuVariationInput = CreateProductVariationDto | UpdateProductVariationDto;
type AdminMenuComboInput = CreateComboDto | UpdateComboDto;

@Injectable()
export class AdminMenuService {
  constructor(private readonly prisma: PrismaService) {}

  async listProducts(ctx: RequestContext) {
    await this.assertBranchBelongsToCompany(ctx);
    const products = await this.prisma.product.findMany({
      where: {
        companyId: ctx.companyId,
        deletedAt: null,
      },
      include: this.productInclude(),
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const recommendations = (await this.readRecommendations(ctx).catch(() => ({}))) as Record<string, ProductRecommendationDto>;
    return products.map((product: any) => this.mapProduct(product, recommendations[product.id]));
  }

  async listCategories(ctx: RequestContext) {
    await this.assertBranchBelongsToCompany(ctx);
    const categories = await this.prisma.productCategory.findMany({
      where: { companyId: ctx.companyId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: true } } },
    });
    return categories.map((category: any) => this.mapCategory(category));
  }

  async createCategory(ctx: RequestContext, input: AdminMenuCategoryInput) {
    await this.assertBranchBelongsToCompany(ctx);
    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException('Nome da categoria e obrigatorio.');
    }
    const sortOrder = this.parseCategorySortOrder(input.sortOrder);
    const existing = await this.prisma.productCategory.findFirst({
      where: { companyId: ctx.companyId, name },
      include: { _count: { select: { products: true } } },
    });
    if (existing) {
      return this.mapCategory(existing);
    }
    const created = await this.prisma.productCategory.create({
      data: {
        companyId: ctx.companyId,
        name,
        ...(sortOrder !== undefined ? { sortOrder } : {}),
      },
      include: { _count: { select: { products: true } } },
    });
    return this.mapCategory(created);
  }

  async updateCategory(id: string, ctx: RequestContext, input: AdminMenuCategoryInput) {
    await this.findCategoryOrThrow(id, ctx);
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = input.name?.trim();
      if (!name) {
        throw new BadRequestException('Nome da categoria nao pode ser vazio.');
      }
      const duplicated = await this.prisma.productCategory.findFirst({
        where: { companyId: ctx.companyId, name },
        select: { id: true },
      });
      if (duplicated && duplicated.id !== id) {
        throw new BadRequestException(`Categoria '${name}' ja existe para a empresa atual.`);
      }
      data.name = name;
    }
    if ('active' in input && typeof input.active === 'boolean') {
      data.isActive = input.active;
    }
    if (input.sortOrder !== undefined) {
      data.sortOrder = this.parseCategorySortOrder(input.sortOrder);
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Informe pelo menos um campo da categoria para atualizar.');
    }
    const updated = await this.prisma.productCategory.update({
      where: { id },
      data,
      include: { _count: { select: { products: true } } },
    });
    return this.mapCategory(updated);
  }

  async deleteCategory(id: string, ctx: RequestContext) {
    await this.findCategoryOrThrow(id, ctx);
    const affected = await this.prisma.product.updateMany({
      where: { companyId: ctx.companyId, categoryId: id },
      data: { categoryId: null },
    });
    await this.prisma.productCategory.delete({ where: { id } });
    return { deleted: true, id, affectedProducts: Number(affected.count ?? 0) };
  }

  async getProduct(id: string, ctx: RequestContext) {
    const product = await this.findProductOrThrow(id, ctx);
    return this.mapProduct(product);
  }

  async createProduct(ctx: RequestContext, input: AdminMenuProductInput) {
    await this.assertBranchBelongsToCompany(ctx);
    const data = await this.buildProductData(ctx, input, true);
    const product = await this.prisma.product.create({
      data: data as any,
      include: this.productInclude(),
    });
    return this.mapProduct(product);
  }

  async updateProduct(id: string, ctx: RequestContext, input: AdminMenuProductInput) {
    await this.findProductOrThrow(id, ctx);
    const data = await this.buildProductData(ctx, input, false);
    const product = await this.prisma.product.update({
      where: { id },
      data: data as any,
      include: this.productInclude(),
    });
    return this.mapProduct(product);
  }

  async updateAvailability(id: string, ctx: RequestContext, input: AdminMenuProductAvailabilityInput) {
    await this.findProductOrThrow(id, ctx);
    const channelData = this.mapChannelData(input.channels);
    const data = {
      ...(typeof input.available === 'boolean' ? { isActive: input.available } : {}),
      ...channelData,
    };
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Informe pelo menos um campo de disponibilidade para atualizar.');
    }
    const product = await this.prisma.product.update({
      where: { id },
      data,
      include: this.productInclude(),
    });
    return this.mapProduct(product);
  }

  async duplicateProduct(id: string, ctx: RequestContext) {
    const product = await this.findProductOrThrow(id, ctx);
    const duplicated = await this.prisma.product.create({
      data: {
        companyId: product.companyId,
        categoryId: product.categoryId ?? undefined,
        name: `${product.name} (copia)`,
        description: product.description ?? undefined,
        sku: undefined,
        salePrice: product.salePrice,
        promotionalPrice: product.promotionalPrice ?? undefined,
        costPrice: product.costPrice,
        localPrice: product.localPrice,
        deliveryPickupPrice: product.deliveryPickupPrice,
        pdvCode: undefined,
        prepTimeMinutes: product.prepTimeMinutes,
        imageUrl: product.imageUrl ?? undefined,
        kitchenStation: product.kitchenStation ?? undefined,
        isActive: false,
        isFeatured: false,
        controlsStock: product.controlsStock,
        allowNotes: product.allowNotes,
        availableDelivery: product.availableDelivery,
        availableCounter: product.availableCounter,
        availableKiosk: product.availableKiosk ?? product.availableCounter,
        availableTable: product.availableTable,
        sortOrder: product.sortOrder,
        addonLinks: {
          create: (product.addonLinks ?? []).map((link: any) => ({
            addonGroupId: link.addonGroup.id,
          })),
        },
      },
      include: this.productInclude(),
    });
    return this.mapProduct(duplicated);
  }

  async previewImport(ctx: RequestContext, input: AdminMenuImportInput) {
    await this.assertBranchBelongsToCompany(ctx);
    return this.parseImportCsv(input.csv ?? '');
  }

  async commitImport(ctx: RequestContext, input: AdminMenuImportInput) {
    const preview = await this.previewImport(ctx, input);
    const imported = [];
    for (const row of preview.rows) {
      if (!row.valid) continue;
      const product = await this.createProduct(ctx, row.payload);
      imported.push(product);
    }
    return {
      importedCount: imported.length,
      skippedCount: preview.rows.filter((row) => !row.valid).length,
      products: imported,
      errors: preview.rows.filter((row) => !row.valid).flatMap((row) => row.errors.map((error) => ({ line: row.line, error }))),
    };
  }

  async updateFeatured(id: string, ctx: RequestContext, body: { featured?: boolean }) {
    await this.findProductOrThrow(id, ctx);
    const product = await this.prisma.product.update({
      where: { id },
      data: { isFeatured: Boolean(body.featured) },
      include: this.productInclude(),
    });
    return this.mapProduct(product);
  }

  async reorderFeatured(ctx: RequestContext, body: FeaturedReorderDto) {
    await this.assertBranchBelongsToCompany(ctx);
    const productIds = Array.isArray(body.productIds) ? body.productIds : [];
    for (const id of productIds) {
      await this.findProductOrThrow(id, ctx);
    }
    const updated = [];
    for (const [index, id] of productIds.entries()) {
      const product = await this.prisma.product.update({
        where: { id },
        data: { isFeatured: true, sortOrder: index },
        include: this.productInclude(),
      });
      updated.push(this.mapProduct(product));
    }
    return { products: updated };
  }

  async getRecommendations(id: string, ctx: RequestContext) {
    await this.findProductOrThrow(id, ctx);
    const all = await this.readRecommendations(ctx);
    return this.normalizeRecommendation(all[id]);
  }

  async putRecommendations(id: string, ctx: RequestContext, input: AdminMenuRecommendationInput) {
    await this.findProductOrThrow(id, ctx);
    const productIds = Array.isArray(input.productIds) ? input.productIds : [];
    for (const productId of productIds) {
      await this.findProductOrThrow(productId, ctx);
    }
    const all = await this.readRecommendations(ctx);
    all[id] = this.normalizeRecommendation(input);
    await this.writeRecommendations(ctx, all);
    return all[id];
  }

  async listProductAddonGroups(productId: string, ctx: RequestContext) {
    const product = await this.findProductOrThrow(productId, ctx);
    return this.mapProduct(product).addonGroups;
  }

  async listAddonGroups(ctx: RequestContext) {
    await this.assertBranchBelongsToCompany(ctx);
    const groups = await this.prisma.addonGroup.findMany({
      where: { companyId: ctx.companyId },
      include: this.addonGroupInclude(),
      orderBy: [{ name: 'asc' }],
    });
    return groups.map((group: any) => this.mapAddonGroup(group));
  }

  async listProductVariations(productId: string, ctx: RequestContext) {
    const product = await this.findProductOrThrow(productId, ctx);
    return this.mapProduct(product).variations;
  }

  async createProductVariation(productId: string, ctx: RequestContext, input: AdminMenuVariationInput) {
    await this.findProductOrThrow(productId, ctx);
    const data = this.buildVariationData(input, true);
    const variation = await this.prisma.productVariation.create({
      data: {
        productId,
        ...data,
      } as any,
    });
    return this.mapVariation(variation);
  }

  async updateProductVariation(variationId: string, ctx: RequestContext, input: AdminMenuVariationInput) {
    await this.findVariationOrThrow(variationId, ctx);
    const data = this.buildVariationData(input, false);
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Informe pelo menos um campo da variacao para atualizar.');
    }
    const variation = await this.prisma.productVariation.update({
      where: { id: variationId },
      data,
    });
    return this.mapVariation(variation);
  }

  async deleteProductVariation(variationId: string, ctx: RequestContext) {
    await this.findVariationOrThrow(variationId, ctx);
    const variation = await this.prisma.productVariation.update({
      where: { id: variationId },
      data: { isActive: false },
    });
    return this.mapVariation(variation);
  }

  async listCombos(ctx: RequestContext) {
    await this.assertBranchBelongsToCompany(ctx);
    const combos = await this.prisma.combo.findMany({
      where: { companyId: ctx.companyId },
      include: this.comboInclude(),
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    return combos.map((combo: any) => this.mapCombo(combo));
  }

  async createCombo(ctx: RequestContext, input: AdminMenuComboInput) {
    await this.assertBranchBelongsToCompany(ctx);
    const data = await this.buildComboData(ctx, input, true);
    const comboItems = data.items ?? [];
    const combo = await this.prisma.combo.create({
      data: {
        companyId: ctx.companyId,
        name: data.name,
        description: data.description,
        price: data.price,
        isActive: data.isActive,
        items: {
          create: comboItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        },
      } as any,
      include: this.comboInclude(),
    });
    return this.mapCombo(combo);
  }

  async updateCombo(comboId: string, ctx: RequestContext, input: AdminMenuComboInput) {
    await this.findComboOrThrow(comboId, ctx);
    const data = await this.buildComboData(ctx, input, false);
    const scalarData: Record<string, unknown> = {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.price !== undefined ? { price: data.price } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    };

    if (Object.keys(scalarData).length === 0 && data.items === undefined) {
      throw new BadRequestException('Informe pelo menos um campo do combo para atualizar.');
    }

    if (data.items !== undefined) {
      await this.prisma.comboItem.deleteMany({ where: { comboId } });
      if (data.items.length > 0) {
        await this.prisma.comboItem.createMany({
          data: data.items.map((item) => ({
            comboId,
            productId: item.productId,
            quantity: item.quantity,
          })),
        });
      }
    }

    const combo = await this.prisma.combo.update({
      where: { id: comboId },
      data: scalarData,
      include: this.comboInclude(),
    });
    return this.mapCombo(combo);
  }

  async deleteCombo(comboId: string, ctx: RequestContext) {
    await this.findComboOrThrow(comboId, ctx);
    const combo = await this.prisma.combo.update({
      where: { id: comboId },
      data: { isActive: false },
      include: this.comboInclude(),
    });
    return this.mapCombo(combo);
  }

  async createProductAddonGroup(productId: string, ctx: RequestContext, input: AdminMenuAddonGroupInput) {
    const product = await this.findProductOrThrow(productId, ctx);
    const data = this.buildAddonGroupData(input, true);
    const group = await this.prisma.addonGroup.create({
      data: {
        companyId: ctx.companyId,
        ...data,
        productLinks: {
          create: {
            productId: product.id,
          },
        },
      } as any,
      include: this.addonGroupInclude(),
    });
    return this.mapAddonGroup(group);
  }

  async updateAddonGroup(groupId: string, ctx: RequestContext, input: AdminMenuAddonGroupInput) {
    const existing = await this.findAddonGroupOrThrow(groupId, ctx);
    const data = this.buildAddonGroupData(input, false, existing);
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Informe pelo menos um campo do grupo para atualizar.');
    }
    const group = await this.prisma.addonGroup.update({
      where: { id: groupId },
      data,
      include: this.addonGroupInclude(),
    });
    return this.mapAddonGroup(group);
  }

  async updateAddonGroupProducts(groupId: string, ctx: RequestContext, input: AdminMenuAddonGroupProductsInput) {
    await this.findAddonGroupOrThrow(groupId, ctx);
    const productIds = Array.from(new Set((input.productIds ?? []).map((id) => String(id).trim()).filter(Boolean)));
    const products = productIds.length
      ? await this.prisma.product.findMany({
          where: {
            id: { in: productIds },
            companyId: ctx.companyId,
            deletedAt: null,
          },
          select: { id: true },
        })
      : [];

    if (products.length !== productIds.length) {
      throw new BadRequestException('Todos os produtos selecionados devem pertencer a empresa atual.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.productAddonGroup.deleteMany({
        where: {
          addonGroupId: groupId,
          ...(productIds.length ? { productId: { notIn: productIds } } : {}),
        },
      });
      if (productIds.length > 0) {
        await tx.productAddonGroup.createMany({
          data: productIds.map((productId) => ({ productId, addonGroupId: groupId })),
          skipDuplicates: true,
        });
      }
    });

    const group = await this.prisma.addonGroup.findFirst({
      where: { id: groupId, companyId: ctx.companyId },
      include: this.addonGroupInclude(),
    });
    return this.mapAddonGroup(group);
  }

  async deleteAddonGroup(groupId: string, ctx: RequestContext) {
    await this.findAddonGroupOrThrow(groupId, ctx);
    await this.prisma.addonGroup.delete({ where: { id: groupId } });
    return { deleted: true };
  }

  async createAddonOption(groupId: string, ctx: RequestContext, input: AdminMenuAddonOptionInput) {
    await this.findAddonGroupOrThrow(groupId, ctx);
    const data = this.buildAddonOptionData(input, true);
    const item = await this.prisma.addonItem.create({
      data: {
        groupId,
        ...data,
      } as any,
    });
    return this.mapAddonOption(item);
  }

  async updateAddonOption(optionId: string, ctx: RequestContext, input: AdminMenuAddonOptionInput) {
    await this.findAddonOptionOrThrow(optionId, ctx);
    const data = this.buildAddonOptionData(input, false);
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Informe pelo menos um campo da opcao para atualizar.');
    }
    const item = await this.prisma.addonItem.update({
      where: { id: optionId },
      data,
    });
    return this.mapAddonOption(item);
  }

  async deleteAddonOption(optionId: string, ctx: RequestContext) {
    await this.findAddonOptionOrThrow(optionId, ctx);
    await this.prisma.addonItem.delete({ where: { id: optionId } });
    return { deleted: true };
  }

  private async buildProductData(ctx: RequestContext, input: AdminMenuProductInput, creating: boolean) {
    const name = input.name?.trim();
    if (creating && !name) {
      throw new BadRequestException('Nome do produto e obrigatorio.');
    }
    if (!creating && input.name !== undefined && !name) {
      throw new BadRequestException('Nome do produto nao pode ser vazio.');
    }

    const price = this.pickPrice(input);
    if (creating && price === undefined) {
      throw new BadRequestException('Preco do produto e obrigatorio.');
    }
    if (price !== undefined) {
      this.assertNonNegative(price, 'Preco do produto deve ser maior ou igual a zero.');
    }

    const deliveryPrice = input.deliveryPrice !== undefined ? Number(input.deliveryPrice) : undefined;
    if (deliveryPrice !== undefined) {
      this.assertNonNegative(deliveryPrice, 'Preco delivery deve ser maior ou igual a zero.');
    }

    const localPrice = input.localPrice !== undefined ? Number(input.localPrice) : undefined;
    if (localPrice !== undefined) {
      this.assertNonNegative(localPrice, 'Preco local deve ser maior ou igual a zero.');
    }

    const costPrice = input.costPrice !== undefined ? Number(input.costPrice) : undefined;
    if (costPrice !== undefined) {
      this.assertNonNegative(costPrice, 'Custo do produto deve ser maior ou igual a zero.');
    }

    const promotionalPrice =
      input.promotionalPrice === null || input.promotionalPrice === undefined
        ? input.promotionalPrice
        : Number(input.promotionalPrice);
    if (typeof promotionalPrice === 'number') {
      this.assertNonNegative(promotionalPrice, 'Preco promocional deve ser maior ou igual a zero.');
    }

    const normalizedDescription =
      input.description === undefined ? undefined : this.normalizeOptionalDescription(input.description);
    const normalizedImageUrl =
      input.imageUrl === undefined ? undefined : this.normalizeOptionalImageUrl(input.imageUrl);
    const normalizedSku = input.sku === undefined ? undefined : this.normalizeOptionalSku(input.sku);

    const categoryId = await this.resolveCategoryId(ctx, input.categoryId, input.categoryName);
    const sortOrder = this.parseProductSortOrder(input.sortOrder);
    const prepTimeMinutes = this.parsePrepTimeMinutes(input.prepTimeMinutes);
    const data = {
      ...(creating ? { companyId: ctx.companyId } : {}),
      ...(name ? { name } : {}),
      ...(normalizedDescription !== undefined ? { description: normalizedDescription } : {}),
      ...(normalizedSku !== undefined ? { sku: normalizedSku } : {}),
      ...(categoryId !== undefined ? { categoryId } : {}),
      ...(price !== undefined ? { salePrice: price, localPrice: localPrice ?? price } : {}),
      ...(localPrice !== undefined && price === undefined ? { localPrice } : {}),
      ...(costPrice !== undefined ? { costPrice } : {}),
      ...(deliveryPrice !== undefined ? { deliveryPickupPrice: deliveryPrice } : price !== undefined ? { deliveryPickupPrice: price } : {}),
      ...(input.promotionalPrice !== undefined ? { promotionalPrice } : {}),
      ...(normalizedImageUrl !== undefined ? { imageUrl: normalizedImageUrl } : {}),
      ...(typeof input.available === 'boolean' ? { isActive: input.available } : {}),
      ...(typeof input.featured === 'boolean' ? { isFeatured: input.featured } : {}),
      ...this.mapChannelData(input.channels),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
      ...(prepTimeMinutes !== undefined ? { prepTimeMinutes } : {}),
    };
    if (!creating && Object.keys(data).length === 0) {
      throw new BadRequestException('Informe pelo menos um campo do produto para atualizar.');
    }
    return data;
  }

  private async resolveCategoryId(
    ctx: RequestContext,
    categoryId?: string | null,
    categoryName?: string | null,
  ): Promise<string | null | undefined> {
    if (categoryId === null) return null;
    if (categoryId) {
      const category = await this.prisma.productCategory.findFirst({
        where: { id: categoryId, companyId: ctx.companyId },
        select: { id: true },
      });
      if (!category) {
        throw new BadRequestException(`Categoria '${categoryId}' nao pertence a empresa atual.`);
      }
      return category.id;
    }

    const name = categoryName?.trim();
    if (!name) return undefined;

    const existing = await this.prisma.productCategory.findFirst({
      where: { companyId: ctx.companyId, name },
      select: { id: true },
    });
    if (existing) return existing.id;

    const created = await this.prisma.productCategory.create({
      data: {
        companyId: ctx.companyId,
        name,
      },
      select: { id: true },
    });
    return created.id;
  }

  private async findProductOrThrow(id: string, ctx: RequestContext) {
    await this.assertBranchBelongsToCompany(ctx);
    const product = await this.prisma.product.findFirst({
      where: {
        id,
        companyId: ctx.companyId,
        deletedAt: null,
      },
      include: this.productInclude(),
    });
    if (!product) {
      throw new NotFoundException(`Produto '${id}' nao encontrado para a empresa atual.`);
    }
    return product as any;
  }

  private async findCategoryOrThrow(id: string, ctx: RequestContext) {
    await this.assertBranchBelongsToCompany(ctx);
    const category = await this.prisma.productCategory.findFirst({
      where: { id, companyId: ctx.companyId },
      include: { _count: { select: { products: true } } },
    });
    if (!category) {
      throw new NotFoundException(`Categoria '${id}' nao encontrada para a empresa atual.`);
    }
    return category as any;
  }

  private async findAddonGroupOrThrow(groupId: string, ctx: RequestContext) {
    await this.assertBranchBelongsToCompany(ctx);
    const group = await this.prisma.addonGroup.findFirst({
      where: {
        id: groupId,
        companyId: ctx.companyId,
      },
      include: this.addonGroupInclude(),
    });
    if (!group) {
      throw new NotFoundException(`Grupo de adicional '${groupId}' nao encontrado para a empresa atual.`);
    }
    return group as any;
  }

  private async findAddonOptionOrThrow(optionId: string, ctx: RequestContext) {
    await this.assertBranchBelongsToCompany(ctx);
    const item = await this.prisma.addonItem.findFirst({
      where: {
        id: optionId,
        group: {
          companyId: ctx.companyId,
        },
      },
      include: {
        group: {
          select: {
            id: true,
            companyId: true,
          },
        },
      },
    });
    if (!item) {
      throw new NotFoundException(`Opcao de adicional '${optionId}' nao encontrada para a empresa atual.`);
    }
    return item as any;
  }

  private async findVariationOrThrow(variationId: string, ctx: RequestContext) {
    await this.assertBranchBelongsToCompany(ctx);
    const variation = await this.prisma.productVariation.findFirst({
      where: {
        id: variationId,
        product: {
          companyId: ctx.companyId,
          deletedAt: null,
        },
      },
      include: {
        product: {
          select: {
            id: true,
            companyId: true,
          },
        },
      },
    });
    if (!variation) {
      throw new NotFoundException(`Variacao '${variationId}' nao encontrada para a empresa atual.`);
    }
    return variation as any;
  }

  private async findComboOrThrow(comboId: string, ctx: RequestContext) {
    await this.assertBranchBelongsToCompany(ctx);
    const combo = await this.prisma.combo.findFirst({
      where: {
        id: comboId,
        companyId: ctx.companyId,
      },
      include: this.comboInclude(),
    });
    if (!combo) {
      throw new NotFoundException(`Combo '${comboId}' nao encontrado para a empresa atual.`);
    }
    return combo as any;
  }

  private async assertBranchBelongsToCompany(ctx: RequestContext) {
    if (!ctx.branchId) return;
    const branch = await this.prisma.branch.findFirst({
      where: { id: ctx.branchId, companyId: ctx.companyId },
      select: { id: true },
    });
    if (!branch) {
      throw new BadRequestException(`Branch '${ctx.branchId}' nao pertence a company '${ctx.companyId}'.`);
    }
  }

  private productInclude(): any {
    return {
      category: {
        select: {
          id: true,
          name: true,
        },
      },
      addonLinks: {
        include: {
          addonGroup: {
            include: {
              items: {
                orderBy: [{ sortOrder: 'asc' as const }, { name: 'asc' as const }],
              },
            },
          },
        },
      },
      variations: {
        orderBy: [{ sortOrder: 'asc' as const }, { name: 'asc' as const }],
      },
    };
  }

  private addonGroupInclude(): any {
    return {
      items: {
        orderBy: [{ sortOrder: 'asc' as const }, { name: 'asc' as const }],
      },
      productLinks: {
        select: {
          productId: true,
        },
      },
    };
  }

  private comboInclude(): any {
    return {
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              salePrice: true,
              deliveryPickupPrice: true,
              isActive: true,
              deletedAt: true,
            },
          },
        },
        orderBy: [{ product: { name: 'asc' as const } }],
      },
    };
  }

  private mapProduct(product: any, recommendation?: AdminMenuRecommendationInput) {
    const salePrice = Number(product.salePrice ?? 0);
    const deliveryPrice = Number(product.deliveryPickupPrice ?? 0);
    const promotionalPrice =
      product.promotionalPrice === null || product.promotionalPrice === undefined
        ? undefined
        : Number(product.promotionalPrice);
    const resolvedDeliveryPrice = deliveryPrice > 0 ? deliveryPrice : salePrice;
    return {
      id: product.id,
      name: product.name,
      description: product.description ?? undefined,
      sku: product.sku ?? undefined,
      imageUrl: product.imageUrl ?? undefined,
      price: promotionalPrice ?? resolvedDeliveryPrice,
      salePrice,
      localPrice: Number(product.localPrice ?? salePrice),
      costPrice: Number(product.costPrice ?? 0),
      deliveryPrice: resolvedDeliveryPrice,
      promotionalPrice,
      prepTimeMinutes: Number(product.prepTimeMinutes ?? 0),
      categoryId: product.categoryId ?? undefined,
      categoryName: product.category?.name ?? undefined,
      available: Boolean(product.isActive && !product.deletedAt),
      availableDelivery: Boolean(product.availableDelivery),
      availablePdv: Boolean(product.availableCounter),
      availableKiosk: Boolean(product.availableKiosk ?? product.availableCounter),
      availableWaiter: Boolean(product.availableTable),
      featured: Boolean(product.isFeatured),
      sortOrder: Number(product.sortOrder ?? 0),
      featuredSortOrder: Number(product.sortOrder ?? 0),
      channels: {
        delivery: Boolean(product.availableDelivery),
        pdv: Boolean(product.availableCounter),
        kiosk: Boolean(product.availableKiosk ?? product.availableCounter),
        waiter: Boolean(product.availableTable),
      },
      recommendations: recommendation ? this.normalizeRecommendation(recommendation) : undefined,
      variations: (product.variations ?? []).map((variation: any) => this.mapVariation(variation)),
      addonGroups: (product.addonLinks ?? []).map((link: any) => this.mapAddonGroup(link.addonGroup)),
    };
  }

  private mapVariation(variation: any) {
    return {
      id: variation.id,
      name: variation.name,
      sku: variation.sku ?? undefined,
      priceDelta: Number(variation.priceDelta ?? 0),
      localPriceDelta: Number(variation.localPriceDelta ?? 0),
      deliveryPriceDelta: Number(variation.deliveryPriceDelta ?? 0),
      active: variation.isActive !== false,
      sortOrder: Number(variation.sortOrder ?? 0),
    };
  }

  private mapCombo(combo: any) {
    return {
      id: combo.id,
      name: combo.name,
      description: combo.description ?? undefined,
      price: Number(combo.price ?? 0),
      active: combo.isActive !== false,
      itemCount: (combo.items ?? []).length,
      items: (combo.items ?? []).map((item: any) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product?.name ?? undefined,
        quantity: Number(item.quantity ?? 1),
        productPrice: item.product ? Number(item.product.deliveryPickupPrice || item.product.salePrice || 0) : undefined,
        productActive: item.product ? Boolean(item.product.isActive && !item.product.deletedAt) : undefined,
      })),
    };
  }

  private mapCategory(category: any) {
    return {
      id: category.id,
      name: category.name,
      sortOrder: Number(category.sortOrder ?? 0),
      count: Number(category._count?.products ?? 0),
      active: category.isActive !== false,
    };
  }

  private parseCategorySortOrder(value: unknown): number | undefined {
    if (value === undefined || value === null) return undefined;
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      throw new BadRequestException('Ordenacao da categoria deve ser um inteiro.');
    }
    return parsed;
  }

  private mapAddonGroup(group: any) {
    return {
      id: group.id,
      name: group.name,
      minSelect: Number(group.minSelect ?? 0),
      maxSelect: Number(group.maxSelect ?? 1),
      required: Boolean(group.required),
      allowMultiple: Boolean(group.allowMultiple),
      options: (group.items ?? []).map((item: any) => this.mapAddonOption(item)),
      linkedProductIds: (group.productLinks ?? []).map((link: any) => link.productId),
      productCount: Number(group.productLinks?.length ?? 0),
    };
  }

  private mapAddonOption(item: any) {
    return {
      id: item.id,
      name: item.name,
      price: Number(item.price ?? 0),
      available: Boolean(item.isActive),
      sortOrder: Number(item.sortOrder ?? 0),
    };
  }

  private pickPrice(input: AdminMenuProductInput): number | undefined {
    const raw = input.salePrice ?? input.price;
    return raw === undefined ? undefined : Number(raw);
  }

  private parseProductSortOrder(value: unknown): number | undefined {
    if (value === undefined || value === null) return undefined;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new BadRequestException('Ordenacao do produto deve ser um inteiro maior ou igual a zero.');
    }
    return parsed;
  }

  private parsePrepTimeMinutes(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1440) {
      throw new BadRequestException('Tempo de preparo deve ser um inteiro entre 0 e 1440 minutos.');
    }
    return parsed;
  }

  private assertNonNegative(value: number, message: string) {
    if (!Number.isFinite(value) || value < 0) {
      throw new BadRequestException(message);
    }
  }

  private normalizeOptionalDescription(value: string | null | undefined): string | null {
    const trimmed = value?.trim() ?? '';
    if (!trimmed) {
      return null;
    }
    if (trimmed.length > 300) {
      throw new BadRequestException('Descricao comercial deve ter no maximo 300 caracteres.');
    }
    return trimmed;
  }

  private normalizeOptionalSku(value: string | null | undefined): string | null {
    const trimmed = value?.trim() ?? '';
    if (!trimmed) {
      return null;
    }
    if (trimmed.length > 64) {
      throw new BadRequestException('SKU deve ter no maximo 64 caracteres.');
    }
    return trimmed;
  }

  private normalizeOptionalImageUrl(value: string | null | undefined): string | null {
    const trimmed = value?.trim() ?? '';
    if (!trimmed) {
      return null;
    }
    if (/^data:image\/(png|jpe?g|webp);base64,/i.test(trimmed)) {
      if (trimmed.length > 2_100_000) {
        throw new BadRequestException('Imagem comercial importada excede o tamanho maximo permitido.');
      }
      return trimmed;
    }
    if (trimmed.length > 2048) {
      throw new BadRequestException('URL da imagem comercial excede o tamanho maximo permitido.');
    }
    if (!/^https?:\/\//i.test(trimmed)) {
      throw new BadRequestException('URL da imagem comercial deve iniciar com http:// ou https://.');
    }
    return trimmed;
  }

  private buildAddonGroupData(input: AdminMenuAddonGroupInput, creating: boolean, existing?: { minSelect?: number; maxSelect?: number }) {
    const name = input.name?.trim();
    if (creating && !name) {
      throw new BadRequestException('Nome do grupo de adicionais e obrigatorio.');
    }
    if (!creating && input.name !== undefined && !name) {
      throw new BadRequestException('Nome do grupo de adicionais nao pode ser vazio.');
    }

    const minSelect = input.minSelect === undefined ? undefined : Number(input.minSelect);
    const maxSelect = input.maxSelect === undefined ? undefined : Number(input.maxSelect);
    if (minSelect !== undefined && (!Number.isInteger(minSelect) || minSelect < 0)) {
      throw new BadRequestException('Minimo de selecao deve ser um inteiro maior ou igual a zero.');
    }
    if (maxSelect !== undefined && (!Number.isInteger(maxSelect) || maxSelect < 0)) {
      throw new BadRequestException('Maximo de selecao deve ser um inteiro maior ou igual a zero.');
    }
    const resolvedMin = minSelect ?? Number(existing?.minSelect ?? 0);
    const resolvedMax = maxSelect ?? Number(existing?.maxSelect ?? 1);
    const resolvedRequired = typeof input.required === 'boolean' ? input.required : creating ? false : undefined;
    const resolvedAllowMultiple =
      typeof input.allowMultiple === 'boolean' ? input.allowMultiple : creating ? false : undefined;
    if ((creating || minSelect !== undefined || maxSelect !== undefined) && resolvedMin > resolvedMax) {
      throw new BadRequestException('Minimo de selecao nao pode ser maior que o maximo.');
    }
    if ((creating || input.allowMultiple !== undefined || maxSelect !== undefined) && resolvedAllowMultiple === false && resolvedMax > 1) {
      throw new BadRequestException('Grupo sem multiplas opcoes nao pode ter maximo de selecao maior que 1.');
    }
    if ((creating || input.required !== undefined || maxSelect !== undefined) && resolvedRequired === true && resolvedMax === 0) {
      throw new BadRequestException('Grupo obrigatorio deve permitir ao menos uma opcao.');
    }

    return {
      ...(name ? { name } : {}),
      ...(minSelect !== undefined ? { minSelect } : creating ? { minSelect: 0 } : {}),
      ...(maxSelect !== undefined ? { maxSelect } : creating ? { maxSelect: 1 } : {}),
      ...(typeof input.required === 'boolean' ? { required: input.required } : creating ? { required: false } : {}),
      ...(typeof input.allowMultiple === 'boolean'
        ? { allowMultiple: input.allowMultiple }
        : creating
          ? { allowMultiple: false }
          : {}),
    };
  }

  private buildAddonOptionData(input: AdminMenuAddonOptionInput, creating: boolean) {
    const name = input.name?.trim();
    if (creating && !name) {
      throw new BadRequestException('Nome da opcao de adicional e obrigatorio.');
    }
    if (!creating && input.name !== undefined && !name) {
      throw new BadRequestException('Nome da opcao de adicional nao pode ser vazio.');
    }

    const price = input.price === undefined ? undefined : Number(input.price);
    if (price !== undefined) {
      this.assertNonNegative(price, 'Preco da opcao deve ser maior ou igual a zero.');
    }
    const sortOrder = input.sortOrder === undefined ? undefined : Number(input.sortOrder);
    if (sortOrder !== undefined && !Number.isInteger(sortOrder)) {
      throw new BadRequestException('Ordenacao da opcao deve ser um inteiro.');
    }

    return {
      ...(name ? { name } : {}),
      ...(price !== undefined ? { price } : creating ? { price: 0 } : {}),
      ...(typeof input.available === 'boolean' ? { isActive: input.available } : creating ? { isActive: true } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : creating ? { sortOrder: 0 } : {}),
    };
  }

  private buildVariationData(input: AdminMenuVariationInput, creating: boolean) {
    const name = input.name?.trim();
    if (creating && !name) {
      throw new BadRequestException('Nome da variacao e obrigatorio.');
    }
    if (!creating && input.name !== undefined && !name) {
      throw new BadRequestException('Nome da variacao nao pode ser vazio.');
    }

    const priceDelta = input.priceDelta === undefined ? undefined : Number(input.priceDelta);
    const localPriceDelta = input.localPriceDelta === undefined ? undefined : Number(input.localPriceDelta);
    const deliveryPriceDelta = input.deliveryPriceDelta === undefined ? undefined : Number(input.deliveryPriceDelta);
    if (priceDelta !== undefined) this.assertNonNegative(priceDelta, 'Delta de preco da variacao deve ser maior ou igual a zero.');
    if (localPriceDelta !== undefined) this.assertNonNegative(localPriceDelta, 'Delta de preco local deve ser maior ou igual a zero.');
    if (deliveryPriceDelta !== undefined) this.assertNonNegative(deliveryPriceDelta, 'Delta de preco delivery deve ser maior ou igual a zero.');

    const sortOrder = input.sortOrder === undefined ? undefined : Number(input.sortOrder);
    if (sortOrder !== undefined && (!Number.isInteger(sortOrder) || sortOrder < 0)) {
      throw new BadRequestException('Ordenacao da variacao deve ser um inteiro maior ou igual a zero.');
    }

    const normalizedSku = input.sku === undefined ? undefined : this.normalizeOptionalSku(input.sku);

    return {
      ...(name ? { name } : {}),
      ...(normalizedSku !== undefined ? { sku: normalizedSku } : {}),
      ...(priceDelta !== undefined ? { priceDelta } : creating ? { priceDelta: 0 } : {}),
      ...(localPriceDelta !== undefined ? { localPriceDelta } : creating ? { localPriceDelta: 0 } : {}),
      ...(deliveryPriceDelta !== undefined ? { deliveryPriceDelta } : creating ? { deliveryPriceDelta: 0 } : {}),
      ...(typeof input.active === 'boolean' ? { isActive: input.active } : creating ? { isActive: true } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : creating ? { sortOrder: 0 } : {}),
    };
  }

  private async buildComboData(ctx: RequestContext, input: AdminMenuComboInput, creating: boolean) {
    const name = input.name?.trim();
    if (creating && !name) {
      throw new BadRequestException('Nome do combo e obrigatorio.');
    }
    if (!creating && input.name !== undefined && !name) {
      throw new BadRequestException('Nome do combo nao pode ser vazio.');
    }

    const price = input.price === undefined ? undefined : Number(input.price);
    if (price !== undefined) {
      this.assertNonNegative(price, 'Preco do combo deve ser maior ou igual a zero.');
    }

    const description =
      input.description === undefined ? undefined : this.normalizeOptionalDescription(input.description);

    const items =
      input.items === undefined
        ? undefined
        : await this.normalizeComboItems(ctx, input.items);

    if (creating && (!items || items.length === 0)) {
      throw new BadRequestException('Combo deve possuir ao menos um produto.');
    }

    return {
      ...(name ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(price !== undefined ? { price } : creating ? { price: 0 } : {}),
      ...(typeof input.active === 'boolean' ? { isActive: input.active } : creating ? { isActive: true } : {}),
      ...(items !== undefined ? { items } : {}),
    };
  }

  private async normalizeComboItems(ctx: RequestContext, items: NonNullable<AdminMenuComboInput['items']>) {
    if (!Array.isArray(items)) {
      throw new BadRequestException('Itens do combo devem ser informados em lista.');
    }

    const normalized = items.map((item) => ({
      productId: item.productId?.trim(),
      quantity: Number(item.quantity),
    }));

    if (normalized.some((item) => !item.productId)) {
      throw new BadRequestException('Produto do item do combo e obrigatorio.');
    }
    if (normalized.some((item) => !Number.isFinite(item.quantity) || item.quantity <= 0)) {
      throw new BadRequestException('Quantidade do item do combo deve ser maior que zero.');
    }

    const uniqueIds = new Set(normalized.map((item) => item.productId));
    if (uniqueIds.size !== normalized.length) {
      throw new BadRequestException('Combo nao pode repetir o mesmo produto.');
    }

    const products = await this.prisma.product.findMany({
      where: {
        id: { in: [...uniqueIds] },
        companyId: ctx.companyId,
        deletedAt: null,
      },
      select: { id: true },
    });
    const foundIds = new Set(products.map((product: any) => product.id));
    const missing = [...uniqueIds].filter((productId) => !foundIds.has(productId));
    if (missing.length > 0) {
      throw new BadRequestException(`Produtos invalidos para o combo: ${missing.join(', ')}.`);
    }

    return normalized as Array<{ productId: string; quantity: number }>;
  }

  private mapChannelData(channels?: AdminMenuProductInput['channels']) {
    if (!channels) return {};
    return {
      ...(typeof channels.delivery === 'boolean' ? { availableDelivery: channels.delivery } : {}),
      ...(typeof channels.pdv === 'boolean' ? { availableCounter: channels.pdv } : {}),
      ...(typeof channels.kiosk === 'boolean' ? { availableKiosk: channels.kiosk } : {}),
      ...(typeof channels.waiter === 'boolean' ? { availableTable: channels.waiter } : {}),
    };
  }

  private parseImportCsv(csv: string) {
    const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const [headerLine, ...dataLines] = lines;
    const headers = this.parseCsvLine(headerLine ?? '').map((header) => header.trim());
    const rows = dataLines.map((line, index) => {
      const values = this.parseCsvLine(line);
      const record = Object.fromEntries(headers.map((header, valueIndex) => [header, values[valueIndex] ?? '']));
      const payload: AdminMenuProductInput = {
        name: record.name,
        description: record.description,
        categoryName: record.category,
        salePrice: this.numberOrUndefined(record.salePrice),
        deliveryPrice: this.numberOrUndefined(record.deliveryPrice),
        promotionalPrice: this.numberOrUndefined(record.promotionalPrice),
        available: this.booleanOrDefault(record.isActive, true),
        channels: {
          delivery: this.booleanOrDefault(record.availableDelivery, true),
          pdv: this.booleanOrDefault(record.availablePdv, true),
          kiosk: this.booleanOrDefault(record.availableKiosk, true),
        },
      };
      const errors: string[] = [];
      if (!payload.name?.trim()) errors.push('name obrigatorio');
      if (payload.salePrice === undefined || Number.isNaN(payload.salePrice)) errors.push('salePrice obrigatorio');
      if (payload.salePrice !== undefined && payload.salePrice < 0) errors.push('salePrice deve ser >= 0');
      if (payload.deliveryPrice !== undefined && payload.deliveryPrice < 0) errors.push('deliveryPrice deve ser >= 0');
      if (payload.promotionalPrice !== undefined && payload.promotionalPrice !== null && payload.promotionalPrice < 0) {
        errors.push('promotionalPrice deve ser >= 0');
      }
      return {
        line: index + 2,
        raw: record,
        payload,
        valid: errors.length === 0,
        errors,
      };
    });
    return {
      totalRows: rows.length,
      validRows: rows.filter((row) => row.valid).length,
      invalidRows: rows.filter((row) => !row.valid).length,
      rows,
    };
  }

  private parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        quoted = !quoted;
      } else if (char === ',' && !quoted) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  }

  private numberOrUndefined(value?: string): number | undefined {
    if (!value?.trim()) return undefined;
    return Number(value.replace(',', '.'));
  }

  private booleanOrDefault(value: string | undefined, fallback: boolean): boolean {
    if (!value?.trim()) return fallback;
    return ['true', '1', 'sim', 'yes', 'ativo'].includes(value.trim().toLowerCase());
  }

  private async recommendationBranchId(ctx: RequestContext): Promise<string> {
    if (ctx.branchId) return ctx.branchId;
    const branch = await this.prisma.branch.findFirst({
      where: { companyId: ctx.companyId },
      select: { id: true },
    });
    if (!branch) throw new BadRequestException(`Nenhuma branch encontrada para company '${ctx.companyId}'.`);
    return branch.id;
  }

  private async readRecommendations(ctx: RequestContext): Promise<Record<string, AdminMenuRecommendationInput>> {
    const branchId = await this.recommendationBranchId(ctx);
    const setting = await this.prisma.companySetting.findFirst({
      where: { companyId: ctx.companyId, branchId, key: 'menu.recommendations' },
      select: { value: true },
    });
    return this.isRecord(setting?.value) ? (setting?.value as Record<string, AdminMenuRecommendationInput>) : {};
  }

  private async writeRecommendations(ctx: RequestContext, value: Record<string, AdminMenuRecommendationInput>) {
    const branchId = await this.recommendationBranchId(ctx);
    await this.prisma.companySetting.upsert({
      where: { companyId_branchId_key: { companyId: ctx.companyId, branchId, key: 'menu.recommendations' } },
      create: { companyId: ctx.companyId, branchId, key: 'menu.recommendations', value: value as any },
      update: { value: value as any },
    });
  }

  private normalizeRecommendation(input?: AdminMenuRecommendationInput): Required<AdminMenuRecommendationInput> {
    return {
      title: input?.title?.trim() || 'Peca tambem',
      type: input?.type ?? 'manual',
      limit: Number(input?.limit ?? 4),
      active: input?.active !== false,
      productIds: Array.isArray(input?.productIds) ? input.productIds : [],
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }
}
