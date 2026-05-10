import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { RequestContext } from '../common/request-context';

export type StockItemInput = {
  name: string;
  code?: string;
  purchaseUnit?: string;
  stockUnit?: string;
  minimumQuantity?: number;
  reorderPoint?: number;
  averageCost?: number;
  controlsBatch?: boolean;
  controlsExpiry?: boolean;
  isPerishable?: boolean;
  allowNegativeStock?: boolean;
};

export type StockMovementInput = {
  stockItemId: string;
  quantity: number;
  unitCost?: number;
  reasonCode?: string;
  notes?: string;
};

export type InventoryCountInput = {
  stockItemId: string;
  countedQuantity: number;
  reasonCode?: string;
  notes?: string;
};

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  async listItems(ctx: RequestContext) {
    return this.prisma.stockItem.findMany({
      where: { companyId: ctx.companyId, isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        code: true,
        purchaseUnit: true,
        stockUnit: true,
        currentQuantity: true,
        minimumQuantity: true,
        reorderPoint: true,
        averageCost: true,
        controlsBatch: true,
        controlsExpiry: true,
        isPerishable: true,
        allowNegativeStock: true,
        updatedAt: true,
      },
    });
  }

  async createItem(ctx: RequestContext, input: StockItemInput) {
    const name = String(input.name ?? '').trim();
    if (!name) throw new BadRequestException('name obrigatorio.');

    return this.prisma.stockItem.create({
      data: {
        companyId: ctx.companyId,
        name,
        code: this.clean(input.code),
        purchaseUnit: this.clean(input.purchaseUnit),
        stockUnit: this.clean(input.stockUnit) ?? 'un',
        minimumQuantity: this.decimal(input.minimumQuantity ?? 0),
        reorderPoint: this.decimal(input.reorderPoint ?? 0),
        averageCost: this.decimal(input.averageCost ?? 0),
        controlsBatch: Boolean(input.controlsBatch),
        controlsExpiry: Boolean(input.controlsExpiry),
        isPerishable: Boolean(input.isPerishable),
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
    if (input.code !== undefined) payload.code = this.clean(input.code);
    if (input.purchaseUnit !== undefined) payload.purchaseUnit = this.clean(input.purchaseUnit);
    if (input.stockUnit !== undefined) payload.stockUnit = this.clean(input.stockUnit);
    if (input.minimumQuantity !== undefined) payload.minimumQuantity = this.decimal(input.minimumQuantity);
    if (input.reorderPoint !== undefined) payload.reorderPoint = this.decimal(input.reorderPoint);
    if (input.averageCost !== undefined) payload.averageCost = this.decimal(input.averageCost);
    if (input.controlsBatch !== undefined) payload.controlsBatch = Boolean(input.controlsBatch);
    if (input.controlsExpiry !== undefined) payload.controlsExpiry = Boolean(input.controlsExpiry);
    if (input.isPerishable !== undefined) payload.isPerishable = Boolean(input.isPerishable);
    if (input.allowNegativeStock !== undefined) payload.allowNegativeStock = Boolean(input.allowNegativeStock);

    if (Object.keys(payload).length === 0) {
      throw new BadRequestException('Payload vazio para atualizacao.');
    }

    return this.prisma.stockItem.update({ where: { id }, data: payload });
  }

  async listMovements(ctx: RequestContext, stockItemId?: string) {
    return this.prisma.stockMovement.findMany({
      where: {
        stockItem: { companyId: ctx.companyId },
        ...(stockItemId ? { stockItemId } : {}),
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
      for (const item of order.items) {
        if (!item.product?.controlsStock || !item.product?.recipe?.items?.length) continue;
        const orderItemQty = Number(item.quantity);

        for (const recipeItem of item.product.recipe.items) {
          const consumeQty = Number(recipeItem.quantity) * orderItemQty;
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

          await tx.stockMovement.create({
            data: {
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
            },
          });
          movementsCreated += 1;
        }
      }

      return { orderId, consumed: true, movementsCreated };
    });
  }

  private async applyManualMovement(
    ctx: RequestContext,
    movementType: 'ENTRY' | 'EXIT',
    input: StockMovementInput,
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

      if (next < 0 && !item.allowNegativeStock) {
        throw new BadRequestException('Estoque insuficiente para saida manual.');
      }

      const updated = await tx.stockItem.update({
        where: { id: stockItemId },
        data: {
          currentQuantity: this.decimal(next),
          ...(unitCost > 0 ? { averageCost: this.decimal(unitCost), lastCost: this.decimal(unitCost) } : {}),
        },
      });

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

      const movement = await tx.stockMovement.create({
        data: {
          stockItemId,
          branchId: ctx.branchId,
          movementType,
          movementTypeDetailed: movementType === 'ENTRY' ? 'manual_entry' : 'manual_exit',
          sourceModule: 'admin_stock',
          sourceId: ctx.requestId,
          actorId: ctx.userId,
          requestId: ctx.requestId,
          quantity: this.decimal(quantity),
          unitCost: this.decimal(unitCost),
          totalCost: this.decimal(quantity * unitCost),
          previousStock: this.decimal(previous),
          newStock: this.decimal(next),
          reasonCode: this.clean(input.reasonCode),
          notes: this.clean(input.notes),
        },
      });

      return { item: updated, movement };
    });
  }

  private clean(value: unknown): string | null {
    const normalized = String(value ?? '').trim();
    return normalized.length > 0 ? normalized : null;
  }

  private decimal(value: number) {
    return Number(value.toFixed(4));
  }
}
