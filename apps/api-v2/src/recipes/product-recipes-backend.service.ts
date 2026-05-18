import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AUDIT_ACTIONS } from '../common/audit-log';
import { AuditLogService } from '../common/audit-log.service';
import type { RequestContext } from '../common/request-context';
import { TENANT_PERMISSIONS } from '../common/rbac';
import {
  assertAnyPermission,
  buildCompanyWhere,
  canReadInventoryCosts,
} from '../common/query-scope';

export interface ProductRecipeInput {
  yieldQuantity?: number | null;
  yieldUnit?: string | null;
  notes?: string | null;
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface ProductRecipeItemInput {
  stockItemId: string;
  quantity: number;
  unitOfMeasure: string;
  lossPercent?: number;
  notes?: string | null;
  sortOrder?: number;
}

@Injectable()
export class ProductRecipesBackendService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async getRecipeForProduct(ctx: RequestContext, productId: string) {
    assertAnyPermission(ctx, [TENANT_PERMISSIONS.RECIPE_READ], 'Sem permissao para ler ficha tecnica.');
    await this.assertProductInCompany(ctx, productId);

    const recipe = await this.prisma.productRecipe.findFirst({
      where: buildCompanyWhere(ctx, { productId }) as any,
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        costSnapshots: {
          orderBy: { createdAt: 'desc' },
          take: canReadInventoryCosts(ctx) ? 5 : 0,
        },
      },
      orderBy: { version: 'desc' },
    });

    if (!recipe || canReadInventoryCosts(ctx)) {
      return recipe;
    }

