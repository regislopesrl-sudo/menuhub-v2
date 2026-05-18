import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AUDIT_ACTIONS } from '../common/audit-log';
import { AuditLogService } from '../common/audit-log.service';
import type { RequestContext } from '../common/request-context';
import { TENANT_PERMISSIONS } from '../common/rbac';
import {
  assertAnyPermission,
  buildAllowedBranchesWhere,
  buildBranchWhere,
  buildCompanyWhere,
  canReadInventoryCosts,
  requireBranchId,
} from '../common/query-scope';

export interface InventoryItemInput {
  name: string;
  sku?: string | null;
  categoryId?: string | null;
  unitOfMeasure: string;
  status?: string;
  averageCost?: number | null;
  minimumStock?: number | null;
  maximumStock?: number | null;
  metadata?: Record<string, unknown>;
}

export interface InventoryMovementInput {
  stockItemId: string;
  type: 'IN' | 'OUT' | 'ADJUSTMENT' | 'LOSS' | string;
  quantity: number;
  unitCost?: number | null;
  sourceType?: string | null;
  sourceId?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class InventoryBackendService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async listItems(ctx: RequestContext, filters: { status?: string; categoryId?: string } = {}) {
    assertAnyPermission(ctx, [TENANT_PERMISSIONS.INVENTORY_READ], 'Sem permissao para ler estoque.');
    const items = await this.prisma.inventoryItem.findMany({
      where: buildCompanyWhere(ctx, {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      }) as any,
      include: {
        category: true,
        stockBalances: {
          where: buildAllowedBranchesWhere(ctx) as any,
        },
      },
      orderBy: { name: 'asc' },
      take: 250,
    });

    if (canReadInventoryCosts(ctx)) {
      return items;
    }

    return items.map((item) => ({
      ...item,
      averageCost: null,
    }));
  }

  async createItem(ctx: RequestContext, input: InventoryItemInput) {
    assertAnyPermission(ctx, [TENANT_PERMISSIONS.INVENTORY_MANAGE], 'Sem permissao para criar item de estoque.');
    const name = String(input.name ?? '').trim();
    const unitOfMeasure = String(input.unitOfMeasure ?? '').trim().toUpperCase();
    if (!name) throw new BadRequestException('name obrigatorio.');
    if (!unitOfMeasure) throw new BadRequestException('unitOfMeasure obrigatorio.');

    if (input.categoryId) {
      const category = await this.prisma.inventoryItemCategory.findFirst({
        where: buildCompanyWhere(ctx, { id: input.categoryId }) as any,
        select: { id: true },
      });
      if (!category) throw new NotFoundException('Categoria de estoque nao encontrada.');
    }

    const item = await this.prisma.inventoryItem.create({
      data: {
        companyId: ctx.companyId,
        categoryId: input.categoryId ?? null,
        name,
        sku: input.sku ?? null,
        unitOfMeasure,
        status: input.status ?? 'ACTIVE',
        averageCost: input.averageCost ?? null,
        minimumStock: input.minimumStock ?? null,
        maximumStock: input.maximumStock ?? null,
        metadata: input.metadata as any,
      },
    });

    await this.auditLog.recordFromContext({
      action: AUDIT_ACTIONS.INVENTORY_ITEM_CREATE,
      outcome: 'success',
      ctx,
      target: { type: 'inventory_item', id: item.id, label: item.name },
      metadata: { itemId: item.id, sku: item.sku },
    });

    return item;
  }

  async registerMovement(ctx: RequestContext, input: InventoryMovementInput) {
    assertAnyPermission(
      ctx,
      [
        TENANT_PERMISSIONS.INVENTORY_ADJUST,
        TENANT_PERMISSIONS.INVENTORY_MANAGE,
        TENANT_PERMISSIONS.INVENTORY_LOSS,
      ],
      'Sem permissao para movimentar estoque.',
    );
    const branchId = requireBranchId(ctx);
    const quantity = Number(input.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new BadRequestException('quantity deve ser maior que zero.');
    }
    const stockItemId = String(input.stockItemId ?? '').trim();
    if (!stockItemId) throw new BadRequestException('stockItemId obrigatorio.');

    const result = await this.prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findFirst({
        where: buildCompanyWhere(ctx, { id: stockItemId }) as any,
        select: { id: true, name: true },
      });
      if (!item) throw new NotFoundException('Item de estoque nao encontrado.');

      const normalizedType = String(input.type ?? '').trim().toUpperCase() || 'ADJUSTMENT';
      const direction = ['OUT', 'LOSS', 'CONSUMPTION'].includes(normalizedType) ? -1 : 1;
      const quantityDelta = quantity * direction;
      const unitCost = input.unitCost == null ? null : Number(input.unitCost);
      const totalCost = unitCost == null ? null : Number((quantity * unitCost).toFixed(2));

      const movement = await tx.inventoryMovement.create({
        data: {
          companyId: ctx.companyId,
          branchId,
          stockItemId,
          type: normalizedType,
          quantity,
          unitCost,
          totalCost,
          sourceType: input.sourceType ?? 'MANUAL',
          sourceId: input.sourceId ?? null,
          notes: input.notes ?? null,
          metadata: input.metadata as any,
          createdByUserId: ctx.userId ?? null,
        },
      });

      await tx.inventoryStockBalance.upsert({
        where: {
          companyId_branchId_stockItemId: {
            companyId: ctx.companyId,
            branchId,
            stockItemId,
          },
        },
        update: {
          quantity: { increment: quantityDelta },
        },
        create: {
          companyId: ctx.companyId,
          branchId,
          stockItemId,
          quantity: quantityDelta,
          reservedQuantity: 0,
        },
      });

      return movement;
    });

    await this.auditLog.recordFromContext({
      action: AUDIT_ACTIONS.INVENTORY_MOVEMENT_CREATE,
      outcome: 'success',
      ctx,
      target: { type: 'inventory_item', id: stockItemId },
      metadata: {
        movementId: result.id,
        stockItemId,
        branchId,
        type: input.type,
        quantity,
      },
    });

    return result;
  }

  listMovements(ctx: RequestContext, filters: { stockItemId?: string } = {}) {
    assertAnyPermission(ctx, [TENANT_PERMISSIONS.INVENTORY_READ], 'Sem permissao para ler movimentacoes.');
    return this.prisma.inventoryMovement.findMany({
      where: buildAllowedBranchesWhere(ctx, {
        ...(filters.stockItemId ? { stockItemId: filters.stockItemId } : {}),
      }) as any,
      orderBy: { createdAt: 'desc' },
      take: 250,
    });
  }
}
