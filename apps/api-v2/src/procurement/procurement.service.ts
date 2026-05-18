import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { RequestContext } from '../common/request-context';
import { AUDIT_ACTIONS } from '../common/audit-log';
import { recordAuditFromContext } from '../common/audit-log-recorder';
import { decodeFiscalAccessKey } from './fiscal-access-key';
import {
  HttpFiscalDocumentLookupProvider,
  LocalMockFiscalDocumentLookupProvider,
  type FiscalDocumentLookupProvider,
} from './fiscal-document-lookup.provider';

@Injectable()
export class ProcurementService {
  private readonly fiscalLookupProvider: FiscalDocumentLookupProvider;
  private readonly fiscalLookupProviderMode: string;

  constructor(private readonly prisma: PrismaService) {
    this.fiscalLookupProviderMode = String(process.env.FISCAL_LOOKUP_PROVIDER ?? 'local-mock').trim().toLowerCase();
    this.fiscalLookupProvider = ['http', 'external-http', 'real-http'].includes(this.fiscalLookupProviderMode)
      ? new HttpFiscalDocumentLookupProvider({
          endpoint: process.env.FISCAL_LOOKUP_HTTP_URL,
          token: process.env.FISCAL_LOOKUP_HTTP_TOKEN,
          timeoutMs: Number(process.env.FISCAL_LOOKUP_TIMEOUT_MS ?? 20000),
        })
      : new LocalMockFiscalDocumentLookupProvider();
  }

  async listSuppliers(ctx: RequestContext) {
    return this.prisma.supplier.findMany({
      where: { companyId: ctx.companyId },
      orderBy: { name: 'asc' },
    });
  }

  async getDashboard(ctx: RequestContext) {
    if (!ctx.branchId) throw new BadRequestException('branchId obrigatorio no contexto.');
    const branchId = ctx.branchId;
    const now = new Date();
    const last30Days = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30);
    const pendingDocumentStatuses = ['PENDING_REVIEW', 'PARTIALLY_MAPPED', 'LOOKUP_FAILED'] as const;

    const [
      suppliersTotal,
      suppliersActive,
      purchaseOrdersOpen,
      purchaseOrdersReceived,
      purchaseOrdersCanceled,
      purchaseAmount,
      fiscalPending,
      fiscalReady,
      fiscalConfirmed,
      fiscalAmount,
      payablesPending,
      payablesOverdue,
      payablesAmount,
    ] = await Promise.all([
      this.prisma.supplier.count({ where: { companyId: ctx.companyId } }),
      this.prisma.supplier.count({ where: { companyId: ctx.companyId, active: true } }),
      this.prisma.purchaseOrder.count({
        where: { branchId, supplier: { companyId: ctx.companyId }, status: { in: ['DRAFT', 'APPROVED', 'SENT', 'PARTIALLY_RECEIVED'] } },
      }),
      this.prisma.purchaseOrder.count({
        where: { branchId, supplier: { companyId: ctx.companyId }, status: 'RECEIVED' },
      }),
      this.prisma.purchaseOrder.count({
        where: { branchId, supplier: { companyId: ctx.companyId }, status: 'CANCELED' },
      }),
      this.prisma.purchaseOrder.aggregate({
        where: { branchId, supplier: { companyId: ctx.companyId }, createdAt: { gte: last30Days }, status: { not: 'CANCELED' } },
        _sum: { totalAmount: true },
      }),
      this.prisma.purchaseDocument.count({ where: { companyId: ctx.companyId, branchId, status: { in: pendingDocumentStatuses as any } } }),
      this.prisma.purchaseDocument.count({ where: { companyId: ctx.companyId, branchId, status: 'READY_TO_CONFIRM' } }),
      this.prisma.purchaseDocument.count({ where: { companyId: ctx.companyId, branchId, status: 'CONFIRMED' } }),
      this.prisma.purchaseDocument.aggregate({
        where: { companyId: ctx.companyId, branchId, status: { not: 'CANCELED' } },
        _sum: { totalAmount: true },
      }),
      this.prisma.accountsPayable.count({ where: { branchId, originType: { in: ['PURCHASE_ORDER', 'GOODS_RECEIPT'] }, status: 'PENDING' } }),
      this.prisma.accountsPayable.count({
        where: { branchId, originType: { in: ['PURCHASE_ORDER', 'GOODS_RECEIPT'] }, status: 'PENDING', dueDate: { lt: now } },
      }),
      this.prisma.accountsPayable.aggregate({
        where: { branchId, originType: { in: ['PURCHASE_ORDER', 'GOODS_RECEIPT'] }, status: 'PENDING' },
        _sum: { amount: true },
      }),
    ]);