    return maskRecipeCosts(recipe);
  }

  async upsertRecipe(ctx: RequestContext, productId: string, input: ProductRecipeInput) {
    assertAnyPermission(ctx, [TENANT_PERMISSIONS.RECIPE_MANAGE], 'Sem permissao para gerenciar ficha tecnica.');
    await this.assertProductInCompany(ctx, productId);

    const existing = await this.prisma.productRecipe.findFirst({
      where: buildCompanyWhere(ctx, { productId }) as any,
      orderBy: { version: 'desc' },
    });

    const payload = {
      yieldQuantity: input.yieldQuantity ?? 1,
      yieldUnit: clean(input.yieldUnit) ?? 'UN',
      notes: clean(input.notes),
      status: input.status ?? existing?.status ?? 'DRAFT',
      metadata: input.metadata as any,
    };

    const recipe = existing
      ? await this.prisma.productRecipe.update({
          where: { id: existing.id },
          data: payload,
        })
      : await this.prisma.productRecipe.create({
          data: {
            companyId: ctx.companyId,
            productId,
            version: 1,
            createdByUserId: ctx.userId ?? null,
            ...payload,
          },
        });

    await this.auditLog.recordFromContext({
      action: existing ? AUDIT_ACTIONS.PRODUCT_RECIPE_UPDATE : AUDIT_ACTIONS.PRODUCT_RECIPE_CREATE,
      outcome: 'success',
      ctx,
      target: { type: 'product_recipe', id: recipe.id },
      metadata: { productId, recipeId: recipe.id, version: recipe.version },
    });

    return recipe;
  }

  async replaceItems(ctx: RequestContext, productId: string, items: ProductRecipeItemInput[]) {
    assertAnyPermission(ctx, [TENANT_PERMISSIONS.RECIPE_MANAGE], 'Sem permissao para alterar ingredientes.');
    if (!items.length) throw new BadRequestException('items obrigatorio.');
    const recipe = await this.ensureRecipe(ctx, productId);

    const stockItems = await this.prisma.inventoryItem.findMany({
      where: buildCompanyWhere(ctx, { id: { in: items.map((item) => item.stockItemId) } }) as any,
      select: { id: true, averageCost: true, unitOfMeasure: true },
    });
    const stockById = new Map(stockItems.map((item) => [item.id, item]));
    if (stockById.size !== new Set(items.map((item) => item.stockItemId)).size) {
      throw new NotFoundException('Um ou mais insumos nao foram encontrados.');
    }

    const normalizedItems = items.map((item, index) => {
      const quantity = Number(item.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new BadRequestException('quantity deve ser maior que zero.');
      }
      const lossPercent = Number(item.lossPercent ?? 0);
      const effectiveQuantity = quantity * (1 + lossPercent / 100);
      const stock = stockById.get(item.stockItemId);
      const unitCost = stock?.averageCost == null ? null : Number(stock.averageCost);
      const totalCost = unitCost == null ? null : Number((effectiveQuantity * unitCost).toFixed(2));
      return {
        companyId: ctx.companyId,
        recipeId: recipe.id,
        productId,
        stockItemId: item.stockItemId,
        quantity,
        unitOfMeasure: clean(item.unitOfMeasure) ?? stock?.unitOfMeasure ?? 'UN',
        lossPercent,
        effectiveQuantity,
        unitCost,
        totalCost,
        notes: clean(item.notes),
        sortOrder: item.sortOrder ?? index,
      };
    });

    const totalCost = normalizedItems.reduce((sum, item) => sum + Number(item.totalCost ?? 0), 0);
    const updatedRecipe = await this.prisma.$transaction(async (tx) => {
      await tx.productRecipeItem.deleteMany({
        where: { companyId: ctx.companyId, recipeId: recipe.id },
      });
      await tx.productRecipeItem.createMany({ data: normalizedItems });
      const updated = await tx.productRecipe.update({
        where: { id: recipe.id },
        data: {
          totalCost: Number(totalCost.toFixed(2)),
          costDataStatus: normalizedItems.every((item) => item.unitCost != null) ? 'COMPLETE' : 'PARTIAL_DATA',
        },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      });
      await tx.productRecipeCostSnapshot.create({
        data: {
          companyId: ctx.companyId,
          productId,
          recipeId: recipe.id,
          recipeVersion: recipe.version,
          totalCost: Number(totalCost.toFixed(2)),
          costDataStatus: updated.costDataStatus,
        },
      });
      return updated;
    });

    await this.auditLog.recordFromContext({
      action: AUDIT_ACTIONS.PRODUCT_RECIPE_ITEMS_UPDATE,
      outcome: 'success',
      ctx,
      target: { type: 'product_recipe', id: recipe.id },
      metadata: { productId, recipeId: recipe.id, itemCount: items.length, totalCost },
    });

    return canReadInventoryCosts(ctx) ? updatedRecipe : maskRecipeCosts(updatedRecipe);
  }

  private async ensureRecipe(ctx: RequestContext, productId: string) {
    await this.assertProductInCompany(ctx, productId);
    const recipe = await this.prisma.productRecipe.findFirst({
      where: buildCompanyWhere(ctx, { productId }) as any,
      orderBy: { version: 'desc' },
    });
    if (recipe) return recipe;
    return this.prisma.productRecipe.create({
      data: {
        companyId: ctx.companyId,
        productId,
        version: 1,
        yieldQuantity: 1,
        yieldUnit: 'UN',
        status: 'DRAFT',
        createdByUserId: ctx.userId ?? null,
      },
    });
  }

  private async assertProductInCompany(ctx: RequestContext, productId: string) {
    const normalizedProductId = String(productId ?? '').trim();
    if (!normalizedProductId) throw new BadRequestException('productId obrigatorio.');
    const product = await this.prisma.product.findFirst({
      where: buildCompanyWhere(ctx, { id: normalizedProductId, deletedAt: null }) as any,
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Produto nao encontrado.');
  }
}

function maskRecipeCosts<T extends { totalCost?: unknown; items?: Array<Record<string, unknown>>; costSnapshots?: unknown[] }>(
  recipe: T,
): T {
  return {
    ...recipe,
    totalCost: null,
    costSnapshots: [],
    items: recipe.items?.map((item) => ({
      ...item,
      unitCost: null,
      totalCost: null,
    })),
  };
}

function clean(value?: string | null): string | null {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : null;
}
