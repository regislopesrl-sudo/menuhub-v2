import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { RequestContext } from '../common/request-context';

const STOCK_ITEM_TYPES = ['PRODUCT', 'RAW_MATERIAL', 'ADDON'] as const;
type StockItemTypeValue = (typeof STOCK_ITEM_TYPES)[number];
const COMMITTED_ORDER_STATUSES = [
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'IN_PREPARATION',
  'READY',
  'WAITING_PICKUP',
  'WAITING_DISPATCH',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
] as const;

type CommittedStockInfo = {
  quantity: number;
  orderIds: Set<string>;
};

export type StockItemInput = {
  name: string;
  code?: string;
  categoryId?: string | null;
  stockType?: StockItemTypeValue;
  purchaseUnit?: string;
  stockUnit?: string;
  productionUnit?: string;
  conversionFactor?: number;
  minimumQuantity?: number;
  reorderPoint?: number;
  averageCost?: number;
  leadTimeDays?: number;
  controlsStock?: boolean;
  controlsBatch?: boolean;
  controlsExpiry?: boolean;
  requiresFefo?: boolean;
  isPerishable?: boolean;
  isFractionable?: boolean;
  isCritical?: boolean;
  isHighTurnover?: boolean;
  allowNegativeStock?: boolean;
};

export type StockCategoryInput = {
  name: string;
  sortOrder?: number;
  isActive?: boolean;
};

export type StockMovementInput = {
  stockItemId: string;
  quantity: number;
  unitCost?: number;
  batchId?: string;
  reasonCode?: string;
  notes?: string;
};

export type StockLossInput = {
  stockItemId: string;
  quantity: number;
  unitCost?: number;
  batchId?: string;
  reasonCode?: string;
  notes?: string;
};

export type StockBatchInput = {
  stockItemId: string;
  batchNumber?: string;
  expirationDate?: string;
  receivedDate?: string;
  initialQuantity: number;
  unitCost?: number;
  notes?: string;
};

export type StockBatchStatusInput = {
  stockItemId: string;
  batchId: string;
  status: 'AVAILABLE' | 'OPENED' | 'QUARANTINED' | 'DISCARDED' | 'EXPIRED';
  notes?: string;
};

export type StockMovementFilters = {
  stockItemId?: string;
  batchId?: string;
  movementType?: string;
  from?: string;
  to?: string;
};

export type StockCheckoutItemInput = {
  productId: string;
  quantity: number;
  name?: string;
};

export type InventoryCountInput = {
  stockItemId: string;
  countedQuantity: number;
  reasonCode?: string;
  notes?: string;
};

