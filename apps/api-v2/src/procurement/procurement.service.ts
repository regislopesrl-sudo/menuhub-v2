import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { RequestContext } from '../common/request-context';
import { AUDIT_ACTIONS } from '../common/audit-log';
import { recordAuditFromContext } from '../common/audit-log-recorder';
import { decodeFiscalAccessKey } from './fiscal-access-key';
import { LocalMockFiscalDocumentLookupProvider } from './fiscal-document-lookup.provider';

@Injectable()
export class ProcurementService {
  private readonly fiscalLookupProvider = new LocalMockFiscalDocumentLookupProvider();

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

        const item = await tx.stockItem.findUnique({ where: { id: row.stockItemId } });
        if (!item || item.companyId !== ctx.companyId) {
          throw new NotFoundException('Item de estoque nao encontrado para recebimento.');
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
        await tx.stockItem.update({
          where: { id: row.stockItemId },
          data: {
            currentQuantity: next,
            averageCost: unitCost,
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

    const stockItem = await this.prisma.stockItem.findUnique({ where: { id: stockItemId } });
    if (!stockItem || stockItem.companyId !== ctx.companyId) throw new NotFoundException('Insumo de estoque nao encontrado.');

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
        const quantity = Number(row.quantity) * Number(row.conversionFactor ?? 1);
        if (!Number.isFinite(quantity) || quantity <= 0) throw new BadRequestException('Quantidade convertida invalida.');
        const unitCost = Number(row.unitPrice ?? row.totalAmount ?? 0) / Number(row.quantity || 1);
        const previous = Number(stock.currentQuantity ?? 0);
        const next = previous + quantity;
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
            averageCost: unitCost,
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
            totalCost: Number((quantity * unitCost).toFixed(2)),
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
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: { supplier: true, items: true },
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

  private clean(value: unknown) {
    const v = String(value ?? '').trim();
    return v.length > 0 ? v : null;
  }
}
