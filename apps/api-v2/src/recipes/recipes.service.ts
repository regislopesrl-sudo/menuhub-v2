import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { RequestContext } from '../common/request-context';

type RecipeItemInput = {
  stockItemId: string;
  quantity: number;
  unit: string;
  optional?: boolean;
  affectsStock?: boolean;
  affectsCost?: boolean;
};

@Injectable()
export class RecipesService {
  constructor(private readonly prisma: PrismaService) {}

  async listCompanyRecipes(ctx: RequestContext) {
    const recipes = await this.prisma.recipe.findMany({
      where: { companyId: ctx.companyId },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        items: {
          include: { stockItem: true },
        },
      },
    });

    return recipes.map((recipe) => this.mapRecipeWithCost(recipe));
  }

  async getRecipeById(ctx: RequestContext, recipeId: string) {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id: recipeId },
      include: {
        items: {
          include: { stockItem: true },
        },
      },
    });
    if (!recipe || recipe.companyId !== ctx.companyId) {
      throw new NotFoundException('Ficha tecnica nao encontrada para a empresa atual.');
    }
    return this.mapRecipeWithCost(recipe);
  }

  async createRecipe(
    ctx: RequestContext,
    input: {
      name: string;
      type: 'SALE' | 'PRODUCTION';
      yieldQuantity: number;
      yieldUnit: string;
      lossPercent?: number | null;
      items: RecipeItemInput[];
    },
  ) {
    this.assertCreatePayload(input);
    await this.assertStockItemsOwnership(ctx.companyId, input.items);

    const created = await this.prisma.recipe.create({
      data: {
        companyId: ctx.companyId,
        name: input.name.trim(),
        type: input.type,
        yieldQuantity: input.yieldQuantity,
        yieldUnit: input.yieldUnit.trim(),
        lossPercent: input.lossPercent ?? null,
        items: {
          create: input.items.map((item) => ({
            stockItemId: item.stockItemId,
            quantity: item.quantity,
            unit: item.unit.trim(),
            optional: item.optional ?? false,
            affectsStock: item.affectsStock ?? true,
            affectsCost: item.affectsCost ?? true,
          })),
        },
      },
      include: {
        items: {
          include: { stockItem: true },
        },
      },
    });

    return this.mapRecipeWithCost(created);
  }

  async updateRecipe(
    ctx: RequestContext,
    recipeId: string,
    input: Partial<{
      name: string;
      type: 'SALE' | 'PRODUCTION';
      yieldQuantity: number;
      yieldUnit: string;
      lossPercent: number | null;
      active: boolean;
    }>,
  ) {
    const existing = await this.prisma.recipe.findUnique({ where: { id: recipeId } });
    if (!existing || existing.companyId !== ctx.companyId) {
      throw new NotFoundException('Ficha tecnica nao encontrada para a empresa atual.');
    }

    if (input.yieldQuantity !== undefined && Number(input.yieldQuantity) <= 0) {
      throw new BadRequestException('yieldQuantity deve ser maior que zero.');
    }
    if (input.lossPercent !== undefined && input.lossPercent !== null) {
      const lossPercent = Number(input.lossPercent);
      if (!Number.isFinite(lossPercent) || lossPercent < 0 || lossPercent > 100) {
        throw new BadRequestException('lossPercent deve estar entre 0 e 100.');
      }
    }

    const updated = await this.prisma.recipe.update({
      where: { id: recipeId },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.yieldQuantity !== undefined ? { yieldQuantity: input.yieldQuantity } : {}),
        ...(input.yieldUnit !== undefined ? { yieldUnit: input.yieldUnit.trim() } : {}),
        ...(input.lossPercent !== undefined ? { lossPercent: input.lossPercent } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
      include: {
        items: {
          include: { stockItem: true },
        },
      },
    });

    return this.mapRecipeWithCost(updated);
  }

  async replaceRecipeItems(ctx: RequestContext, recipeId: string, items: RecipeItemInput[]) {
    const existing = await this.prisma.recipe.findUnique({ where: { id: recipeId } });
    if (!existing || existing.companyId !== ctx.companyId) {
      throw new NotFoundException('Ficha tecnica nao encontrada para a empresa atual.');
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('A ficha tecnica precisa de ao menos um item.');
    }
    this.assertRecipeItems(items);
    await this.assertStockItemsOwnership(ctx.companyId, items);

    await this.prisma.$transaction(async (tx) => {
      await tx.recipeItem.deleteMany({ where: { recipeId } });
      await tx.recipeItem.createMany({
        data: items.map((item) => ({
          recipeId,
          stockItemId: item.stockItemId,
          quantity: item.quantity,
          unit: item.unit.trim(),
          optional: item.optional ?? false,
          affectsStock: item.affectsStock ?? true,
          affectsCost: item.affectsCost ?? true,
        })),
      });
    });

    return this.getRecipeById(ctx, recipeId);
  }

  async listProductCompositions(ctx: RequestContext) {
    const products = await this.prisma.product.findMany({
      where: { companyId: ctx.companyId, deletedAt: null },
      orderBy: [{ name: 'asc' }],
      select: {
        id: true,
        name: true,
        sku: true,
        recipeId: true,
        recipe: {
          select: {
            id: true,
            companyId: true,
            name: true,
            type: true,
            yieldQuantity: true,
            yieldUnit: true,
            lossPercent: true,
            active: true,
            createdAt: true,
            updatedAt: true,
            items: {
              include: { stockItem: true },
            },
          },
        },
      },
    });

    return products.map((product) => ({
      productId: product.id,
      productName: product.name,
      sku: product.sku ?? null,
      recipeId: product.recipeId,
      recipe: product.recipe ? this.mapRecipeWithCost(product.recipe) : null,
    }));
  }

  async getProductComposition(ctx: RequestContext, productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        companyId: true,
        name: true,
        sku: true,
        recipeId: true,
        recipe: {
          include: {
            items: {
              include: { stockItem: true },
            },
          },
        },
      },
    });

    if (!product || product.companyId !== ctx.companyId) {
      throw new NotFoundException('Produto nao encontrado para a empresa atual.');
    }

    return {
      productId: product.id,
      productName: product.name,
      sku: product.sku ?? null,
      recipeId: product.recipeId,
      recipe: product.recipe ? this.mapRecipeWithCost(product.recipe) : null,
    };
  }

  async setProductRecipe(ctx: RequestContext, productId: string, recipeId: string | null) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, companyId: true },
    });
    if (!product || product.companyId !== ctx.companyId) {
      throw new NotFoundException('Produto nao encontrado para a empresa atual.');
    }

    if (recipeId) {
      const recipe = await this.prisma.recipe.findUnique({
        where: { id: recipeId },
        select: { id: true, companyId: true },
      });
      if (!recipe || recipe.companyId !== ctx.companyId) {
        throw new BadRequestException('recipeId invalido para a empresa atual.');
      }
    }

    await this.prisma.product.update({
      where: { id: productId },
      data: { recipeId },
    });

    return this.getProductComposition(ctx, productId);
  }

  async estimateRecipePortioning(
    ctx: RequestContext,
    recipeId: string,
    input: {
      portionQuantity: number;
      portionUnit?: string;
      extraLossPercent?: number;
    },
  ) {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id: recipeId },
      include: {
        items: {
          include: { stockItem: true },
        },
      },
    });
    if (!recipe || recipe.companyId !== ctx.companyId) {
      throw new NotFoundException('Ficha tecnica nao encontrada para a empresa atual.');
    }

    const portionQuantity = Number(input.portionQuantity);
    if (!Number.isFinite(portionQuantity) || portionQuantity <= 0) {
      throw new BadRequestException('portionQuantity deve ser maior que zero.');
    }

    const recipeView = this.mapRecipeWithCost(recipe);
    const recipeYield = Number(recipeView.yieldQuantity);
    if (!Number.isFinite(recipeYield) || recipeYield <= 0) {
      throw new BadRequestException('Rendimento da ficha tecnica invalido para calculo de porcionamento.');
    }

    const extraLossPercent = input.extraLossPercent === undefined ? 0 : Number(input.extraLossPercent);
    if (!Number.isFinite(extraLossPercent) || extraLossPercent < 0 || extraLossPercent > 100) {
      throw new BadRequestException('extraLossPercent deve estar entre 0 e 100.');
    }

    const portionsCount = recipeYield / portionQuantity;
    const extraLossMultiplier = 1 + extraLossPercent / 100;
    const adjustedTotalCost = recipeView.cost.totalCost * extraLossMultiplier;
    const costPerPortion = portionsCount > 0 ? adjustedTotalCost / portionsCount : adjustedTotalCost;
    const portionUnit = input.portionUnit?.trim() || recipeView.yieldUnit;

    return {
      recipeId: recipeView.id,
      recipeName: recipeView.name,
      recipeYieldQuantity: recipeView.yieldQuantity,
      recipeYieldUnit: recipeView.yieldUnit,
      portionQuantity,
      portionUnit,
      portionsCount,
      cost: {
        baseTotalCost: recipeView.cost.totalCost,
        adjustedTotalCost,
        costPerPortion,
      },
      loss: {
        recipeLossPercent: recipeView.lossPercent ?? 0,
        extraLossPercent,
      },
    };
  }

  async getRecipeCostBreakdown(ctx: RequestContext, recipeId: string) {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id: recipeId },
      include: {
        items: {
          include: { stockItem: true },
        },
      },
    });
    if (!recipe || recipe.companyId !== ctx.companyId) {
      throw new NotFoundException('Ficha tecnica nao encontrada para a empresa atual.');
    }

    const recipeView = this.mapRecipeWithCost(recipe);
    const grossCost = recipeView.cost.grossCost;
    const totalCost = recipeView.cost.totalCost;

    const items = recipeView.items
      .map((item: any) => {
        const itemCost = Number(item.totalCost ?? 0);
        const grossSharePercent = grossCost > 0 ? (itemCost / grossCost) * 100 : 0;
        const totalSharePercent = totalCost > 0 ? (itemCost / totalCost) * 100 : 0;
        return {
          stockItemId: item.stockItemId,
          stockItemName: item.stockItemName,
          quantity: item.quantity,
          unit: item.unit,
          averageCost: item.averageCost,
          itemCost,
          affectsCost: item.affectsCost,
          grossSharePercent,
          totalSharePercent,
        };
      })
      .sort(
        (
          a: { itemCost: number },
          b: { itemCost: number },
        ) => b.itemCost - a.itemCost,
      );

    return {
      recipeId: recipeView.id,
      recipeName: recipeView.name,
      yieldQuantity: recipeView.yieldQuantity,
      yieldUnit: recipeView.yieldUnit,
      lossPercent: recipeView.lossPercent ?? 0,
      summary: {
        grossCost,
        totalCost,
        costPerYieldUnit: recipeView.cost.costPerYieldUnit,
      },
      items,
    };
  }

  private assertCreatePayload(input: {
    name: string;
    type: 'SALE' | 'PRODUCTION';
    yieldQuantity: number;
    yieldUnit: string;
    lossPercent?: number | null;
    items: RecipeItemInput[];
  }) {
    if (!input.name?.trim()) throw new BadRequestException('name obrigatorio.');
    if (input.type !== 'SALE' && input.type !== 'PRODUCTION') {
      throw new BadRequestException('type invalido. Use SALE ou PRODUCTION.');
    }
    if (!Number.isFinite(input.yieldQuantity) || input.yieldQuantity <= 0) {
      throw new BadRequestException('yieldQuantity deve ser maior que zero.');
    }
    if (!input.yieldUnit?.trim()) throw new BadRequestException('yieldUnit obrigatorio.');
    if (input.lossPercent !== undefined && input.lossPercent !== null) {
      const lossPercent = Number(input.lossPercent);
      if (!Number.isFinite(lossPercent) || lossPercent < 0 || lossPercent > 100) {
        throw new BadRequestException('lossPercent deve estar entre 0 e 100.');
      }
    }
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new BadRequestException('A ficha tecnica precisa de ao menos um item.');
    }
    this.assertRecipeItems(input.items);
  }

  private assertRecipeItems(items: RecipeItemInput[]) {
    for (const item of items) {
      if (!item.stockItemId?.trim()) {
        throw new BadRequestException('stockItemId obrigatorio em todos os itens.');
      }
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
        throw new BadRequestException('quantity deve ser maior que zero em todos os itens.');
      }
      if (!item.unit?.trim()) {
        throw new BadRequestException('unit obrigatorio em todos os itens.');
      }
    }
  }

  private async assertStockItemsOwnership(companyId: string, items: RecipeItemInput[]) {
    const ids = Array.from(new Set(items.map((item) => item.stockItemId)));
    const owned = await this.prisma.stockItem.findMany({
      where: { companyId, id: { in: ids } },
      select: { id: true },
    });
    const ownedSet = new Set(owned.map((item) => item.id));
    const missing = ids.filter((id) => !ownedSet.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(`StockItem(s) invalido(s) para a empresa: ${missing.join(', ')}`);
    }
  }

  private mapRecipeWithCost(recipe: any) {
    const grossCost = recipe.items.reduce((acc: number, item: any) => {
      if (!item.affectsCost) return acc;
      const avgCost = Number(item.stockItem?.averageCost ?? 0);
      const quantity = Number(item.quantity ?? 0);
      return acc + avgCost * quantity;
    }, 0);

    const lossPercent = Number(recipe.lossPercent ?? 0);
    const lossMultiplier = 1 + lossPercent / 100;
    const totalCost = grossCost * lossMultiplier;
    const yieldQuantity = Number(recipe.yieldQuantity ?? 1);
    const costPerYieldUnit = yieldQuantity > 0 ? totalCost / yieldQuantity : totalCost;

    return {
      id: recipe.id,
      companyId: recipe.companyId,
      name: recipe.name,
      type: recipe.type,
      yieldQuantity: Number(recipe.yieldQuantity),
      yieldUnit: recipe.yieldUnit,
      lossPercent: recipe.lossPercent === null ? null : Number(recipe.lossPercent),
      active: recipe.active,
      cost: {
        grossCost,
        totalCost,
        costPerYieldUnit,
      },
      items: recipe.items.map((item: any) => ({
        id: item.id,
        stockItemId: item.stockItemId,
        stockItemName: item.stockItem?.name ?? null,
        quantity: Number(item.quantity),
        unit: item.unit,
        optional: item.optional,
        affectsStock: item.affectsStock,
        affectsCost: item.affectsCost,
        averageCost: Number(item.stockItem?.averageCost ?? 0),
        totalCost: Number(item.quantity) * Number(item.stockItem?.averageCost ?? 0),
      })),
      createdAt: recipe.createdAt,
      updatedAt: recipe.updatedAt,
    };
  }
}