export type BatchInventoryCountInput = {
  stockItemId: string;
  batchId: string;
  countedQuantity: number;
  reasonCode?: string;
  notes?: string;
};

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  async listItems(ctx: RequestContext, filters: { includeInactive?: boolean } = {}) {
    const [items, committedStock] = await Promise.all([
      this.prisma.stockItem.findMany({
        where: {
          companyId: ctx.companyId,
          ...(filters.includeInactive ? {} : { isActive: true }),
        },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          categoryId: true,
          name: true,
          code: true,
          stockType: true,
          purchaseUnit: true,
          stockUnit: true,
          productionUnit: true,
          conversionFactor: true,
          currentQuantity: true,
          minimumQuantity: true,
          reorderPoint: true,
          averageCost: true,
          lastCost: true,
          leadTimeDays: true,
          controlsStock: true,
          controlsBatch: true,
          controlsExpiry: true,
          requiresFefo: true,
          isPerishable: true,
          isFractionable: true,
          isCritical: true,
          isHighTurnover: true,
          allowNegativeStock: true,
          isActive: true,
          updatedAt: true,
          category: {
            select: {
              id: true,
              name: true,
              sortOrder: true,
              isActive: true,
            },
          },
        },
      }),
      this.readCommittedStock(ctx),
    ]);

    return items.map((item) => this.withAvailability(item, committedStock));
  }

  async listCategories(ctx: RequestContext, filters: { includeInactive?: boolean } = {}) {
    return this.prisma.stockCategory.findMany({
      where: {
        companyId: ctx.companyId,
        ...(filters.includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        sortOrder: true,
        isActive: true,
        _count: { select: { items: true } },
      },
    });
  }

  async createCategory(ctx: RequestContext, input: StockCategoryInput) {
    const name = String(input.name ?? '').trim();
    if (!name) throw new BadRequestException('name obrigatorio.');
    const sortOrder = input.sortOrder === undefined ? 0 : this.parseNonNegativeInteger(input.sortOrder, 'sortOrder invalido.');

    return this.prisma.stockCategory.create({
      data: {
        companyId: ctx.companyId,
        name,
        sortOrder,
        isActive: input.isActive === undefined ? true : Boolean(input.isActive),
      },
    });
  }

  async updateCategory(ctx: RequestContext, id: string, input: Partial<StockCategoryInput>) {
    const existing = await this.prisma.stockCategory.findUnique({ where: { id } });
    if (!existing || existing.companyId !== ctx.companyId) {
      throw new NotFoundException('Categoria de estoque nao encontrada.');
    }

    const payload: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = String(input.name ?? '').trim();
      if (!name) throw new BadRequestException('name nao pode ser vazio.');
      payload.name = name;
    }
    if (input.sortOrder !== undefined) payload.sortOrder = this.parseNonNegativeInteger(input.sortOrder, 'sortOrder invalido.');
    if (input.isActive !== undefined) payload.isActive = Boolean(input.isActive);
    if (Object.keys(payload).length === 0) {
      throw new BadRequestException('Payload vazio para atualizacao.');
    }

    return this.prisma.stockCategory.update({ where: { id }, data: payload });
  }

  async updateCategoryStatus(ctx: RequestContext, id: string, input: { isActive: boolean }) {
    return this.updateCategory(ctx, id, { isActive: Boolean(input.isActive) });
  }

  async getDashboard(ctx: RequestContext) {
    const [items, committedStock, blockedBatches, expiringBatches] = await Promise.all([
      this.prisma.stockItem.findMany({
        where: { companyId: ctx.companyId, isActive: true },
        select: {
          id: true,
          stockType: true,
          currentQuantity: true,
          minimumQuantity: true,
          reorderPoint: true,
          averageCost: true,
          controlsBatch: true,
          controlsExpiry: true,
          isPerishable: true,
        },
      }),
      this.readCommittedStock(ctx),
      this.prisma.stockBatch.count({
        where: {
          stockItem: { companyId: ctx.companyId, isActive: true },
          status: { in: ['QUARANTINED', 'DISCARDED', 'EXPIRED'] },
        },
      }),
      this.prisma.stockBatch.count({
        where: {
          stockItem: { companyId: ctx.companyId, isActive: true },
          quantityRemaining: { gt: 0 },
          status: { in: ['AVAILABLE', 'OPENED'] },
          expirationDate: { lte: this.daysFromNow(7) },
        },
      }),
    ]);

    const byType = { PRODUCT: 0, ADDON: 0, RAW_MATERIAL: 0 };
    let totalValue = 0;
    let belowMinimum = 0;
    let reorderAttention = 0;
    let perishable = 0;
    let batchControlled = 0;
    let committedQuantity = 0;
    let committedValue = 0;
    let availableValue = 0;
    let belowAvailableMinimum = 0;

    for (const item of items) {
      const stockType = String(item.stockType) as StockItemTypeValue;
      byType[stockType] = (byType[stockType] ?? 0) + 1;
      const current = Number(item.currentQuantity ?? 0);
      const committed = committedStock.get(item.id)?.quantity ?? 0;
      const available = current - committed;
      const minimum = Number(item.minimumQuantity ?? 0);
      const reorder = Number(item.reorderPoint ?? 0);
      const averageCost = Number(item.averageCost ?? 0);
      totalValue += current * averageCost;
      committedQuantity += committed;
      committedValue += committed * averageCost;
      availableValue += available * averageCost;
      if (current <= minimum) belowMinimum += 1;
      if (available <= minimum) belowAvailableMinimum += 1;
      if (reorder > 0 && current <= reorder) reorderAttention += 1;
      if (item.controlsExpiry || item.isPerishable) perishable += 1;
      if (item.controlsBatch) batchControlled += 1;
    }

    return {
      totalItems: items.length,
      byType,
      totalValue: this.money(totalValue),
      availableValue: this.money(availableValue),
      committedValue: this.money(committedValue),
      committedQuantity: this.decimal(committedQuantity),
      belowMinimum,
      belowAvailableMinimum,
      reorderAttention,
      perishable,
      batchControlled,
      blockedBatches,
      expiringBatches,
      generatedAt: new Date().toISOString(),
    };
  }

  async getItem(ctx: RequestContext, id: string) {
    const item = await this.prisma.stockItem.findUnique({
      where: { id },
      select: {
        id: true,
        categoryId: true,
        name: true,
        code: true,
        stockType: true,
        purchaseUnit: true,
        stockUnit: true,
        productionUnit: true,
        conversionFactor: true,
        currentQuantity: true,
        minimumQuantity: true,
        reorderPoint: true,
        averageCost: true,
        lastCost: true,
        standardCost: true,
        leadTimeDays: true,
        controlsStock: true,
        controlsBatch: true,
        controlsExpiry: true,
        requiresFefo: true,
        isPerishable: true,
        isFractionable: true,
        isCritical: true,
        isHighTurnover: true,
        allowNegativeStock: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        companyId: true,
        category: {
          select: {
            id: true,
            name: true,
            sortOrder: true,
            isActive: true,
          },
        },
      },
    });
    if (!item || item.companyId !== ctx.companyId) {
      throw new NotFoundException('Item de estoque nao encontrado.');
    }
    const safeItem = { ...item } as Record<string, unknown>;
    delete safeItem.companyId;
    const committedStock = await this.readCommittedStock(ctx);
    return this.withAvailability(safeItem, committedStock);
  }

  async listAvailability(ctx: RequestContext) {
    const items = await this.listItems(ctx);
    return items.map((item: any) => ({
      stockItemId: item.id,
      name: item.name,
      code: item.code,
      stockType: item.stockType,
      stockUnit: item.stockUnit,
      currentQuantity: Number(item.currentQuantity ?? 0),
      committedQuantity: Number(item.committedQuantity ?? 0),
      availableQuantity: Number(item.availableQuantity ?? 0),
      committedOrderCount: Number(item.committedOrderCount ?? 0),
      minimumQuantity: Number(item.minimumQuantity ?? 0),
      reorderPoint: Number(item.reorderPoint ?? 0),
      averageCost: Number(item.averageCost ?? 0),
      availableValue: this.money(Number(item.availableQuantity ?? 0) * Number(item.averageCost ?? 0)),
      committedValue: this.money(Number(item.committedQuantity ?? 0) * Number(item.averageCost ?? 0)),
    }));
  }

  async listProductAvailability(ctx: RequestContext) {
    const [products, committedStock] = await Promise.all([
      this.prisma.product.findMany({
        where: { companyId: ctx.companyId, deletedAt: null, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          categoryId: true,
          name: true,
          sku: true,
          salePrice: true,
          costPrice: true,
          controlsStock: true,
          recipeId: true,
          category: {
            select: {
              id: true,
              name: true,
              sortOrder: true,
            },
          },
          recipe: {
            select: {
              id: true,
              name: true,
              yieldQuantity: true,
              yieldUnit: true,
              lossPercent: true,
              active: true,
              items: {
                where: { affectsStock: true },
                select: {
                  stockItemId: true,
                  quantity: true,
                  unit: true,
                  optional: true,
                  affectsStock: true,
                  affectsCost: true,
                  stockItem: {
                    select: {
                      id: true,
                      name: true,
                      code: true,
                      stockType: true,
                      stockUnit: true,
                      currentQuantity: true,
                      minimumQuantity: true,
                      reorderPoint: true,
                      averageCost: true,
                      controlsStock: true,
                      isActive: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.readCommittedStock(ctx),
    ]);

    return products.map((product: any) => this.withProductAvailability(product, committedStock));
  }

  async assertProductsAvailableForCheckout(ctx: RequestContext, items: StockCheckoutItemInput[]) {
    const requested = new Map<string, { productId: string; quantity: number; name?: string }>();
    for (const item of Array.isArray(items) ? items : []) {
      const productId = String(item.productId ?? '').trim();
      const quantity = Number(item.quantity ?? 0);
      if (!productId || !Number.isFinite(quantity) || quantity <= 0) continue;
      const current = requested.get(productId) ?? { productId, quantity: 0, name: item.name };
      current.quantity += quantity;
      current.name = current.name ?? item.name;
      requested.set(productId, current);
    }

    if (requested.size === 0) return { available: true, blocked: [] };

    const [products, committedStock] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          companyId: ctx.companyId,
          deletedAt: null,
          id: { in: [...requested.keys()] },
        },
        select: {
          id: true,
          categoryId: true,
          name: true,
          sku: true,
          salePrice: true,
          costPrice: true,
          controlsStock: true,
          recipeId: true,
          category: {
            select: {
              id: true,
              name: true,
              sortOrder: true,
            },
          },
          recipe: {
            select: {
              id: true,
              name: true,
              yieldQuantity: true,
              yieldUnit: true,
              lossPercent: true,
              active: true,
              items: {
                where: { affectsStock: true },
                select: {
                  stockItemId: true,
                  quantity: true,
                  unit: true,
                  optional: true,
                  affectsStock: true,
                  affectsCost: true,
                  stockItem: {
                    select: {
                      id: true,
                      name: true,
                      code: true,
                      stockType: true,
                      stockUnit: true,
                      currentQuantity: true,
                      minimumQuantity: true,
                      reorderPoint: true,
                      averageCost: true,
                      controlsStock: true,
                      isActive: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.readCommittedStock(ctx),
    ]);

    const availabilityByProductId = new Map(
      (products ?? []).map((product: any) => [product.id, this.withProductAvailability(product, committedStock)] as const),
    );
    const blocked: Array<{
      productId: string;
      name: string;
      requestedQuantity: number;
      availableToSell: number;
      limitingIngredients: unknown[];
    }> = [];

    for (const item of requested.values()) {
      const availability = availabilityByProductId.get(item.productId);
      if (!availability) continue;
      const availableToSell = availability.availableToSell;
      const hasTechnicalStockControl = availability.controlsStock && availability.recipeId && availability.ingredients.length > 0;
      if (!hasTechnicalStockControl || availableToSell === null) continue;
      if (item.quantity > availableToSell) {
        blocked.push({
          productId: item.productId,
          name: availability.name ?? item.name ?? item.productId,
          requestedQuantity: this.decimal(item.quantity),
          availableToSell,
          limitingIngredients: availability.limitingIngredients,
        });
      }
    }

    if (blocked.length > 0) {
      const first = blocked[0];
      throw new BadRequestException(
        `Estoque insuficiente para ${first.name}: solicitado ${first.requestedQuantity}, disponivel ${first.availableToSell}.`,
      );
    }

    return { available: true, blocked };
  }

  async createItem(ctx: RequestContext, input: StockItemInput) {
    const name = String(input.name ?? '').trim();
    if (!name) throw new BadRequestException('name obrigatorio.');

    const conversionFactor = input.conversionFactor === undefined ? 1 : Number(input.conversionFactor);
    if (!Number.isFinite(conversionFactor) || conversionFactor <= 0) {
      throw new BadRequestException('conversionFactor deve ser maior que zero.');
    }
    this.assertNonNegative(input.minimumQuantity ?? 0, 'minimumQuantity invalida.');
    this.assertNonNegative(input.reorderPoint ?? 0, 'reorderPoint invalido.');
    this.assertNonNegative(input.averageCost ?? 0, 'averageCost invalido.');
    const leadTimeDays = this.parseNonNegativeInteger(input.leadTimeDays ?? 0, 'leadTimeDays invalido.');
    const categoryId = await this.resolveCategoryId(ctx, input.categoryId);

    return this.prisma.stockItem.create({
      data: {
        companyId: ctx.companyId,
        ...(categoryId !== undefined ? { categoryId } : {}),
        name,
        code: this.clean(input.code),
        stockType: this.normalizeStockType(input.stockType) ?? 'RAW_MATERIAL',
        purchaseUnit: this.clean(input.purchaseUnit),
        stockUnit: this.clean(input.stockUnit) ?? 'un',
        productionUnit: this.clean(input.productionUnit),
        conversionFactor: this.decimal(conversionFactor),
        minimumQuantity: this.decimal(input.minimumQuantity ?? 0),
        reorderPoint: this.decimal(input.reorderPoint ?? 0),
        averageCost: this.decimal(input.averageCost ?? 0),
        leadTimeDays,
        controlsStock: input.controlsStock === undefined ? true : Boolean(input.controlsStock),
        controlsBatch: Boolean(input.controlsBatch),
        controlsExpiry: Boolean(input.controlsExpiry),
        requiresFefo: Boolean(input.requiresFefo),
        isPerishable: Boolean(input.isPerishable),
        isFractionable: Boolean(input.isFractionable),
        isCritical: Boolean(input.isCritical),
        isHighTurnover: Boolean(input.isHighTurnover),
        allowNegativeStock: Boolean(input.allowNegativeStock),
      },
    });
  }

  async updateItem(ctx: RequestContext, id: string, input: Partial<StockItemInput>) {
    const existing = await this.prisma.stockItem.findUnique({ where: { id } });
    if (!existing || existing.companyId !== ctx.companyId) {
      throw new NotFoundException('Item de estoque nao encontrado.');
    }

    const payload: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = String(input.name ?? '').trim();
      if (!name) throw new BadRequestException('name nao pode ser vazio.');
      payload.name = name;
    }
    if (input.categoryId !== undefined) payload.categoryId = await this.resolveCategoryId(ctx, input.categoryId);
    if (input.code !== undefined) payload.code = this.clean(input.code);
    if (input.stockType !== undefined) payload.stockType = this.normalizeStockType(input.stockType);
    if (input.purchaseUnit !== undefined) payload.purchaseUnit = this.clean(input.purchaseUnit);
    if (input.stockUnit !== undefined) payload.stockUnit = this.clean(input.stockUnit);
    if (input.productionUnit !== undefined) payload.productionUnit = this.clean(input.productionUnit);
    if (input.conversionFactor !== undefined) {
      const conversionFactor = Number(input.conversionFactor);
      if (!Number.isFinite(conversionFactor) || conversionFactor <= 0) {
        throw new BadRequestException('conversionFactor deve ser maior que zero.');
      }
      payload.conversionFactor = this.decimal(conversionFactor);
    }
    if (input.minimumQuantity !== undefined) {
      this.assertNonNegative(input.minimumQuantity, 'minimumQuantity invalida.');
      payload.minimumQuantity = this.decimal(input.minimumQuantity);
    }
    if (input.reorderPoint !== undefined) {
      this.assertNonNegative(input.reorderPoint, 'reorderPoint invalido.');
      payload.reorderPoint = this.decimal(input.reorderPoint);
    }
    if (input.averageCost !== undefined) {
      this.assertNonNegative(input.averageCost, 'averageCost invalido.');
      payload.averageCost = this.decimal(input.averageCost);
    }
    if (input.leadTimeDays !== undefined) payload.leadTimeDays = this.parseNonNegativeInteger(input.leadTimeDays, 'leadTimeDays invalido.');
    if (input.controlsStock !== undefined) payload.controlsStock = Boolean(input.controlsStock);
    if (input.controlsBatch !== undefined) payload.controlsBatch = Boolean(input.controlsBatch);
    if (input.controlsExpiry !== undefined) payload.controlsExpiry = Boolean(input.controlsExpiry);
    if (input.requiresFefo !== undefined) payload.requiresFefo = Boolean(input.requiresFefo);
    if (input.isPerishable !== undefined) payload.isPerishable = Boolean(input.isPerishable);
    if (input.isFractionable !== undefined) payload.isFractionable = Boolean(input.isFractionable);
    if (input.isCritical !== undefined) payload.isCritical = Boolean(input.isCritical);
    if (input.isHighTurnover !== undefined) payload.isHighTurnover = Boolean(input.isHighTurnover);
    if (input.allowNegativeStock !== undefined) payload.allowNegativeStock = Boolean(input.allowNegativeStock);

    if (Object.keys(payload).length === 0) {
      throw new BadRequestException('Payload vazio para atualizacao.');
    }

    return this.prisma.stockItem.update({ where: { id }, data: payload });
  }

  async updateItemStatus(ctx: RequestContext, id: string, input: { isActive: boolean }) {
    const existing = await this.prisma.stockItem.findUnique({ where: { id } });
    if (!existing || existing.companyId !== ctx.companyId) {
      throw new NotFoundException('Item de estoque nao encontrado.');
    }
    return this.prisma.stockItem.update({
      where: { id },
      data: { isActive: Boolean(input.isActive) },
    });
  }

  async listMovements(ctx: RequestContext, filters: string | StockMovementFilters = {}) {
    const parsedFilters: StockMovementFilters = typeof filters === 'string' ? { stockItemId: filters } : filters;
    const from = parsedFilters.from ? new Date(parsedFilters.from) : null;
    const to = parsedFilters.to ? new Date(parsedFilters.to) : null;
    if (from && Number.isNaN(from.getTime())) throw new BadRequestException('from invalido.');
    if (to && Number.isNaN(to.getTime())) throw new BadRequestException('to invalido.');
    const movementType = parsedFilters.movementType ? String(parsedFilters.movementType).trim().toUpperCase() : null;
    const allowedMovementTypes = ['ENTRY', 'EXIT', 'ADJUSTMENT', 'LOSS', 'TRANSFER', 'PRODUCTION_CONSUMPTION', 'PRODUCTION_OUTPUT', 'SALE_CONSUMPTION', 'RETURN'];
    if (movementType && !allowedMovementTypes.includes(movementType)) throw new BadRequestException('movementType invalido.');

    return this.prisma.stockMovement.findMany({
      where: {
        stockItem: { companyId: ctx.companyId },
        ...(parsedFilters.stockItemId ? { stockItemId: parsedFilters.stockItemId } : {}),
        ...(parsedFilters.batchId ? { batchId: parsedFilters.batchId } : {}),
        ...(movementType ? { movementType: movementType as any } : {}),
        ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        stockItemId: true,
        movementType: true,
        movementTypeDetailed: true,
        quantity: true,
        unitCost: true,
        totalCost: true,
        previousStock: true,
        newStock: true,
        batchId: true,
        batch: {
          select: {
            batchNumber: true,
            expirationDate: true,
            status: true,
          },
        },
        reasonCode: true,
        notes: true,
        createdAt: true,
      },
    });
  }

  async manualEntry(ctx: RequestContext, input: StockMovementInput) {
    return this.applyManualMovement(ctx, 'ENTRY', input);
  }

  async manualExit(ctx: RequestContext, input: StockMovementInput) {
    return this.applyManualMovement(ctx, 'EXIT', input);
  }

  async registerLoss(ctx: RequestContext, input: StockLossInput) {
    const payload: StockMovementInput = {
      stockItemId: input.stockItemId,
      quantity: input.quantity,
      unitCost: input.unitCost,
      batchId: input.batchId,
      reasonCode: input.reasonCode ?? 'loss_manual',
      notes: input.notes,
    };
    const result = await this.applyManualMovement(ctx, 'EXIT', payload, {
      movementTypeDetailed: 'manual_loss',
      sourceModule: 'admin_stock_loss',
      movementType: 'LOSS',
    });
    return result;
  }

  async listBatches(ctx: RequestContext, stockItemId: string) {
    const item = await this.prisma.stockItem.findUnique({ where: { id: stockItemId } });
    if (!item || item.companyId !== ctx.companyId) throw new NotFoundException('Item de estoque nao encontrado.');

    return this.prisma.stockBatch.findMany({
      where: { stockItemId },
      orderBy: [{ expirationDate: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        stockItemId: true,
        batchNumber: true,
        receivedDate: true,
        expirationDate: true,
        initialQuantity: true,
        quantityRemaining: true,
        unitCost: true,
        status: true,
        sanitaryNotes: true,
        createdAt: true,
      },
    });
  }

  async createBatch(ctx: RequestContext, input: StockBatchInput) {
    const stockItemId = String(input.stockItemId ?? '').trim();
    if (!stockItemId) throw new BadRequestException('stockItemId obrigatorio.');
    const initialQuantity = Number(input.initialQuantity ?? 0);
    if (!Number.isFinite(initialQuantity) || initialQuantity <= 0) {
      throw new BadRequestException('initialQuantity deve ser maior que zero.');
    }

    const item = await this.prisma.stockItem.findUnique({ where: { id: stockItemId } });
    if (!item || item.companyId !== ctx.companyId) throw new NotFoundException('Item de estoque nao encontrado.');

    const unitCost = Number(input.unitCost ?? item.averageCost ?? 0);
    if (!Number.isFinite(unitCost) || unitCost < 0) throw new BadRequestException('unitCost invalido.');

    const expirationDate = input.expirationDate ? new Date(input.expirationDate) : null;
    const receivedDate = input.receivedDate ? new Date(input.receivedDate) : new Date();
    if (expirationDate && Number.isNaN(expirationDate.getTime())) throw new BadRequestException('expirationDate invalida.');
    if (receivedDate && Number.isNaN(receivedDate.getTime())) throw new BadRequestException('receivedDate invalida.');

    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.stockBatch.create({
        data: {
          stockItemId,
          branchId: ctx.branchId,
          batchNumber: this.clean(input.batchNumber),
          receivedDate,
          expirationDate,
          initialQuantity: this.decimal(initialQuantity),
          quantityRemaining: this.decimal(initialQuantity),
          unitCost: this.decimal(unitCost),
          sanitaryNotes: this.clean(input.notes),
        },
      });

      const previous = Number(item.currentQuantity);
      const next = previous + initialQuantity;
      const weightedAverageCost = this.weightedAverageCost(previous, Number(item.averageCost ?? 0), initialQuantity, unitCost);
      await tx.stockItem.update({
        where: { id: stockItemId },
        data: {
          currentQuantity: this.decimal(next),
          averageCost: this.decimal(weightedAverageCost),
          lastCost: this.decimal(unitCost),
          controlsBatch: true,
        },
      });

      if (ctx.branchId) {
        await tx.stockLocationBalance.upsert({
          where: { branchId_stockItemId: { branchId: ctx.branchId, stockItemId } },
          update: { currentQuantity: this.decimal(next), companyId: ctx.companyId },
          create: { branchId: ctx.branchId, stockItemId, companyId: ctx.companyId, currentQuantity: this.decimal(next) },
        });
      }

      await tx.stockMovement.create({
        data: {
          stockItemId,
          branchId: ctx.branchId,
          batchId: batch.id,
          movementType: 'ENTRY',
          movementTypeDetailed: 'batch_entry',
          sourceModule: 'admin_stock_batch',
          sourceId: ctx.requestId,
          actorId: ctx.userId,
          requestId: ctx.requestId,
          quantity: this.decimal(initialQuantity),
          unitCost: this.decimal(unitCost),
          totalCost: this.decimal(initialQuantity * unitCost),
          previousStock: this.decimal(previous),
          newStock: this.decimal(next),
          reasonCode: 'batch_entry',
          notes: this.clean(input.notes),
        },
      });

      return batch;
    });
  }

  async updateBatchStatus(ctx: RequestContext, input: StockBatchStatusInput) {
    const stockItemId = String(input.stockItemId ?? '').trim();
    const batchId = String(input.batchId ?? '').trim();
    if (!stockItemId || !batchId) throw new BadRequestException('stockItemId e batchId obrigatorios.');

    const status = String(input.status ?? '').trim().toUpperCase();
    if (!['AVAILABLE', 'OPENED', 'QUARANTINED', 'DISCARDED', 'EXPIRED'].includes(status)) {
      throw new BadRequestException('status de lote invalido.');
    }

    const batch = await this.prisma.stockBatch.findUnique({
      where: { id: batchId },
      include: { stockItem: true },
    });
    if (!batch || batch.stockItemId !== stockItemId || batch.stockItem?.companyId !== ctx.companyId) {
      throw new NotFoundException('Lote de estoque nao encontrado.');
    }
    if (ctx.branchId && batch.branchId && batch.branchId !== ctx.branchId) {
      throw new NotFoundException('Lote de estoque nao encontrado para a filial atual.');
    }

    const remaining = Number(batch.quantityRemaining ?? 0);
    const terminal = status === 'DISCARDED' || status === 'EXPIRED';
    if (terminal && remaining <= 0) {
      return this.prisma.stockBatch.update({
        where: { id: batchId },
        data: { status: status as any, sanitaryNotes: this.clean(input.notes) ?? batch.sanitaryNotes },
      });
    }
    if (!terminal && remaining <= 0) {
      throw new BadRequestException('Lote sem saldo nao pode voltar para status operacional.');
    }

    if (!terminal) {
      return this.prisma.stockBatch.update({
        where: { id: batchId },
        data: { status: status as any, sanitaryNotes: this.clean(input.notes) ?? batch.sanitaryNotes },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const previous = Number(batch.stockItem.currentQuantity ?? 0);
      const next = previous - remaining;
      if (next < 0 && !batch.stockItem.allowNegativeStock) {
        throw new BadRequestException('Saldo do lote excede saldo atual do item.');
      }

      const updatedBatch = await tx.stockBatch.update({
        where: { id: batchId },
        data: {
          quantityRemaining: this.decimal(0),
          status: status as any,
          sanitaryNotes: this.clean(input.notes) ?? batch.sanitaryNotes,
        },
      });

      const updatedItem = await tx.stockItem.update({
        where: { id: stockItemId },
        data: { currentQuantity: this.decimal(next) },
      });

      const branchId = batch.branchId ?? ctx.branchId;
      if (branchId) {
        await tx.stockLocationBalance.upsert({
          where: { branchId_stockItemId: { branchId, stockItemId } },
          update: { currentQuantity: this.decimal(next), companyId: ctx.companyId },
          create: { branchId, stockItemId, companyId: ctx.companyId, currentQuantity: this.decimal(next) },
        });
      }

      await tx.stockMovement.create({
        data: {
          stockItemId,
          branchId,
          batchId,
          movementType: 'LOSS',
          movementTypeDetailed: status === 'EXPIRED' ? 'batch_expired_writeoff' : 'batch_discard_writeoff',
          sourceModule: 'admin_stock_batch',
          sourceId: batchId,
          actorId: ctx.userId,
          requestId: ctx.requestId,
          quantity: this.decimal(remaining),
          unitCost: this.decimal(Number(batch.unitCost ?? 0)),
          totalCost: this.decimal(remaining * Number(batch.unitCost ?? 0)),
          previousStock: this.decimal(previous),
          newStock: this.decimal(next),
          reasonCode: status === 'EXPIRED' ? 'batch_expired' : 'batch_discarded',
          notes: this.clean(input.notes),
        },
      });

      return { batch: updatedBatch, item: updatedItem };
    });
  }

  async estimateUnitConversion(ctx: RequestContext, input: { stockItemId: string; quantity: number; fromUnit: string; toUnit: string }) {
    const stockItemId = String(input.stockItemId ?? '').trim();
    const fromUnit = String(input.fromUnit ?? '').trim().toLowerCase();
    const toUnit = String(input.toUnit ?? '').trim().toLowerCase();
    const quantity = Number(input.quantity ?? 0);
    if (!stockItemId || !fromUnit || !toUnit) throw new BadRequestException('stockItemId, fromUnit e toUnit obrigatorios.');
    if (!Number.isFinite(quantity) || quantity <= 0) throw new BadRequestException('quantity deve ser maior que zero.');

    const item = await this.prisma.stockItem.findUnique({ where: { id: stockItemId } });
    if (!item || item.companyId !== ctx.companyId) throw new NotFoundException('Item de estoque nao encontrado.');
    const purchaseUnit = String(item.purchaseUnit ?? '').trim().toLowerCase();
    const stockUnit = String(item.stockUnit ?? '').trim().toLowerCase();
    const productionUnit = String(item.productionUnit ?? '').trim().toLowerCase();
    const conversionFactor = Number(item.conversionFactor ?? 1);

    const toStock = (qty: number, unit: string): number => {
      if (unit === stockUnit) return qty;
      if (purchaseUnit && unit === purchaseUnit) return qty * conversionFactor;
      if (productionUnit && unit === productionUnit) return qty;
      throw new BadRequestException('Unidade origem nao suportada para este item.');
    };

    const fromStock = (qty: number, unit: string): number => {
      if (unit === stockUnit) return qty;
      if (purchaseUnit && unit === purchaseUnit) return qty / conversionFactor;
      if (productionUnit && unit === productionUnit) return qty;
      throw new BadRequestException('Unidade destino nao suportada para este item.');
    };

    const stockQty = toStock(quantity, fromUnit);
    const converted = fromStock(stockQty, toUnit);

    return {
      stockItemId,
      fromUnit,
      toUnit,
      inputQuantity: quantity,
      convertedQuantity: Number(converted.toFixed(6)),
      conversionFactor,
    };
  }

  async listBreakageAlerts(ctx: RequestContext) {
    const [items, committedStock] = await Promise.all([
      this.prisma.stockItem.findMany({
        where: { companyId: ctx.companyId, isActive: true, controlsStock: true },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          stockUnit: true,
          currentQuantity: true,
          minimumQuantity: true,
          reorderPoint: true,
          isCritical: true,
        },
      }),
      this.readCommittedStock(ctx),
    ]);

    const stockAlerts = items
      .map((item) => {
        const current = Number(item.currentQuantity);
        const committed = committedStock.get(item.id)?.quantity ?? 0;
        const available = current - committed;
        const minimum = Number(item.minimumQuantity);
        const reorder = Number(item.reorderPoint);
        const threshold = reorder > 0 ? reorder : minimum;
        const level = available <= 0 ? 'critical' : available <= minimum ? 'high' : available <= threshold ? 'medium' : null;
        if (!level) return null;
        const type = current <= 0
          ? 'stockout'
          : available <= 0
            ? 'committed_stockout'
            : available <= minimum
              ? 'available_below_minimum'
              : 'available_below_reorder';
        return {
          stockItemId: item.id,
          name: item.name,
          stockUnit: item.stockUnit,
          currentQuantity: current,
          committedQuantity: this.decimal(committed),
          availableQuantity: this.decimal(available),
          minimumQuantity: minimum,
          reorderPoint: reorder,
          severity: item.isCritical || level === 'critical' ? 'critical' : level,
          type,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    const now = new Date();
    const expiringLimit = new Date(now);
    expiringLimit.setDate(expiringLimit.getDate() + 7);
    const batches = await this.prisma.stockBatch.findMany({
      where: {
        quantityRemaining: { gt: 0 },
        status: { in: ['AVAILABLE', 'OPENED'] },
        expirationDate: { lte: expiringLimit },
        stockItem: { companyId: ctx.companyId, isActive: true },
      },
      orderBy: [{ expirationDate: 'asc' }, { createdAt: 'desc' }],
      take: 50,
      select: {
        id: true,
        stockItemId: true,
        batchNumber: true,
        expirationDate: true,
        quantityRemaining: true,
        stockItem: {
          select: {
            name: true,
            stockUnit: true,
            minimumQuantity: true,
            reorderPoint: true,
            isCritical: true,
          },
        },
      },
    });

    const batchAlerts = batches
      .filter((batch: any) => batch.expirationDate)
      .map((batch: any) => {
        const expirationDate = new Date(batch.expirationDate);
        const expired = expirationDate.getTime() < now.getTime();
        return {
          stockItemId: batch.stockItemId,
          batchId: batch.id,
          batchNumber: batch.batchNumber ?? null,
          name: batch.stockItem?.name ?? batch.stockItemId,
          stockUnit: batch.stockItem?.stockUnit ?? null,
          currentQuantity: Number(batch.quantityRemaining ?? 0),
          minimumQuantity: Number(batch.stockItem?.minimumQuantity ?? 0),
          reorderPoint: Number(batch.stockItem?.reorderPoint ?? 0),
          severity: expired || batch.stockItem?.isCritical ? 'critical' : 'high',
          type: expired ? 'batch_expired' : 'batch_expiring',
          expirationDate: expirationDate.toISOString(),
        };
      });

    return [...stockAlerts, ...batchAlerts];
  }

  async listOperationalAlerts(ctx: RequestContext) {
    const [breakageAlerts, products] = await Promise.all([
      this.listBreakageAlerts(ctx),
      this.prisma.product.findMany({
        where: { companyId: ctx.companyId, deletedAt: null, isActive: true },
        select: {
          id: true,
          name: true,
          salePrice: true,
          costPrice: true,
          controlsStock: true,
          recipeId: true,
          recipe: {
            select: {
              yieldQuantity: true,
              lossPercent: true,
              items: {
                select: {
                  stockItemId: true,
                  quantity: true,
                  affectsCost: true,
                  stockItem: {
                    select: {
                      id: true,
                      name: true,
                      averageCost: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    const createdAt = new Date().toISOString();
    const alerts: Array<{
      id: string;
      type: string;
      severity: 'info' | 'warning' | 'critical';
      message: string;
      relatedEntityId: string;
      metadata?: Record<string, unknown>;
      createdAt: string;
      read: boolean;
    }> = [];

    for (const alert of breakageAlerts) {
      const batchId = 'batchId' in alert ? alert.batchId : null;
      alerts.push({
        id: `stock:${alert.stockItemId}:${batchId ?? alert.type}`,
        type: alert.type,
        severity: alert.severity === 'critical' ? 'critical' : 'warning',
        message: `${alert.name}: ${alert.type} (saldo ${alert.currentQuantity}, minimo ${alert.minimumQuantity}).`,
        relatedEntityId: alert.stockItemId,
        metadata: alert,
        createdAt,
        read: false,
      });
    }

    for (const product of products) {
      const salePrice = Number(product.salePrice ?? 0);
      if (salePrice <= 0) {
        alerts.push({
          id: `product_without_price:${product.id}`,
          type: 'product_without_price',
          severity: 'critical',
          message: `${product.name}: produto sem preco de venda.`,
          relatedEntityId: product.id,
          createdAt,
          read: false,
        });
      }

      if (product.controlsStock && !product.recipeId) {
        alerts.push({
          id: `product_without_recipe:${product.id}`,
          type: 'product_without_recipe',
          severity: 'warning',
          message: `${product.name}: produto controla estoque, mas nao possui ficha tecnica vinculada.`,
          relatedEntityId: product.id,
          createdAt,
          read: false,
        });
        continue;
      }

      if (!product.recipe) continue;
      const recipeCost = this.calculateRecipeUnitCost(product.recipe);
      const missingCostItems = product.recipe.items
        .filter((item) => item.affectsCost !== false && Number(item.quantity ?? 0) > 0 && Number(item.stockItem?.averageCost ?? 0) <= 0)
        .map((item) => item.stockItem?.name ?? item.stockItemId);

      if (missingCostItems.length > 0) {
        alerts.push({
          id: `recipe_missing_cost:${product.id}`,
          type: 'ingredient_without_average_cost',
          severity: 'warning',
          message: `${product.name}: ficha tecnica possui insumo sem custo medio.`,
          relatedEntityId: product.id,
          metadata: { missingCostItems },
          createdAt,
          read: false,
        });
      }

      if (salePrice > 0 && recipeCost > 0) {
        const cmvPercent = (recipeCost / salePrice) * 100;
        if (recipeCost >= salePrice) {
          alerts.push({
            id: `price_below_cost:${product.id}`,
            type: 'price_below_cost',
            severity: 'critical',
            message: `${product.name}: custo tecnico maior ou igual ao preco de venda.`,
            relatedEntityId: product.id,
            metadata: { salePrice: this.money(salePrice), recipeCost: this.money(recipeCost), cmvPercent: this.money(cmvPercent) },
            createdAt,
            read: false,
          });
        } else if (cmvPercent > 35) {
          alerts.push({
            id: `cmv_above_target:${product.id}`,
            type: 'cmv_above_target',
            severity: 'warning',
            message: `${product.name}: CMV tecnico acima da meta de 35%.`,
            relatedEntityId: product.id,
            metadata: { salePrice: this.money(salePrice), recipeCost: this.money(recipeCost), cmvPercent: this.money(cmvPercent) },
            createdAt,
            read: false,
          });
        }
      }
    }

    const severityRank = { critical: 3, warning: 2, info: 1 } as const;
    return alerts.sort((a, b) => severityRank[b.severity] - severityRank[a.severity]).slice(0, 120);
  }

  async applyInventoryCount(ctx: RequestContext, input: { counts: InventoryCountInput[]; notes?: string }) {
    const counts = Array.isArray(input.counts) ? input.counts : [];
    if (counts.length === 0) {
      throw new BadRequestException('counts obrigatorio com ao menos um item.');
    }

    return this.prisma.$transaction(async (tx) => {
      const results: Array<{ stockItemId: string; previousStock: number; countedQuantity: number; delta: number; movementId: string | null }> = [];

      for (const row of counts) {
        const stockItemId = String(row.stockItemId ?? '').trim();
        if (!stockItemId) throw new BadRequestException('stockItemId obrigatorio em todos os counts.');

        const countedQuantity = Number(row.countedQuantity ?? 0);
        if (!Number.isFinite(countedQuantity) || countedQuantity < 0) {
          throw new BadRequestException('countedQuantity invalido em inventario.');
        }

        const item = await tx.stockItem.findUnique({ where: { id: stockItemId } });
        if (!item || item.companyId !== ctx.companyId) {
          throw new NotFoundException('Item de estoque nao encontrado para inventario.');
        }

        const previous = Number(item.currentQuantity);
        const delta = countedQuantity - previous;

        if (delta === 0) {
          results.push({ stockItemId, previousStock: previous, countedQuantity, delta, movementId: null });
          continue;
        }

        const updated = await tx.stockItem.update({
          where: { id: stockItemId },
          data: { currentQuantity: this.decimal(countedQuantity) },
        });

        if (ctx.branchId) {
          await tx.stockLocationBalance.upsert({
            where: { branchId_stockItemId: { branchId: ctx.branchId, stockItemId } },
            update: { currentQuantity: this.decimal(countedQuantity), companyId: ctx.companyId },
            create: {
              branchId: ctx.branchId,
              stockItemId,
              companyId: ctx.companyId,
              currentQuantity: this.decimal(countedQuantity),
            },
          });
        }

        const movement = await tx.stockMovement.create({
          data: {
            stockItemId,
            branchId: ctx.branchId,
            movementType: 'ADJUSTMENT',
            movementTypeDetailed: 'inventory_count_adjustment',
            sourceModule: 'admin_inventory',
            sourceId: ctx.requestId,
            actorId: ctx.userId,
            requestId: ctx.requestId,
            quantity: this.decimal(Math.abs(delta)),
            unitCost: this.decimal(Number(updated.averageCost ?? 0)),
            totalCost: this.decimal(Math.abs(delta) * Number(updated.averageCost ?? 0)),
            previousStock: this.decimal(previous),
            newStock: this.decimal(countedQuantity),
            reasonCode: this.clean(row.reasonCode) ?? 'inventory_count',
            notes: this.clean(row.notes) ?? this.clean(input.notes),
          },
        });

        results.push({ stockItemId, previousStock: previous, countedQuantity, delta, movementId: movement.id });
      }

      return {
        appliedAt: new Date().toISOString(),
        totalItems: results.length,
        changedItems: results.filter((item) => item.delta !== 0).length,
        results,
      };
    });
  }

  async applyBatchInventoryCount(ctx: RequestContext, input: BatchInventoryCountInput) {
    const stockItemId = String(input.stockItemId ?? '').trim();
    const batchId = String(input.batchId ?? '').trim();
    if (!stockItemId || !batchId) throw new BadRequestException('stockItemId e batchId obrigatorios.');

    const countedQuantity = Number(input.countedQuantity ?? 0);
    if (!Number.isFinite(countedQuantity) || countedQuantity < 0) {
      throw new BadRequestException('countedQuantity invalido em inventario de lote.');
    }

    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.stockBatch.findUnique({
        where: { id: batchId },
        include: { stockItem: true },
      });
      if (!batch || batch.stockItemId !== stockItemId || batch.stockItem?.companyId !== ctx.companyId) {
        throw new NotFoundException('Lote de estoque nao encontrado para inventario.');
      }
      if (ctx.branchId && batch.branchId && batch.branchId !== ctx.branchId) {
        throw new NotFoundException('Lote de estoque nao encontrado para a filial atual.');
      }
      if (['DISCARDED', 'EXPIRED'].includes(String(batch.status)) && countedQuantity > 0) {
        throw new BadRequestException('Lote descartado ou expirado nao pode receber saldo por inventario.');
      }

      const previousBatchQuantity = Number(batch.quantityRemaining ?? 0);
      const delta = countedQuantity - previousBatchQuantity;
      if (delta === 0) {
        return {
          stockItemId,
          batchId,
          previousBatchQuantity,
          countedQuantity,
          delta,
          movementId: null,
        };
      }

      const previousStock = Number(batch.stockItem.currentQuantity ?? 0);
      const nextStock = previousStock + delta;
      if (nextStock < 0 && !batch.stockItem.allowNegativeStock) {
        throw new BadRequestException('Inventario do lote deixaria o item com saldo negativo.');
      }

      const nextStatus = countedQuantity <= 0
        ? 'EXHAUSTED'
        : String(batch.status) === 'EXHAUSTED'
          ? 'OPENED'
          : batch.status;

      const updatedBatch = await tx.stockBatch.update({
        where: { id: batchId },
        data: {
          quantityRemaining: this.decimal(countedQuantity),
          status: nextStatus,
          sanitaryNotes: this.clean(input.notes) ?? batch.sanitaryNotes,
        },
      });

      const updatedItem = await tx.stockItem.update({
        where: { id: stockItemId },
        data: { currentQuantity: this.decimal(nextStock) },
      });

      const branchId = batch.branchId ?? ctx.branchId;
      if (branchId) {
        await tx.stockLocationBalance.upsert({
          where: { branchId_stockItemId: { branchId, stockItemId } },
          update: { currentQuantity: this.decimal(nextStock), companyId: ctx.companyId },
          create: { branchId, stockItemId, companyId: ctx.companyId, currentQuantity: this.decimal(nextStock) },
        });
      }

      const movement = await tx.stockMovement.create({
        data: {
          stockItemId,
          branchId,
          batchId,
          movementType: 'ADJUSTMENT',
          movementTypeDetailed: 'batch_inventory_count_adjustment',
          sourceModule: 'admin_inventory_batch',
          sourceId: ctx.requestId,
          actorId: ctx.userId,
          requestId: ctx.requestId,
          quantity: this.decimal(Math.abs(delta)),
          unitCost: this.decimal(Number(batch.unitCost ?? batch.stockItem.averageCost ?? 0)),
          totalCost: this.decimal(Math.abs(delta) * Number(batch.unitCost ?? batch.stockItem.averageCost ?? 0)),
          previousStock: this.decimal(previousStock),
          newStock: this.decimal(nextStock),
          reasonCode: this.clean(input.reasonCode) ?? 'batch_inventory_count',
          notes: this.clean(input.notes),
        },
      });

      return {
        stockItemId,
        batchId,
        previousBatchQuantity,
        countedQuantity,
        delta,
        movementId: movement.id,
        batch: updatedBatch,
        item: updatedItem,
      };
    });
  }

  async consumeByOrder(ctx: RequestContext, orderId: string) {
    const existing = await this.prisma.stockMovement.findFirst({
      where: {
        sourceModule: 'orders',
        sourceId: orderId,
        movementType: 'SALE_CONSUMPTION',
      },
      select: { id: true },
    });
    if (existing) {
      return { orderId, consumed: false, reason: 'already_consumed' as const };
    }

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, companyId: ctx.companyId },
      include: {
        items: {
          select: {
            id: true,
            quantity: true,
            productId: true,
            product: {
              select: {
                id: true,
                controlsStock: true,
                recipe: {
                  select: {
                    id: true,
                    yieldQuantity: true,
                    lossPercent: true,
                    items: {
                      where: { affectsStock: true },
                      select: { stockItemId: true, quantity: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!order) throw new NotFoundException('Pedido nao encontrado para consumo de estoque.');

    return this.prisma.$transaction(async (tx) => {
      let movementsCreated = 0;
      const costByOrderItem = new Map<string, number>();
      for (const item of order.items) {
        if (!item.product?.controlsStock || !item.product?.recipe?.items?.length) continue;
        const orderItemQty = Number(item.quantity);
        const recipeYieldQuantity = Number(item.product.recipe.yieldQuantity ?? 1);
        const recipeLossMultiplier = 1 + Number(item.product.recipe.lossPercent ?? 0) / 100;

        for (const recipeItem of item.product.recipe.items) {
          const baseRecipeQuantity = Number(recipeItem.quantity);
          const consumeQty = recipeYieldQuantity > 0
            ? (baseRecipeQuantity * recipeLossMultiplier * orderItemQty) / recipeYieldQuantity
            : baseRecipeQuantity * recipeLossMultiplier * orderItemQty;
          if (!Number.isFinite(consumeQty) || consumeQty <= 0) continue;

          const stock = await tx.stockItem.findUnique({ where: { id: recipeItem.stockItemId } });
          if (!stock || stock.companyId !== ctx.companyId) continue;

          const previous = Number(stock.currentQuantity);
          const next = previous - consumeQty;
          if (next < 0 && !stock.allowNegativeStock) {
            throw new BadRequestException(`Estoque insuficiente para baixa automatica do item ${stock.id}.`);
          }

          const updated = await tx.stockItem.update({
            where: { id: stock.id },
            data: { currentQuantity: this.decimal(next) },
          });
          const allocations = await this.allocateFefoBatches(tx, {
            ctx,
            item: stock,
            quantity: consumeQty,
            explicitBatchId: null,
            insufficientMessage: `Lotes insuficientes para baixa automatica do item ${stock.id}.`,
          });

          if (ctx.branchId) {
            await tx.stockLocationBalance.upsert({
              where: { branchId_stockItemId: { branchId: ctx.branchId, stockItemId: stock.id } },
              update: { currentQuantity: this.decimal(next), companyId: ctx.companyId },
              create: {
                branchId: ctx.branchId,
                stockItemId: stock.id,
                companyId: ctx.companyId,
                currentQuantity: this.decimal(next),
              },
            });
          }

          const movementBase: any = {
            stockItemId: stock.id,
            branchId: ctx.branchId,
            orderItemId: item.id,
            movementType: 'SALE_CONSUMPTION',
            movementTypeDetailed: 'sale_consumption_recipe',
            sourceModule: 'orders',
            sourceId: order.id,
            actorId: ctx.userId,
            requestId: ctx.requestId,
            quantity: this.decimal(consumeQty),
            unitCost: this.decimal(Number(updated.averageCost ?? 0)),
            totalCost: this.decimal(consumeQty * Number(updated.averageCost ?? 0)),
            previousStock: this.decimal(previous),
            newStock: this.decimal(next),
            reasonCode: 'order_sale_consumption',
          };
          if (allocations.length > 0) {
            for (const allocation of allocations) {
              const allocationTotalCost = allocation.quantity * allocation.unitCost;
              await tx.stockMovement.create({
                data: {
                  ...movementBase,
                  batchId: allocation.batchId,
                  quantity: this.decimal(allocation.quantity),
                  unitCost: this.decimal(allocation.unitCost),
                  totalCost: this.decimal(allocationTotalCost),
                },
              });
              costByOrderItem.set(item.id, (costByOrderItem.get(item.id) ?? 0) + allocationTotalCost);
              movementsCreated += 1;
            }
          } else {
            await tx.stockMovement.create({ data: movementBase });
            costByOrderItem.set(item.id, (costByOrderItem.get(item.id) ?? 0) + consumeQty * Number(updated.averageCost ?? 0));
            movementsCreated += 1;
          }
        }
      }

      const orderItemDelegate = (tx as any).orderItem;
      if (orderItemDelegate?.update) {
        for (const item of order.items) {
          const totalCost = costByOrderItem.get(item.id) ?? 0;
          const quantity = Number(item.quantity ?? 0);
          if (totalCost <= 0 || quantity <= 0) continue;
          await orderItemDelegate.update({
            where: { id: item.id },
            data: { costSnapshot: this.money(totalCost / quantity) },
          });
        }
      }

      return { orderId, consumed: true, movementsCreated };
    });
  }

  async releaseOrderConsumption(ctx: RequestContext, orderId: string, input: { reasonCode?: string; notes?: string } = {}) {
    const existingReturn = await this.prisma.stockMovement.findFirst({
      where: {
        sourceModule: 'orders',
        sourceId: orderId,
        movementType: 'RETURN',
        movementTypeDetailed: 'sale_consumption_cancel_return',
      },
      select: { id: true },
    });
    if (existingReturn) {
      return { orderId, released: false, reason: 'already_released' as const };
    }

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, companyId: ctx.companyId },
      select: { id: true },
    });
    if (!order) throw new NotFoundException('Pedido nao encontrado para recomposicao de estoque.');

    const consumptionMovements = await this.prisma.stockMovement.findMany({
      where: {
        sourceModule: 'orders',
        sourceId: orderId,
        movementType: 'SALE_CONSUMPTION',
        stockItem: { companyId: ctx.companyId },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        stockItemId: true,
        branchId: true,
        batchId: true,
        orderItemId: true,
        quantity: true,
        unitCost: true,
      },
    });

    if (consumptionMovements.length === 0) {
      return { orderId, released: false, reason: 'no_consumption' as const };
    }

    return this.prisma.$transaction(async (tx) => {
      let movementsCreated = 0;
      let quantityReleased = 0;
      let totalCostReleased = 0;
      const reasonCode = this.clean(input.reasonCode) ?? 'order_canceled';
      const notes = this.clean(input.notes) ?? 'Recomposicao automatica por cancelamento de pedido.';

      for (const movement of consumptionMovements) {
        const quantity = Number(movement.quantity ?? 0);
        if (!Number.isFinite(quantity) || quantity <= 0) continue;

        const stock = await tx.stockItem.findUnique({ where: { id: movement.stockItemId } });
        if (!stock || stock.companyId !== ctx.companyId) continue;

        const previous = Number(stock.currentQuantity ?? 0);
        const next = previous + quantity;
        await tx.stockItem.update({
          where: { id: movement.stockItemId },
          data: { currentQuantity: this.decimal(next) },
        });

        if (movement.batchId) {
          const batch = await tx.stockBatch.findUnique({ where: { id: movement.batchId } });
          if (batch?.stockItemId === movement.stockItemId) {
            const batchPrevious = Number(batch.quantityRemaining ?? 0);
            const batchNext = batchPrevious + quantity;
            const batchStatus = String(batch.status ?? '');
            const nextStatus = batchStatus === 'EXHAUSTED' ? 'OPENED' : batch.status;
            await tx.stockBatch.update({
              where: { id: movement.batchId },
              data: {
                quantityRemaining: this.decimal(batchNext),
                status: nextStatus,
              },
            });
          }
        }

        const branchId = movement.branchId ?? ctx.branchId;
        if (branchId) {
          await tx.stockLocationBalance.upsert({
            where: { branchId_stockItemId: { branchId, stockItemId: movement.stockItemId } },
            update: { currentQuantity: this.decimal(next), companyId: ctx.companyId },
            create: {
              branchId,
              stockItemId: movement.stockItemId,
              companyId: ctx.companyId,
              currentQuantity: this.decimal(next),
            },
          });
        }

        const unitCost = Number(movement.unitCost ?? stock.averageCost ?? 0);
        const totalCost = quantity * unitCost;
        await tx.stockMovement.create({
          data: {
            stockItemId: movement.stockItemId,
            branchId,
            batchId: movement.batchId,
            orderItemId: movement.orderItemId,
            movementType: 'RETURN',
            movementTypeDetailed: 'sale_consumption_cancel_return',
            sourceModule: 'orders',
            sourceId: order.id,
            referenceType: 'SALE_CONSUMPTION',
            referenceId: movement.id,
            actorId: ctx.userId,
            requestId: ctx.requestId,
            quantity: this.decimal(quantity),
            unitCost: this.decimal(unitCost),
            totalCost: this.decimal(totalCost),
            previousStock: this.decimal(previous),
            newStock: this.decimal(next),
            reasonCode,
            notes,
          },
        });

        movementsCreated += 1;
        quantityReleased += quantity;
        totalCostReleased += totalCost;
      }

      return {
        orderId,
        released: true,
        movementsCreated,
        quantityReleased: this.decimal(quantityReleased),
        totalCostReleased: this.money(totalCostReleased),
      };
    });
  }

  private async readCommittedStock(ctx: RequestContext): Promise<Map<string, CommittedStockInfo>> {
    const orderDelegate = (this.prisma as any).order;
    if (!orderDelegate?.findMany) return new Map();

    const orders = await orderDelegate.findMany({
      where: {
        companyId: ctx.companyId,
        ...(ctx.branchId ? { branchId: ctx.branchId } : {}),
        deletedAt: null,
        status: { in: [...COMMITTED_ORDER_STATUSES] as any[] },
      },
      select: {
        id: true,
        items: {
          select: {
            id: true,
            quantity: true,
            product: {
              select: {
                controlsStock: true,
                recipe: {
                  select: {
                    yieldQuantity: true,
                    lossPercent: true,
                    items: {
                      where: { affectsStock: true },
                      select: {
                        stockItemId: true,
                        quantity: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const orderIds = (orders ?? []).map((order: any) => order.id).filter(Boolean);
    if (orderIds.length === 0) return new Map();

    const consumptionMovements = await this.prisma.stockMovement.findMany({
      where: {
        sourceModule: 'orders',
        sourceId: { in: orderIds },
        movementType: 'SALE_CONSUMPTION',
      },
      select: { sourceId: true },
    });
    const consumedOrderIds = new Set(
      (consumptionMovements ?? [])
        .map((movement: any) => movement.sourceId)
        .filter(Boolean),
    );

    const committed = new Map<string, CommittedStockInfo>();
    for (const order of orders ?? []) {
      if (!order?.id || consumedOrderIds.has(order.id)) continue;

      for (const item of order.items ?? []) {
        const product = item.product;
        const recipe = product?.recipe;
        if (!product?.controlsStock || !recipe?.items?.length) continue;

        const orderItemQty = Number(item.quantity ?? 0);
        if (!Number.isFinite(orderItemQty) || orderItemQty <= 0) continue;

        const yieldQuantity = Number(recipe.yieldQuantity ?? 1);
        const lossMultiplier = 1 + Number(recipe.lossPercent ?? 0) / 100;

        for (const recipeItem of recipe.items) {
          const stockItemId = String(recipeItem.stockItemId ?? '').trim();
          const baseQuantity = Number(recipeItem.quantity ?? 0);
          if (!stockItemId || !Number.isFinite(baseQuantity) || baseQuantity <= 0) continue;

          const quantity = yieldQuantity > 0
            ? (baseQuantity * lossMultiplier * orderItemQty) / yieldQuantity
            : baseQuantity * lossMultiplier * orderItemQty;
          if (!Number.isFinite(quantity) || quantity <= 0) continue;

          const current = committed.get(stockItemId) ?? { quantity: 0, orderIds: new Set<string>() };
          current.quantity += quantity;
          current.orderIds.add(order.id);
          committed.set(stockItemId, current);
        }
      }
    }

    return committed;
  }

  private withAvailability<T extends Record<string, any>>(item: T, committedStock: Map<string, CommittedStockInfo>) {
    const info = committedStock.get(String(item.id));
    const committedQuantity = info?.quantity ?? 0;
    const currentQuantity = Number(item.currentQuantity ?? 0);
    return {
      ...item,
      committedQuantity: this.decimal(committedQuantity),
      availableQuantity: this.decimal(currentQuantity - committedQuantity),
      committedOrderCount: info?.orderIds.size ?? 0,
    };
  }

  private withProductAvailability(product: any, committedStock: Map<string, CommittedStockInfo>) {
    const salePrice = Number(product.salePrice ?? 0);
    const base = {
      productId: product.id,
      name: product.name,
      sku: product.sku ?? null,
      categoryId: product.categoryId ?? null,
      category: product.category ?? null,
      salePrice: this.money(salePrice),
      costPrice: this.money(Number(product.costPrice ?? 0)),
      controlsStock: Boolean(product.controlsStock),
      recipeId: product.recipeId ?? null,
    };

    if (!product.controlsStock) {
      return {
        ...base,
        availabilityStatus: 'not_controlled',
        availableToSell: null,
        technicalCost: this.money(Number(product.costPrice ?? 0)),
        grossMargin: salePrice > 0 ? this.money(salePrice - Number(product.costPrice ?? 0)) : null,
        ingredients: [],
        limitingIngredients: [],
      };
    }

    if (!product.recipeId || !product.recipe) {
      return {
        ...base,
        availabilityStatus: 'missing_recipe',
        availableToSell: 0,
        technicalCost: this.money(Number(product.costPrice ?? 0)),
        grossMargin: salePrice > 0 ? this.money(salePrice - Number(product.costPrice ?? 0)) : null,
        ingredients: [],
        limitingIngredients: [],
      };
    }

    const recipe = product.recipe;
    const yieldQuantity = Number(recipe.yieldQuantity ?? 1);
    const lossMultiplier = 1 + Number(recipe.lossPercent ?? 0) / 100;
    const ingredients: Array<Record<string, unknown>> = [];
    let availableToSell = Number.POSITIVE_INFINITY;
    let technicalCost = 0;

    for (const recipeItem of recipe.items ?? []) {
      const stock = recipeItem.stockItem;
      const stockItemId = String(recipeItem.stockItemId ?? stock?.id ?? '').trim();
      const recipeQuantity = Number(recipeItem.quantity ?? 0);
      if (!stockItemId || !Number.isFinite(recipeQuantity) || recipeQuantity <= 0) continue;

      const requiredPerUnit = yieldQuantity > 0
        ? (recipeQuantity * lossMultiplier) / yieldQuantity
        : recipeQuantity * lossMultiplier;
      if (!Number.isFinite(requiredPerUnit) || requiredPerUnit <= 0) continue;

      const currentQuantity = Number(stock?.currentQuantity ?? 0);
      const committed = committedStock.get(stockItemId)?.quantity ?? 0;
      const availableQuantity = currentQuantity - committed;
      const itemAvailableToSell = Math.floor(Math.max(availableQuantity, 0) / requiredPerUnit);
      const averageCost = Number(stock?.averageCost ?? 0);
      if (recipeItem.affectsCost !== false) {
        technicalCost += requiredPerUnit * averageCost;
      }
      availableToSell = Math.min(availableToSell, itemAvailableToSell);

      ingredients.push({
        stockItemId,
        name: stock?.name ?? stockItemId,
        code: stock?.code ?? null,
        stockType: stock?.stockType ?? null,
        stockUnit: stock?.stockUnit ?? null,
        recipeUnit: recipeItem.unit ?? null,
        requiredPerUnit: this.decimal(requiredPerUnit),
        currentQuantity: this.decimal(currentQuantity),
        committedQuantity: this.decimal(committed),
        availableQuantity: this.decimal(availableQuantity),
        availableToSell: itemAvailableToSell,
        averageCost: this.money(averageCost),
        costPerProductUnit: this.money(recipeItem.affectsCost === false ? 0 : requiredPerUnit * averageCost),
        minimumQuantity: Number(stock?.minimumQuantity ?? 0),
        reorderPoint: Number(stock?.reorderPoint ?? 0),
        controlsStock: stock?.controlsStock !== false,
        isActive: stock?.isActive !== false,
        optional: Boolean(recipeItem.optional),
      });
    }

    if (ingredients.length === 0) {
      return {
        ...base,
        recipe: {
          id: recipe.id,
          name: recipe.name,
          yieldQuantity: Number(recipe.yieldQuantity ?? 0),
          yieldUnit: recipe.yieldUnit ?? null,
          lossPercent: Number(recipe.lossPercent ?? 0),
          active: Boolean(recipe.active),
        },
        availabilityStatus: 'recipe_without_stock_items',
        availableToSell: 0,
        technicalCost: this.money(0),
        grossMargin: salePrice > 0 ? this.money(salePrice) : null,
        ingredients: [],
        limitingIngredients: [],
      };
    }

    const normalizedAvailableToSell = Number.isFinite(availableToSell)
      ? Math.max(0, availableToSell)
      : 0;
    const sortedIngredients = [...ingredients].sort((left, right) =>
      Number(left.availableToSell ?? 0) - Number(right.availableToSell ?? 0),
    );
    const limitingIngredients = sortedIngredients.slice(0, 3);
    const availabilityStatus = normalizedAvailableToSell <= 0
      ? 'out_of_stock'
      : normalizedAvailableToSell <= 5
        ? 'low_stock'
        : 'available';

    return {
      ...base,
      recipe: {
        id: recipe.id,
        name: recipe.name,
        yieldQuantity: Number(recipe.yieldQuantity ?? 0),
        yieldUnit: recipe.yieldUnit ?? null,
        lossPercent: Number(recipe.lossPercent ?? 0),
        active: Boolean(recipe.active),
      },
      availabilityStatus,
      availableToSell: normalizedAvailableToSell,
      technicalCost: this.money(technicalCost),
      grossMargin: salePrice > 0 ? this.money(salePrice - technicalCost) : null,
      grossMarginPercent: salePrice > 0 ? this.money(((salePrice - technicalCost) / salePrice) * 100) : null,
      ingredients,
      limitingIngredients,
    };
  }

  private async applyManualMovement(
    ctx: RequestContext,
    movementType: 'ENTRY' | 'EXIT',
    input: StockMovementInput,
    options?: { movementTypeDetailed?: string; sourceModule?: string; movementType?: 'ENTRY' | 'EXIT' | 'LOSS' },
  ) {
    const stockItemId = String(input.stockItemId ?? '').trim();
    if (!stockItemId) throw new BadRequestException('stockItemId obrigatorio.');

    const quantity = Number(input.quantity ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new BadRequestException('quantity deve ser maior que zero.');
    }

    const unitCost = Number(input.unitCost ?? 0);
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      throw new BadRequestException('unitCost invalido.');
    }

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.stockItem.findUnique({ where: { id: stockItemId } });
      if (!item || item.companyId !== ctx.companyId) {
        throw new NotFoundException('Item de estoque nao encontrado.');
      }

      const previous = Number(item.currentQuantity);
      const delta = movementType === 'ENTRY' ? quantity : -quantity;
      const next = previous + delta;
      const currentAverageCost = Number(item.averageCost ?? 0);
      const movementUnitCost = unitCost > 0 ? unitCost : currentAverageCost;
      const nextAverageCost = movementType === 'ENTRY' && unitCost > 0
        ? this.weightedAverageCost(previous, currentAverageCost, quantity, unitCost)
        : currentAverageCost;

      if (next < 0 && !item.allowNegativeStock) {
        throw new BadRequestException('Estoque insuficiente para saida manual.');
      }

      const updated = await tx.stockItem.update({
        where: { id: stockItemId },
        data: {
          currentQuantity: this.decimal(next),
          ...(movementType === 'ENTRY' && unitCost > 0 ? { averageCost: this.decimal(nextAverageCost), lastCost: this.decimal(unitCost) } : {}),
        },
      });
      const allocations = movementType === 'EXIT'
        ? await this.allocateFefoBatches(tx, {
            ctx,
            item,
            quantity,
            explicitBatchId: this.clean(input.batchId),
            insufficientMessage: options?.movementType === 'LOSS'
              ? 'Lotes insuficientes para registrar perda/quebra.'
              : 'Lotes insuficientes para saida FEFO.',
          })
        : [];

      if (ctx.branchId) {
        await tx.stockLocationBalance.upsert({
          where: { branchId_stockItemId: { branchId: ctx.branchId, stockItemId } },
          update: { currentQuantity: this.decimal(next), companyId: ctx.companyId },
          create: {
            branchId: ctx.branchId,
            stockItemId,
            companyId: ctx.companyId,
            currentQuantity: this.decimal(next),
          },
        });
      }

      const movementBase: any = {
        stockItemId,
        branchId: ctx.branchId,
        movementType: options?.movementType ?? movementType,
        movementTypeDetailed: options?.movementTypeDetailed ?? (movementType === 'ENTRY' ? 'manual_entry' : 'manual_exit'),
        sourceModule: options?.sourceModule ?? 'admin_stock',
        sourceId: ctx.requestId,
        actorId: ctx.userId,
        requestId: ctx.requestId,
        quantity: this.decimal(quantity),
        unitCost: this.decimal(movementUnitCost),
        totalCost: this.decimal(quantity * movementUnitCost),
        previousStock: this.decimal(previous),
        newStock: this.decimal(next),
        reasonCode: this.clean(input.reasonCode),
        notes: this.clean(input.notes),
      };

      const movements = [];
      if (allocations.length > 0) {
        for (const allocation of allocations) {
          movements.push(await tx.stockMovement.create({
          data: {
              ...movementBase,
              batchId: allocation.batchId,
              quantity: this.decimal(allocation.quantity),
              unitCost: this.decimal(unitCost > 0 ? unitCost : allocation.unitCost),
              totalCost: this.decimal(allocation.quantity * (unitCost > 0 ? unitCost : allocation.unitCost)),
            },
          }));
        }
      } else {
        movements.push(await tx.stockMovement.create({ data: movementBase }));
      }

      return { item: updated, movement: movements[0], movements };
    });
  }

  private async allocateFefoBatches(
    tx: any,
    input: {
      ctx: RequestContext;
      item: any;
      quantity: number;
      explicitBatchId?: string | null;
      insufficientMessage: string;
    },
  ): Promise<Array<{ batchId: string; quantity: number; unitCost: number }>> {
    if (!input.item.controlsBatch && !input.item.requiresFefo) return [];

    const batches = await tx.stockBatch.findMany({
      where: {
        stockItemId: input.item.id,
        quantityRemaining: { gt: 0 },
        status: { in: ['AVAILABLE', 'OPENED'] },
        ...(input.explicitBatchId ? { id: input.explicitBatchId } : {}),
        ...(input.ctx.branchId ? { OR: [{ branchId: input.ctx.branchId }, { branchId: null }] } : {}),
      },
      select: {
        id: true,
        branchId: true,
        expirationDate: true,
        receivedDate: true,
        quantityRemaining: true,
        unitCost: true,
        createdAt: true,
      },
    });

    const orderedBatches = [...batches].sort((left, right) => {
      const leftExpiration = left.expirationDate ? new Date(left.expirationDate).getTime() : Number.POSITIVE_INFINITY;
      const rightExpiration = right.expirationDate ? new Date(right.expirationDate).getTime() : Number.POSITIVE_INFINITY;
      if (leftExpiration !== rightExpiration) return leftExpiration - rightExpiration;
      const leftReceived = left.receivedDate ? new Date(left.receivedDate).getTime() : Number.POSITIVE_INFINITY;
      const rightReceived = right.receivedDate ? new Date(right.receivedDate).getTime() : Number.POSITIVE_INFINITY;
      if (leftReceived !== rightReceived) return leftReceived - rightReceived;
      return new Date(left.createdAt ?? 0).getTime() - new Date(right.createdAt ?? 0).getTime();
    });

    let remaining = input.quantity;
    const allocations: Array<{ batchId: string; quantity: number; unitCost: number }> = [];
    for (const batch of orderedBatches) {
      if (remaining <= 0) break;
      const available = Number(batch.quantityRemaining ?? 0);
      if (!Number.isFinite(available) || available <= 0) continue;
      const consumed = Math.min(available, remaining);
      const nextQuantity = available - consumed;
      await tx.stockBatch.update({
        where: { id: batch.id },
        data: {
          quantityRemaining: this.decimal(nextQuantity),
          status: nextQuantity <= 0.0001 ? 'EXHAUSTED' : 'OPENED',
        },
      });
      allocations.push({ batchId: batch.id, quantity: consumed, unitCost: Number(batch.unitCost ?? 0) });
      remaining = Number((remaining - consumed).toFixed(6));
    }

    if (remaining > 0.0001 && !input.item.allowNegativeStock) {
      throw new BadRequestException(input.insufficientMessage);
    }

    return allocations;
  }

  private normalizeStockType(value: unknown): StockItemTypeValue | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const normalized = String(value).trim().toUpperCase();
    if ((STOCK_ITEM_TYPES as readonly string[]).includes(normalized)) {
      return normalized as StockItemTypeValue;
    }
    throw new BadRequestException('stockType invalido. Use PRODUCT, RAW_MATERIAL ou ADDON.');
  }

  private async resolveCategoryId(ctx: RequestContext, categoryId: string | null | undefined): Promise<string | null | undefined> {
    if (categoryId === undefined) return undefined;
    const normalized = this.clean(categoryId);
    if (normalized === null) return null;
    const category = await this.prisma.stockCategory.findUnique({ where: { id: normalized } });
    if (!category || category.companyId !== ctx.companyId || !category.isActive) {
      throw new BadRequestException('Categoria de estoque invalida para a empresa atual.');
    }
    return category.id;
  }

  private clean(value: unknown): string | null {
    const normalized = String(value ?? '').trim();
    return normalized.length > 0 ? normalized : null;
  }

  private daysFromNow(days: number) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  }

  private weightedAverageCost(previousQuantity: number, previousAverageCost: number, entryQuantity: number, entryUnitCost: number) {
    const previousQty = Number(previousQuantity ?? 0);
    const previousCost = Number(previousAverageCost ?? 0);
    const quantity = Number(entryQuantity ?? 0);
    const unitCost = Number(entryUnitCost ?? 0);
    const nextQuantity = previousQty + quantity;
    if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) return this.decimal(unitCost);
    if (!Number.isFinite(unitCost) || unitCost <= 0) return this.decimal(previousCost);
    return this.decimal(((previousQty * previousCost) + (quantity * unitCost)) / nextQuantity);
  }

  private calculateRecipeUnitCost(recipe: any) {
    const grossCost = (recipe?.items ?? []).reduce((sum: number, item: any) => {
      if (item.affectsCost === false) return sum;
      return sum + Number(item.quantity ?? 0) * Number(item.stockItem?.averageCost ?? 0);
    }, 0);
    const lossMultiplier = 1 + Number(recipe?.lossPercent ?? 0) / 100;
    const totalCost = grossCost * lossMultiplier;
    const yieldQuantity = Number(recipe?.yieldQuantity ?? 1);
    return yieldQuantity > 0 ? totalCost / yieldQuantity : totalCost;
  }

  private decimal(value: number) {
    return Number(value.toFixed(4));
  }

  private money(value: number) {
    return Number(value.toFixed(2));
  }

  private assertNonNegative(value: unknown, message: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new BadRequestException(message);
    }
  }

  private parseNonNegativeInteger(value: unknown, message: string) {
    const parsed = Number(value ?? 0);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new BadRequestException(message);
    }
    return parsed;
  }
}
