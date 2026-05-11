import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { RequestContext } from '../common/request-context';

export type StockItemInput = {
  name: string;
  code?: string;
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
        updatedAt: true,
      },
    });
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

    return this.prisma.stockItem.create({
      data: {
        companyId: ctx.companyId,
        name,
        code: this.clean(input.code),
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
    if (input.code !== undefined) payload.code = this.clean(input.code);
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
      await tx.stockItem.update({
        where: { id: stockItemId },
        data: {
          currentQuantity: this.decimal(next),
          averageCost: this.decimal(unitCost),
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
    const items = await this.prisma.stockItem.findMany({
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
    });

    const stockAlerts = items
      .map((item) => {
        const current = Number(item.currentQuantity);
        const minimum = Number(item.minimumQuantity);
        const reorder = Number(item.reorderPoint);
        const threshold = reorder > 0 ? reorder : minimum;
        const level = current <= 0 ? 'critical' : current <= minimum ? 'high' : current <= threshold ? 'medium' : null;
        if (!level) return null;
        return {
          stockItemId: item.id,
          name: item.name,
          stockUnit: item.stockUnit,
          currentQuantity: current,
          minimumQuantity: minimum,
          reorderPoint: reorder,
          severity: item.isCritical || level === 'critical' ? 'critical' : level,
          type: current <= 0 ? 'stockout' : current <= minimum ? 'below_minimum' : 'below_reorder',
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
              await tx.stockMovement.create({
                data: {
                  ...movementBase,
                  batchId: allocation.batchId,
                  quantity: this.decimal(allocation.quantity),
                  unitCost: this.decimal(allocation.unitCost),
                  totalCost: this.decimal(allocation.quantity * allocation.unitCost),
                },
              });
              movementsCreated += 1;
            }
          } else {
            await tx.stockMovement.create({ data: movementBase });
            movementsCreated += 1;
          }
        }
      }

      return { orderId, consumed: true, movementsCreated };
    });
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
        unitCost: this.decimal(unitCost),
        totalCost: this.decimal(quantity * unitCost),
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

  private clean(value: unknown): string | null {
    const normalized = String(value ?? '').trim();
    return normalized.length > 0 ? normalized : null;
  }

  private decimal(value: number) {
    return Number(value.toFixed(4));
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