    return {
      suppliers: {
        total: suppliersTotal,
        active: suppliersActive,
        inactive: Math.max(0, suppliersTotal - suppliersActive),
      },
      purchaseOrders: {
        open: purchaseOrdersOpen,
        received: purchaseOrdersReceived,
        canceled: purchaseOrdersCanceled,
        totalLast30Days: Number(purchaseAmount._sum.totalAmount ?? 0),
      },
      fiscalDocuments: {
        pendingReview: fiscalPending,
        readyToConfirm: fiscalReady,
        confirmed: fiscalConfirmed,
        totalImported: Number(fiscalAmount._sum.totalAmount ?? 0),
      },
      accountsPayable: {
        pending: payablesPending,
        overdue: payablesOverdue,
        pendingAmount: Number(payablesAmount._sum.amount ?? 0),
      },
      generatedAt: now.toISOString(),
    };
  }

  getFiscalLookupStatus() {
    const realLookupEnabled = ['http', 'external-http', 'real-http'].includes(this.fiscalLookupProviderMode);
    return {
      providerName: realLookupEnabled ? 'external-http' : 'local-mock',
      mode: realLookupEnabled ? 'real-http' : 'local-mock',
      realLookupEnabled,
      configured: realLookupEnabled ? Boolean(process.env.FISCAL_LOOKUP_HTTP_URL) : true,
      requirements: realLookupEnabled
        ? []
        : [
            'Certificado digital A1/e-CNPJ ou credencial de provedor fiscal',
            'Endpoint seguro para consulta de XML/itens por chave',
            'FISCAL_LOOKUP_PROVIDER=http',
            'FISCAL_LOOKUP_HTTP_URL configurado no servidor',
          ],
    };
  }

  async getSupplier(ctx: RequestContext, id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, companyId: ctx.companyId },
      include: {
        _count: {
          select: { purchaseOrders: true, goodsReceipts: true, accountsPayable: true },
        },
      },
    });
    if (!supplier) throw new NotFoundException('Fornecedor nao encontrado.');
    return supplier;
  }

  async createSupplier(ctx: RequestContext, input: { name: string; document?: string; email?: string; phone?: string; notes?: string }) {
    const name = String(input.name ?? '').trim();
    if (!name) throw new BadRequestException('name obrigatorio.');
    const document = this.clean(input.document);
    await this.assertSupplierDocumentAvailable(ctx, document);
    const supplier = await this.prisma.supplier.create({
      data: {
        companyId: ctx.companyId,
        name,
        document,
        email: this.clean(input.email),
        phone: this.clean(input.phone),
        notes: this.clean(input.notes),
      },
    });
    recordAuditFromContext({
      action: AUDIT_ACTIONS.SUPPLIER_CREATE,
      outcome: 'success',
      ctx,
      target: { type: 'supplier', id: supplier.id, label: supplier.name },
      metadata: { supplierId: supplier.id, document: supplier.document },
    });
    return supplier;
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
    if (input.document !== undefined) {
      const document = this.clean(input.document);
      await this.assertSupplierDocumentAvailable(ctx, document, id);
      payload.document = document;
    }
    if (input.email !== undefined) payload.email = this.clean(input.email);
    if (input.phone !== undefined) payload.phone = this.clean(input.phone);
    if (input.notes !== undefined) payload.notes = this.clean(input.notes);
    if (input.active !== undefined) payload.active = Boolean(input.active);
    if (Object.keys(payload).length === 0) throw new BadRequestException('Payload vazio.');
    const updated = await this.prisma.supplier.update({ where: { id }, data: payload });
    recordAuditFromContext({
      action: AUDIT_ACTIONS.SUPPLIER_UPDATE,
      outcome: 'success',
      ctx,
      target: { type: 'supplier', id: updated.id, label: updated.name },
      metadata: { supplierId: updated.id, changedFields: Object.keys(payload), active: updated.active },
    });
    return updated;
  }

  updateSupplierStatus(ctx: RequestContext, id: string, input: { active: boolean }) {
    return this.updateSupplier(ctx, id, { active: Boolean(input.active) });
  }

  async listPurchaseOrders(ctx: RequestContext) {
    if (!ctx.branchId) throw new BadRequestException('branchId obrigatorio no contexto.');
    return this.prisma.purchaseOrder.findMany({
      where: { branchId: ctx.branchId, supplier: { companyId: ctx.companyId } },
      include: {
        supplier: true,
        items: {
          include: {
            stockItem: {
              select: { id: true, name: true, code: true, stockType: true, stockUnit: true, purchaseUnit: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  getPurchaseOrder(ctx: RequestContext, id: string) {
    return this.getPurchaseOrderInCompany(ctx, id);
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
    if (supplier.active === false) throw new BadRequestException('Fornecedor inativo nao pode receber novo pedido de compra.');
    if (!ctx.branchId) throw new BadRequestException('branchId obrigatorio no contexto.');
    if (!Array.isArray(input.items) || input.items.length === 0) throw new BadRequestException('items obrigatorio.');

    const items = [];
    for (const item of input.items) {
      const quantity = Number(item.quantity ?? 0);
      const unitCost = Number(item.unitCost ?? 0);
      if (!item.stockItemId || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) {
        throw new BadRequestException('Item de compra invalido.');
      }
      const stockItem = await this.assertPurchasableStockItem(ctx, item.stockItemId);
      items.push({
        stockItemId: stockItem.id,
        quantity,
        unitCost,
        totalCost: Number((quantity * unitCost).toFixed(2)),
        unit: this.clean(item.unit) ?? stockItem.purchaseUnit ?? stockItem.stockUnit ?? 'UN',
      });
    }

    const totalAmount = Number(items.reduce((acc, row) => acc + row.totalCost, 0).toFixed(2));

    const created = await this.prisma.purchaseOrder.create({
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
    recordAuditFromContext({
      action: AUDIT_ACTIONS.PURCHASE_ORDER_CREATE,
      outcome: 'success',
      ctx,
      target: { type: 'purchase_order', id: created.id, label: created.supplier?.name },
      metadata: { supplierId: supplier.id, totalAmount, itemsCount: items.length },
    });
    return created;
  }

  async approvePurchaseOrder(ctx: RequestContext, id: string) {
    const po = await this.getPurchaseOrderInCompany(ctx, id);
    if (po.status !== 'DRAFT') throw new BadRequestException('Apenas pedidos em DRAFT podem ser aprovados.');
    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: ctx.userId, updatedById: ctx.userId },
    });
    recordAuditFromContext({
      action: AUDIT_ACTIONS.PURCHASE_ORDER_APPROVE,
      outcome: 'success',
      ctx,
      target: { type: 'purchase_order', id: updated.id },
      metadata: { supplierId: po.supplierId },
    });
    return updated;
  }

  async cancelPurchaseOrder(ctx: RequestContext, id: string) {
    const po = await this.getPurchaseOrderInCompany(ctx, id);
    if (['RECEIVED', 'PARTIALLY_RECEIVED'].includes(String(po.status))) {
      throw new BadRequestException('Pedido ja recebido nao pode ser cancelado.');
    }
    if (po.status === 'CANCELED') return po;
    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'CANCELED', updatedById: ctx.userId },
    });
    recordAuditFromContext({
      action: AUDIT_ACTIONS.PURCHASE_ORDER_CANCEL,
      outcome: 'success',
      ctx,
      target: { type: 'purchase_order', id: updated.id },
      metadata: { supplierId: po.supplierId, previousStatus: po.status },
    });
    return updated;
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
    if (po.branchId !== branchId) throw new NotFoundException('Pedido de compra nao encontrado.');
    if (po.status === 'CANCELED') throw new BadRequestException('Pedido cancelado nao pode ser recebido.');
    if (['RECEIVED', 'PARTIALLY_RECEIVED'].includes(String(po.status))) throw new BadRequestException('Pedido ja recebido.');
    const orderedStockItemIds = new Set(po.items.map((item) => item.stockItemId));

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
        if (!orderedStockItemIds.has(row.stockItemId)) {
          throw new BadRequestException('Recebimento contem item que nao pertence ao pedido de compra.');
        }
        const orderedQuantity = Number(row.orderedQuantity ?? receivedQuantity);
        const divergence = Math.abs(receivedQuantity - orderedQuantity) > 0.0001;
        if (divergence) hasDivergence = true;

        const item = await tx.stockItem.findUnique({ where: { id: row.stockItemId } });
        if (!item || item.companyId !== ctx.companyId) {
          throw new NotFoundException('Item de estoque nao encontrado para recebimento.');
        }
        if (String(item.stockType) !== 'RAW_MATERIAL') {
          throw new BadRequestException('Recebimento de compra aceita apenas insumos.');
        }

        const batchNumber = this.clean(row.batchNumber);
        const expirationDate = row.expirationDate ? new Date(row.expirationDate) : null;
        if (expirationDate && Number.isNaN(expirationDate.getTime())) {
          throw new BadRequestException('expirationDate invalida.');
        }

        let batchId: string | null = null;
        if (batchNumber || expirationDate) {
          const existingBatch = batchNumber
            ? await tx.stockBatch.findFirst({
                where: {
                  stockItemId: row.stockItemId,
                  branchId,
                  batchNumber,
                },
              })
            : null;
          if (existingBatch && ['DISCARDED', 'EXPIRED'].includes(String(existingBatch.status))) {
            throw new BadRequestException('Lote descartado ou expirado nao pode receber nova entrada.');
          }
          const batch = existingBatch
            ? await tx.stockBatch.update({
                where: { id: existingBatch.id },
                data: {
                  initialQuantity: Number(existingBatch.initialQuantity ?? 0) + receivedQuantity,
                  quantityRemaining: Number(existingBatch.quantityRemaining ?? 0) + receivedQuantity,
                  unitCost,
                  expirationDate: expirationDate ?? existingBatch.expirationDate,
                  receivedDate: new Date(),
                  supplierId: po.supplierId,
                  status: Number(existingBatch.quantityRemaining ?? 0) + receivedQuantity > 0 ? 'AVAILABLE' : existingBatch.status,
                },
              })
            : await tx.stockBatch.create({
                data: {
                  stockItemId: row.stockItemId,
                  branchId,
                  supplierId: po.supplierId,
                  batchNumber,
                  receivedDate: new Date(),
                  expirationDate,
                  initialQuantity: receivedQuantity,
                  quantityRemaining: receivedQuantity,
                  unitCost,
                  status: 'AVAILABLE',
                },
              });
          batchId = batch.id;
        }

        await tx.goodsReceiptItem.create({
          data: {
            goodsReceiptId: receipt.id,
            stockItemId: row.stockItemId,
            batchId,
            batchNumber,
            expirationDate,
            orderedQuantity,
            receivedQuantity,
            unitCost,
            hasDivergence: divergence,
            divergenceNotes: divergence ? 'Diferenca entre pedido e recebimento.' : null,
          },
        });

        const previous = Number(item.currentQuantity);
        const next = previous + receivedQuantity;
        const previousAverageCost = Number(item.averageCost ?? 0);
        const weightedAverageCost = next > 0
          ? Number(((previous * previousAverageCost + receivedQuantity * unitCost) / next).toFixed(4))
          : unitCost;
        await tx.stockItem.update({
          where: { id: row.stockItemId },
          data: {
            currentQuantity: next,
            averageCost: weightedAverageCost,
            lastCost: unitCost,
            ...(batchId ? { controlsBatch: true, controlsExpiry: Boolean(expirationDate) || item.controlsExpiry } : {}),
          },
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
            batchId,
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

      recordAuditFromContext({
        action: AUDIT_ACTIONS.PURCHASE_RECEIPT_CREATE,
        outcome: 'success',
        ctx,
        target: { type: 'goods_receipt', id: receipt.id },
        metadata: { purchaseOrderId: po.id, supplierId: po.supplierId, hasDivergence, totalReceived },
      });
      recordAuditFromContext({
        action: AUDIT_ACTIONS.ACCOUNT_PAYABLE_GENERATED_FROM_PURCHASE,
        outcome: 'success',
        ctx,
        target: { type: 'accounts_payable', id: payable.id },
        metadata: { purchaseOrderId: po.id, supplierId: po.supplierId, amount: totalReceived },
      });

      return { receiptId: receipt.id, payableId: payable.id, hasDivergence, totalReceived };
    });
  }

  async listReceipts(ctx: RequestContext) {
    if (!ctx.branchId) throw new BadRequestException('branchId obrigatorio no contexto.');
    return this.prisma.goodsReceipt.findMany({
      where: { purchaseOrder: { branchId: ctx.branchId }, supplier: { companyId: ctx.companyId } },
      include: {
        supplier: true,
        purchaseOrder: true,
        items: {
          include: {
            stockItem: {
              select: { id: true, name: true, code: true, stockType: true, stockUnit: true, purchaseUnit: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getReceipt(ctx: RequestContext, receiptId: string) {
    const receipt = await this.prisma.goodsReceipt.findUnique({
      where: { id: receiptId },
      include: {
        supplier: true,
        purchaseOrder: true,
        items: {
          include: {
            stockItem: {
              select: { id: true, name: true, code: true, stockType: true, stockUnit: true, purchaseUnit: true },
            },
          },
        },
      },
    });
    if (!receipt || receipt.supplier.companyId !== ctx.companyId || receipt.purchaseOrder?.branchId !== ctx.branchId) {
      throw new NotFoundException('Recebimento nao encontrado.');
    }
    return receipt;
  }

  async conferenceReceipt(ctx: RequestContext, receiptId: string) {
    const receipt = await this.prisma.goodsReceipt.findUnique({
      where: { id: receiptId },
      include: { supplier: true, items: true, purchaseOrder: { include: { items: true } } },
    });
    if (!receipt || receipt.supplier.companyId !== ctx.companyId || receipt.purchaseOrder?.branchId !== ctx.branchId) {
      throw new NotFoundException('Recebimento nao encontrado.');
    }

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
    if (!ctx.branchId) throw new BadRequestException('branchId obrigatorio no contexto.');
    const rows = await this.prisma.goodsReceiptItem.findMany({
      where: { stockItemId, goodsReceipt: { purchaseOrder: { branchId: ctx.branchId }, supplier: { companyId: ctx.companyId } } },
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

  async listPurchaseHistory(ctx: RequestContext, stockItemId?: string) {
    if (!ctx.branchId) throw new BadRequestException('branchId obrigatorio no contexto.');
    return this.prisma.purchaseOrderItem.findMany({
      where: {
        ...(stockItemId ? { stockItemId } : {}),
        purchaseOrder: { branchId: ctx.branchId, supplier: { companyId: ctx.companyId } },
      },
      include: {
        stockItem: { select: { id: true, name: true, code: true, stockUnit: true, purchaseUnit: true } },
        purchaseOrder: { include: { supplier: true } },
      },
      orderBy: { purchaseOrder: { createdAt: 'desc' } },
      take: 100,
    });
  }

  async getPurchaseHistorySummary(ctx: RequestContext, stockItemId?: string) {
    if (!ctx.branchId) throw new BadRequestException('branchId obrigatorio no contexto.');
    const rows = await this.prisma.goodsReceiptItem.findMany({
      where: {
        ...(stockItemId ? { stockItemId } : {}),
        goodsReceipt: { purchaseOrder: { branchId: ctx.branchId }, supplier: { companyId: ctx.companyId } },
      },
      include: {
        stockItem: { select: { id: true, name: true, code: true, stockUnit: true, purchaseUnit: true } },
        goodsReceipt: { include: { supplier: true } },
      },
      orderBy: { goodsReceipt: { createdAt: 'desc' } },
      take: 200,
    });

    const byItem = new Map<string, any>();
    for (const row of rows) {
      const quantity = Number(row.receivedQuantity ?? 0);
      const unitCost = Number(row.unitCost ?? 0);
      const totalCost = quantity * unitCost;
      const current = byItem.get(row.stockItemId) ?? {
        stockItemId: row.stockItemId,
        stockItemName: row.stockItem?.name ?? row.stockItemId,
        stockUnit: row.stockItem?.stockUnit ?? row.stockItem?.purchaseUnit ?? 'UN',
        samples: 0,
        totalQuantity: 0,
        totalCost: 0,
        lastUnitCost: unitCost,
        lastSupplierName: row.goodsReceipt.supplier?.name ?? null,
        lastReceivedAt: row.goodsReceipt.receivedAt ?? row.goodsReceipt.createdAt,
      };
      current.samples += 1;
      current.totalQuantity += quantity;
      current.totalCost += totalCost;
      if (new Date(row.goodsReceipt.receivedAt ?? row.goodsReceipt.createdAt).getTime() >= new Date(current.lastReceivedAt).getTime()) {
        current.lastUnitCost = unitCost;
        current.lastSupplierName = row.goodsReceipt.supplier?.name ?? null;
        current.lastReceivedAt = row.goodsReceipt.receivedAt ?? row.goodsReceipt.createdAt;
      }
      byItem.set(row.stockItemId, current);
    }

    return Array.from(byItem.values()).map((row) => ({
      ...row,
      totalQuantity: Number(row.totalQuantity.toFixed(3)),
      totalCost: Number(row.totalCost.toFixed(2)),
      weightedAverageCost: row.totalQuantity > 0 ? Number((row.totalCost / row.totalQuantity).toFixed(4)) : 0,
    }));
  }

  async getAverageCost(ctx: RequestContext, stockItemId: string) {
    if (!stockItemId) throw new BadRequestException('stockItemId obrigatorio.');
    if (!ctx.branchId) throw new BadRequestException('branchId obrigatorio no contexto.');
    const stockItem = await this.prisma.stockItem.findUnique({ where: { id: stockItemId } });
    if (!stockItem || stockItem.companyId !== ctx.companyId) throw new NotFoundException('Item nao encontrado.');

    const history = await this.prisma.goodsReceiptItem.findMany({
      where: { stockItemId, goodsReceipt: { purchaseOrder: { branchId: ctx.branchId }, supplier: { companyId: ctx.companyId } } },
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

  async listPurchaseDocuments(ctx: RequestContext) {
    if (!ctx.branchId) throw new BadRequestException('branchId obrigatorio no contexto.');
    return this.prisma.purchaseDocument.findMany({
      where: { companyId: ctx.companyId, branchId: ctx.branchId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async importFiscalDocumentByAccessKey(
    ctx: RequestContext,
    input: { accessKey: string; supplierId?: string; documentType?: 'NFE' | 'NFCE' },
  ) {
    if (!ctx.branchId) throw new BadRequestException('branchId obrigatorio no contexto.');
    const branchId = ctx.branchId;
    const metadata = decodeFiscalAccessKey(input.accessKey);
    const requestedType = input.documentType ?? metadata.documentType;
    if (requestedType !== metadata.documentType) {
      throw new BadRequestException('documentType diverge do modelo fiscal da chave.');
    }

    recordAuditFromContext({
      action: AUDIT_ACTIONS.PURCHASE_DOCUMENT_IMPORT_REQUESTED,
      outcome: 'pending',
      ctx,
      metadata: {
        accessKey: metadata.accessKey,
        documentType: metadata.documentType,
        issuerCnpj: metadata.issuerCnpj,
      },
    });

    const existing = await this.prisma.purchaseDocument.findFirst({
      where: { companyId: ctx.companyId, accessKey: metadata.accessKey },
      select: { id: true, status: true },
    });
    if (existing) throw new BadRequestException(`Cupom fiscal ja importado: ${existing.id}.`);

    if (input.supplierId) {
      const supplier = await this.prisma.supplier.findUnique({ where: { id: input.supplierId } });
      if (!supplier || supplier.companyId !== ctx.companyId) throw new NotFoundException('Fornecedor nao encontrado.');
    }

    try {
      const lookup = await this.fiscalLookupProvider.lookupByAccessKey({ metadata });
      const document = await this.prisma.purchaseDocument.create({
        data: {
          companyId: ctx.companyId,
          branchId,
          supplierId: this.clean(input.supplierId),
          documentType: metadata.documentType,
          accessKey: metadata.accessKey,
          issuerCnpj: lookup.issuerCnpj,
          issuerName: lookup.issuerName,
          emittedAt: lookup.emittedAt,
          totalAmount: lookup.totalAmount,
          status: 'PENDING_REVIEW',
          source: 'MANUAL_KEY',
          providerName: lookup.providerName,
          rawProvider: {
            providerName: lookup.providerName,
            stateCode: metadata.stateCode,
            model: metadata.model,
            series: metadata.series,
            number: metadata.number,
            itemsCount: lookup.items.length,
          },
          createdByUserId: ctx.userId,
          items: {
            create: lookup.items.map((item) => ({
              companyId: ctx.companyId,
              branchId,
              lineNumber: item.lineNumber,
              fiscalCode: this.clean(item.fiscalCode),
              ean: this.clean(item.ean),
              description: item.description,
              quantity: item.quantity,
              unit: this.clean(item.unit),
              unitPrice: item.unitPrice,
              totalAmount: item.totalAmount,
              batchNumber: this.clean(item.batchNumber),
              expirationDate: item.expirationDate ?? null,
              status: 'UNMAPPED',
            })),
          },
        },
        include: { items: true },
      }) as any;

      recordAuditFromContext({
        action: AUDIT_ACTIONS.PURCHASE_DOCUMENT_LOOKUP_SUCCESS,
        outcome: 'success',
        ctx,
        target: { type: 'purchase_document', id: document.id, label: document.accessKey },
        metadata: { documentType: document.documentType, itemsCount: document.items?.length ?? 0, totalAmount: document.totalAmount },
      });

      return document;
    } catch (error) {
      recordAuditFromContext({
        action: AUDIT_ACTIONS.PURCHASE_DOCUMENT_LOOKUP_FAILED,
        outcome: 'failure',
        ctx,
        metadata: { accessKey: metadata.accessKey, documentType: metadata.documentType, error: error instanceof Error ? error.message : 'unknown' },
      });
      throw error;
    }
  }

  async getPurchaseDocument(ctx: RequestContext, id: string) {
    return this.getPurchaseDocumentInScope(ctx, id);
  }

  async mapPurchaseDocumentItem(
    ctx: RequestContext,
    documentId: string,
    itemId: string,
    input: { stockItemId: string; conversionFactor?: number },
  ) {
    const doc = await this.getPurchaseDocumentInScope(ctx, documentId);
    this.assertDocumentEditable(doc.status);
    const stockItemId = String(input.stockItemId ?? '').trim();
    if (!stockItemId) throw new BadRequestException('stockItemId obrigatorio.');
    const conversionFactor = Number(input.conversionFactor ?? 1);
    if (!Number.isFinite(conversionFactor) || conversionFactor <= 0) throw new BadRequestException('conversionFactor deve ser maior que zero.');

    await this.assertPurchasableStockItem(ctx, stockItemId);

    const item = doc.items.find((row: any) => row.id === itemId);
    if (!item) throw new NotFoundException('Item fiscal nao encontrado.');
    const updated = await this.prisma.purchaseDocumentItem.update({
      where: { id: itemId },
      data: { mappedStockItemId: stockItemId, conversionFactor, status: 'MAPPED' },
    });
    await this.refreshPurchaseDocumentStatus(documentId);

    await this.prisma.supplierItemMapping.create({
      data: {
        companyId: ctx.companyId,
        supplierId: doc.supplierId,
        issuerCnpj: doc.issuerCnpj,
        fiscalCode: item.fiscalCode,
        ean: item.ean,
        fiscalName: item.description,
        stockItemId,
        inputUnit: item.unit,
        conversionFactor,
      },
    }).catch(() => null);

    recordAuditFromContext({
      action: AUDIT_ACTIONS.PURCHASE_DOCUMENT_ITEM_MAPPED,
      outcome: 'success',
      ctx,
      target: { type: 'purchase_document_item', id: itemId, label: item.description },
      metadata: { documentId, stockItemId, conversionFactor },
    });

    return updated;
  }

  async ignorePurchaseDocumentItem(ctx: RequestContext, documentId: string, itemId: string) {
    const doc = await this.getPurchaseDocumentInScope(ctx, documentId);
    this.assertDocumentEditable(doc.status);
    const item = doc.items.find((row: any) => row.id === itemId);
    if (!item) throw new NotFoundException('Item fiscal nao encontrado.');
    const updated = await this.prisma.purchaseDocumentItem.update({
      where: { id: itemId },
      data: { mappedStockItemId: null, status: 'IGNORED' },
    });
    await this.refreshPurchaseDocumentStatus(documentId);
    recordAuditFromContext({
      action: AUDIT_ACTIONS.PURCHASE_DOCUMENT_ITEM_IGNORED,
      outcome: 'success',
      ctx,
      target: { type: 'purchase_document_item', id: itemId, label: item.description },
      metadata: { documentId },
    });
    return updated;
  }

  async confirmPurchaseDocumentStockEntry(ctx: RequestContext, documentId: string) {
    const doc = await this.getPurchaseDocumentInScope(ctx, documentId);
    const branchId = ctx.branchId!;
    if (doc.status === 'CONFIRMED') return { documentId, confirmed: false, reason: 'already_confirmed' as const };
    if (doc.status === 'CANCELED') throw new BadRequestException('Documento cancelado nao pode ser confirmado.');
    const pending = doc.items.filter((item: any) => item.status === 'UNMAPPED');
    if (pending.length > 0) throw new BadRequestException('Todos os itens devem ser mapeados ou ignorados antes da confirmacao.');
    const mapped = doc.items.filter((item: any) => item.status === 'MAPPED' && item.mappedStockItemId);
    if (mapped.length === 0) throw new BadRequestException('Nenhum item mapeado para confirmar.');

    const existingMovement = await this.prisma.stockMovement.findFirst({
      where: { sourceModule: 'purchase_fiscal_document', sourceId: doc.id },
      select: { id: true },
    });
    if (existingMovement) return { documentId, confirmed: false, reason: 'already_consumed' as const };

    const result = await this.prisma.$transaction(async (tx) => {
      let movementsCreated = 0;
      for (const row of mapped) {
        const mappedStockItemId = String(row.mappedStockItemId ?? '').trim();
        if (!mappedStockItemId) throw new BadRequestException('Item fiscal sem insumo mapeado.');
        const stock = await tx.stockItem.findUnique({ where: { id: mappedStockItemId } });
        if (!stock || stock.companyId !== ctx.companyId) throw new NotFoundException('Insumo mapeado nao encontrado.');
        if (String(stock.stockType) !== 'RAW_MATERIAL') {
          throw new BadRequestException('Entrada fiscal de compra aceita apenas insumos.');
        }
        const fiscalQuantity = Number(row.quantity);
        const quantity = fiscalQuantity * Number(row.conversionFactor ?? 1);
        if (!Number.isFinite(quantity) || quantity <= 0) throw new BadRequestException('Quantidade convertida invalida.');
        const fiscalTotal = Number(row.totalAmount ?? Number(row.unitPrice ?? 0) * fiscalQuantity);
        const unitCost = quantity > 0 ? Number((fiscalTotal / quantity).toFixed(4)) : 0;
        const previous = Number(stock.currentQuantity ?? 0);
        const next = previous + quantity;
        const previousAverageCost = Number(stock.averageCost ?? 0);
        const weightedAverageCost = next > 0
          ? Number(((previous * previousAverageCost + quantity * unitCost) / next).toFixed(4))
          : unitCost;
        let batchId: string | null = null;
        if (row.batchNumber || row.expirationDate) {
          const existingBatch = row.batchNumber
            ? await tx.stockBatch.findFirst({
                where: { stockItemId: stock.id, branchId, batchNumber: row.batchNumber },
              })
            : null;
          const batch = existingBatch
            ? await tx.stockBatch.update({
                where: { id: existingBatch.id },
                data: {
                  initialQuantity: Number(existingBatch.initialQuantity ?? 0) + quantity,
                  quantityRemaining: Number(existingBatch.quantityRemaining ?? 0) + quantity,
                  unitCost,
                  expirationDate: row.expirationDate ?? existingBatch.expirationDate,
                  supplierId: doc.supplierId,
                  receivedDate: new Date(),
                  status: 'AVAILABLE',
                },
              })
            : await tx.stockBatch.create({
                data: {
                  stockItemId: stock.id,
                  branchId,
                  supplierId: doc.supplierId,
                  batchNumber: row.batchNumber,
                  receivedDate: new Date(),
                  expirationDate: row.expirationDate,
                  initialQuantity: quantity,
                  quantityRemaining: quantity,
                  unitCost,
                  status: 'AVAILABLE',
                },
              });
          batchId = batch.id;
        }

        await tx.stockItem.update({
          where: { id: stock.id },
          data: {
            currentQuantity: next,
            averageCost: weightedAverageCost,
            lastCost: unitCost,
            ...(batchId ? { controlsBatch: true, controlsExpiry: Boolean(row.expirationDate) || stock.controlsExpiry } : {}),
          },
        });
        await tx.stockLocationBalance.upsert({
          where: { branchId_stockItemId: { branchId, stockItemId: stock.id } },
          create: { branchId, stockItemId: stock.id, companyId: ctx.companyId, currentQuantity: next },
          update: { currentQuantity: next, companyId: ctx.companyId },
        });
        await tx.stockMovement.create({
          data: {
            stockItemId: stock.id,
            branchId,
            batchId,
            movementType: 'ENTRY',
            movementTypeDetailed: 'purchase_fiscal_document_entry',
            sourceModule: 'purchase_fiscal_document',
            sourceId: doc.id,
            actorId: ctx.userId,
            requestId: ctx.requestId,
            quantity,
            unitCost,
            totalCost: Number(fiscalTotal.toFixed(2)),
            previousStock: previous,
            newStock: next,
            reasonCode: 'purchase_fiscal_document_confirmed',
          },
        });
        await tx.purchaseDocumentItem.update({ where: { id: row.id }, data: { status: 'CONFIRMED' } });
        movementsCreated += 1;
      }
      const updatedDocument = await tx.purchaseDocument.update({
        where: { id: doc.id },
        data: { status: 'CONFIRMED', confirmedAt: new Date() },
      });
      return { documentId: doc.id, confirmed: true as const, movementsCreated, document: updatedDocument };
    });

    recordAuditFromContext({
      action: AUDIT_ACTIONS.PURCHASE_DOCUMENT_STOCK_ENTRY_CONFIRMED,
      outcome: 'success',
      ctx,
      target: { type: 'purchase_document', id: doc.id, label: doc.accessKey },
      metadata: { movementsCreated: result.movementsCreated },
    });

    return result;
  }

  private async getPurchaseOrderInCompany(ctx: RequestContext, id: string) {
    if (!ctx.branchId) throw new BadRequestException('branchId obrigatorio no contexto.');
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, branchId: ctx.branchId },
      include: {
        supplier: true,
        items: {
          include: {
            stockItem: {
              select: { id: true, name: true, code: true, stockType: true, stockUnit: true, purchaseUnit: true },
            },
          },
        },
      },
    });
    if (!po || po.supplier.companyId !== ctx.companyId) throw new NotFoundException('Pedido de compra nao encontrado.');
    return po;
  }

  private async getPurchaseDocumentInScope(ctx: RequestContext, id: string) {
    if (!ctx.branchId) throw new BadRequestException('branchId obrigatorio no contexto.');
    const doc = await this.prisma.purchaseDocument.findFirst({
      where: { id, companyId: ctx.companyId, branchId: ctx.branchId },
      include: { items: { orderBy: { lineNumber: 'asc' } } },
    });
    if (!doc) throw new NotFoundException('Documento fiscal de compra nao encontrado.');
    return doc;
  }

  private assertDocumentEditable(status: string) {
    if (['CONFIRMED', 'CANCELED'].includes(status)) {
      throw new BadRequestException('Documento fiscal nao pode mais ser alterado.');
    }
  }

  private async refreshPurchaseDocumentStatus(documentId: string) {
    const rows = await this.prisma.purchaseDocumentItem.findMany({
      where: { purchaseDocumentId: documentId },
      select: { status: true },
    });
    const actionable = rows.filter((row) => row.status !== 'IGNORED');
    const allMappedOrIgnored = rows.every((row) => row.status === 'MAPPED' || row.status === 'IGNORED');
    const anyMapped = actionable.some((row) => row.status === 'MAPPED');
    const status = allMappedOrIgnored && anyMapped ? 'READY_TO_CONFIRM' : anyMapped ? 'PARTIALLY_MAPPED' : 'PENDING_REVIEW';
    await this.prisma.purchaseDocument.update({ where: { id: documentId }, data: { status } });
  }

  private async assertPurchasableStockItem(ctx: RequestContext, stockItemId: string) {
    const stockItem = await this.prisma.stockItem.findUnique({ where: { id: stockItemId } });
    if (!stockItem || stockItem.companyId !== ctx.companyId) throw new NotFoundException('Insumo de estoque nao encontrado.');
    if (String(stockItem.stockType) !== 'RAW_MATERIAL') {
      throw new BadRequestException('Compras e fornecedores aceitam apenas itens do tipo Insumo.');
    }
    if (stockItem.isActive === false) {
      throw new BadRequestException('Insumo inativo nao pode ser usado em compras.');
    }
    return stockItem;
  }

  private async assertSupplierDocumentAvailable(ctx: RequestContext, document: string | null, ignoreId?: string) {
    if (!document) return;
    const existing = await this.prisma.supplier.findFirst({
      where: {
        companyId: ctx.companyId,
        document,
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
      },
      select: { id: true, name: true },
    });
    if (existing) throw new BadRequestException(`Documento ja cadastrado no fornecedor ${existing.name}.`);
  }

  private clean(value: unknown) {
    const v = String(value ?? '').trim();
    return v.length > 0 ? v : null;
  }
}
