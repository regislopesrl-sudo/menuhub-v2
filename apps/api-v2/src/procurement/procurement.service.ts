import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { RequestContext } from '../common/request-context';

@Injectable()
export class ProcurementService {
  constructor(private readonly prisma: PrismaService) {}

  async listSuppliers(ctx: RequestContext) {
    return this.prisma.supplier.findMany({
      where: { companyId: ctx.companyId },
      orderBy: { name: 'asc' },
    });
  }

  async createSupplier(ctx: RequestContext, input: { name: string; document?: string; email?: string; phone?: string; notes?: string }) {
    const name = String(input.name ?? '').trim();
    if (!name) throw new BadRequestException('name obrigatorio.');
    return this.prisma.supplier.create({
      data: {
        companyId: ctx.companyId,
        name,
        document: this.clean(input.document),
        email: this.clean(input.email),
        phone: this.clean(input.phone),
        notes: this.clean(input.notes),
      },
    });
  }

  async updateSupplier(ctx: RequestContext, id: string, input: Record<string, unknown>) {
    const existing = await this.prisma.supplier.findUnique({ where: { id } });
    if (!existing || existing.companyId !== ctx.companyId) throw new NotFoundException('Fornecedor nao encontrado.');
    const payload: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = String(input.name ?? '').trim();
      if (!name) throw new BadRequestException('name obrigatorio.');
      payload.name = name;
    }
    if (input.document !== undefined) payload.document = this.clean(input.document);
    if (input.email !== undefined) payload.email = this.clean(input.email);
    if (input.phone !== undefined) payload.phone = this.clean(input.phone);
    if (input.notes !== undefined) payload.notes = this.clean(input.notes);
    if (input.active !== undefined) payload.active = Boolean(input.active);
    if (Object.keys(payload).length === 0) throw new BadRequestException('Payload vazio.');
    return this.prisma.supplier.update({ where: { id }, data: payload });
  }

  async listPurchaseOrders(ctx: RequestContext) {
    return this.prisma.purchaseOrder.findMany({
      where: { supplier: { companyId: ctx.companyId } },
      include: { supplier: true, items: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async createPurchaseOrder(
    ctx: RequestContext,
    input: {
      supplierId: string;
      notes?: string;
      expectedDeliveryDate?: string;
      items: Array<{ stockItemId: string; quantity: number; unitCost: number; unit?: string }>;
    },
  ) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: input.supplierId } });
    if (!supplier || supplier.companyId !== ctx.companyId) throw new NotFoundException('Fornecedor nao encontrado.');
    if (!ctx.branchId) throw new BadRequestException('branchId obrigatorio no contexto.');
    if (!Array.isArray(input.items) || input.items.length === 0) throw new BadRequestException('items obrigatorio.');

    const items = input.items.map((item) => {
      const quantity = Number(item.quantity ?? 0);
      const unitCost = Number(item.unitCost ?? 0);
      if (!item.stockItemId || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) {
        throw new BadRequestException('Item de compra invalido.');
      }
      return {
        stockItemId: item.stockItemId,
        quantity,
        unitCost,
        totalCost: Number((quantity * unitCost).toFixed(2)),
        unit: this.clean(item.unit) ?? 'UN',
      };
    });

    const totalAmount = Number(items.reduce((acc, row) => acc + row.totalCost, 0).toFixed(2));

    return this.prisma.purchaseOrder.create({
      data: {
        branchId: ctx.branchId,
        supplierId: supplier.id,
        status: 'DRAFT',
        createdById: ctx.userId,
        updatedById: ctx.userId,
        notes: this.clean(input.notes),
        expectedDeliveryDate: input.expectedDeliveryDate ? new Date(input.expectedDeliveryDate) : null,
        totalAmount,
        items: {
          create: items.map((row) => ({
            stockItemId: row.stockItemId,
            quantity: row.quantity,
            unitCost: row.unitCost,
            totalCost: row.totalCost,
            unit: row.unit,
          })),
        },
      },
      include: { items: true, supplier: true },
    });
  }

  async approvePurchaseOrder(ctx: RequestContext, id: string) {
    const po = await this.getPurchaseOrderInCompany(ctx, id);
    if (po.status !== 'DRAFT') throw new BadRequestException('Apenas pedidos em DRAFT podem ser aprovados.');
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: ctx.userId, updatedById: ctx.userId },
    });
  }

  async receivePurchaseOrder(
    ctx: RequestContext,
    purchaseOrderId: string,
    input: {
      invoiceNumber?: string;
      invoiceKey?: string;
      dueDate?: string;
      items: Array<{
        stockItemId: string;
        receivedQuantity: number;
        unitCost: number;
        orderedQuantity?: number;
        batchNumber?: string;
        expirationDate?: string;
      }>;
    },
  ) {
    const po = await this.getPurchaseOrderInCompany(ctx, purchaseOrderId);
    if (!ctx.branchId) throw new BadRequestException('branchId obrigatorio no contexto.');
    const branchId = ctx.branchId;
    if (!Array.isArray(input.items) || input.items.length === 0) throw new BadRequestException('items obrigatorio.');

    return this.prisma.$transaction(async (tx) => {
      const receipt = await tx.goodsReceipt.create({
        data: {
          purchaseOrderId,
          supplierId: po.supplierId,
          createdById: ctx.userId,
          processedById: ctx.userId,
          invoiceNumber: this.clean(input.invoiceNumber),
          invoiceKey: this.clean(input.invoiceKey),
          status: 'FINALIZED',
          receivedAt: new Date(),
        },
      });

      let totalReceived = 0;
      let hasDivergence = false;
      for (const row of input.items) {
        const receivedQuantity = Number(row.receivedQuantity ?? 0);
        const unitCost = Number(row.unitCost ?? 0);
        if (!row.stockItemId || !Number.isFinite(receivedQuantity) || receivedQuantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) {
          throw new BadRequestException('Item de recebimento invalido.');
        }
        const orderedQuantity = Number(row.orderedQuantity ?? receivedQuantity);
        const divergence = Math.abs(receivedQuantity - orderedQuantity) > 0.0001;
        if (divergence) hasDivergence = true;

        await tx.goodsReceiptItem.create({
          data: {
            goodsReceiptId: receipt.id,
            stockItemId: row.stockItemId,
            batchNumber: this.clean(row.batchNumber),
            expirationDate: row.expirationDate ? new Date(row.expirationDate) : null,
            orderedQuantity,
            receivedQuantity,
            unitCost,
            hasDivergence: divergence,
            divergenceNotes: divergence ? 'Diferenca entre pedido e recebimento.' : null,
          },
        });

        const item = await tx.stockItem.findUnique({ where: { id: row.stockItemId } });
        if (item && item.companyId === ctx.companyId) {
          const previous = Number(item.currentQuantity);
          const next = previous + receivedQuantity;
          await tx.stockItem.update({
            where: { id: row.stockItemId },
            data: { currentQuantity: next, averageCost: unitCost, lastCost: unitCost },
          });
          await tx.stockLocationBalance.upsert({
            where: { branchId_stockItemId: { branchId, stockItemId: row.stockItemId } },
            create: { branchId, stockItemId: row.stockItemId, companyId: ctx.companyId, currentQuantity: next },
            update: { currentQuantity: next, companyId: ctx.companyId },
          });
          await tx.stockMovement.create({
            data: {
              stockItemId: row.stockItemId,
              branchId,
              movementType: 'ENTRY',
              movementTypeDetailed: 'purchase_receipt_entry',
              sourceModule: 'procurement_receipt',
              sourceId: receipt.id,
              actorId: ctx.userId,
              requestId: ctx.requestId,
              quantity: receivedQuantity,
              unitCost,
              totalCost: Number((receivedQuantity * unitCost).toFixed(2)),
              previousStock: previous,
              newStock: next,
              reasonCode: 'purchase_receipt',
            },
          });
        }

        totalReceived += Number((receivedQuantity * unitCost).toFixed(2));
      }

      const settledDueDate = input.dueDate ? new Date(input.dueDate) : new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
      const payable = await tx.accountsPayable.create({
        data: {
          branchId: po.branchId,
          supplierId: po.supplierId,
          createdById: ctx.userId,
          description: `Compra ${po.id}${input.invoiceNumber ? ` NF ${input.invoiceNumber}` : ''}`,
          amount: Number(totalReceived.toFixed(2)),
          dueDate: settledDueDate,
          status: 'PENDING',
          originType: 'PURCHASE_ORDER',
          originId: po.id,
          purchaseOrderId: po.id,
          externalReference: this.clean(input.invoiceKey) ?? this.clean(input.invoiceNumber),
        },
      });

      await tx.purchaseOrder.update({
        where: { id: po.id },
        data: {
          status: hasDivergence ? 'PARTIALLY_RECEIVED' : 'RECEIVED',
          updatedById: ctx.userId,
        },
      });

      return { receiptId: receipt.id, payableId: payable.id, hasDivergence, totalReceived };
    });
  }

  async listReceipts(ctx: RequestContext) {
    return this.prisma.goodsReceipt.findMany({
      where: { supplier: { companyId: ctx.companyId } },
      include: { supplier: true, items: true, purchaseOrder: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async conferenceReceipt(ctx: RequestContext, receiptId: string) {
    const receipt = await this.prisma.goodsReceipt.findUnique({
      where: { id: receiptId },
      include: { supplier: true, items: true, purchaseOrder: { include: { items: true } } },
    });
    if (!receipt || receipt.supplier.companyId !== ctx.companyId) throw new NotFoundException('Recebimento nao encontrado.');

    const mapOrdered = new Map((receipt.purchaseOrder?.items ?? []).map((it) => [it.stockItemId, Number(it.quantity)]));
    const divergences = receipt.items
      .map((item) => {
        const ordered = Number(item.orderedQuantity ?? mapOrdered.get(item.stockItemId) ?? 0);
        const received = Number(item.receivedQuantity);
        return {
          stockItemId: item.stockItemId,
          orderedQuantity: ordered,
          receivedQuantity: received,
          hasDivergence: Math.abs(received - ordered) > 0.0001,
        };
      })
      .filter((it) => it.hasDivergence);

    return {
      receiptId,
      invoiceNumber: receipt.invoiceNumber,
      totalItems: receipt.items.length,
      divergenceCount: divergences.length,
      divergences,
      status: divergences.length > 0 ? 'DIVERGENT' : 'OK',
    };
  }

  async listQuotations(ctx: RequestContext, stockItemId: string) {
    if (!stockItemId) throw new BadRequestException('stockItemId obrigatorio.');
    const rows = await this.prisma.goodsReceiptItem.findMany({
      where: { stockItemId, goodsReceipt: { supplier: { companyId: ctx.companyId } } },
      include: { goodsReceipt: { include: { supplier: true } } },
      orderBy: { goodsReceipt: { createdAt: 'desc' } },
      take: 50,
    });

    return rows.map((row) => ({
      supplierId: row.goodsReceipt.supplierId,
      supplierName: row.goodsReceipt.supplier.name,
      unitCost: Number(row.unitCost),
      receivedAt: row.goodsReceipt.receivedAt ?? row.goodsReceipt.createdAt,
      invoiceNumber: row.goodsReceipt.invoiceNumber,
    }));
  }

  async listPurchaseHistory(ctx: RequestContext, stockItemId: string) {
    if (!stockItemId) throw new BadRequestException('stockItemId obrigatorio.');
    return this.prisma.purchaseOrderItem.findMany({
      where: { stockItemId, purchaseOrder: { supplier: { companyId: ctx.companyId } } },
      include: { purchaseOrder: { include: { supplier: true } } },
      orderBy: { purchaseOrder: { createdAt: 'desc' } },
      take: 100,
    });
  }

  async getAverageCost(ctx: RequestContext, stockItemId: string) {
    if (!stockItemId) throw new BadRequestException('stockItemId obrigatorio.');
    const stockItem = await this.prisma.stockItem.findUnique({ where: { id: stockItemId } });
    if (!stockItem || stockItem.companyId !== ctx.companyId) throw new NotFoundException('Item nao encontrado.');

    const history = await this.prisma.goodsReceiptItem.findMany({
      where: { stockItemId, goodsReceipt: { supplier: { companyId: ctx.companyId } } },
      select: { unitCost: true, receivedQuantity: true },
      take: 200,
    });
    const totalQty = history.reduce((acc, row) => acc + Number(row.receivedQuantity), 0);
    const totalCost = history.reduce((acc, row) => acc + Number(row.receivedQuantity) * Number(row.unitCost), 0);
    const weightedAverage = totalQty > 0 ? Number((totalCost / totalQty).toFixed(4)) : Number(stockItem.averageCost ?? 0);

    return {
      stockItemId,
      stockItemName: stockItem.name,
      currentAverageCost: Number(stockItem.averageCost ?? 0),
      weightedAverageCost: weightedAverage,
      samples: history.length,
    };
  }

  async listAccountsPayable(ctx: RequestContext) {
    if (!ctx.branchId) throw new BadRequestException('branchId obrigatorio no contexto.');
    return this.prisma.accountsPayable.findMany({
      where: { branchId: ctx.branchId, originType: { in: ['PURCHASE_ORDER', 'GOODS_RECEIPT'] } },
      include: { supplier: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  private async getPurchaseOrderInCompany(ctx: RequestContext, id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: { supplier: true, items: true },
    });
    if (!po || po.supplier.companyId !== ctx.companyId) throw new NotFoundException('Pedido de compra nao encontrado.');
    return po;
  }

  private clean(value: unknown) {
    const v = String(value ?? '').trim();
    return v.length > 0 ? v : null;
  }
}
