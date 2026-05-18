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
  requireBranchId,
} from '../common/query-scope';

export interface SupplierInput {
  name: string;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
}

export interface PurchaseReceiptInput {
  supplierId?: string | null;
  purchaseOrderId?: string | null;
  documentNumber?: string | null;
  fiscalKey?: string | null;
  notes?: string | null;
  items: Array<{
    stockItemId?: string | null;
    description?: string | null;
    quantityReceived: number;
    unitOfMeasure: string;
    unitCost?: number | null;
    notes?: string | null;
  }>;
}

@Injectable()
export class PurchasesBackendService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  listSuppliers(ctx: RequestContext) {
    assertAnyPermission(
      ctx,
      [TENANT_PERMISSIONS.SUPPLIERS_READ, TENANT_PERMISSIONS.PURCHASES_READ],
      'Sem permissao para ler fornecedores.',
    );
    return this.prisma.supplier.findMany({
      where: buildCompanyWhere(ctx) as any,
      orderBy: { name: 'asc' },
      take: 250,
    });
  }

  async createSupplier(ctx: RequestContext, input: SupplierInput) {
    assertAnyPermission(ctx, [TENANT_PERMISSIONS.SUPPLIERS_MANAGE], 'Sem permissao para criar fornecedor.');
    const name = String(input.name ?? '').trim();
    if (!name) throw new BadRequestException('name obrigatorio.');
    const document = clean(input.document);

    if (document) {
      const existing = await this.prisma.supplier.findFirst({
        where: buildCompanyWhere(ctx, { document }) as any,
        select: { id: true },
      });
      if (existing) throw new BadRequestException('Documento do fornecedor ja cadastrado.');
    }

    const supplier = await this.prisma.supplier.create({
      data: {
        companyId: ctx.companyId,
        name,
        document,
        email: clean(input.email),
        phone: clean(input.phone),
        notes: clean(input.notes),
      },
    });

    await this.auditLog.recordFromContext({
      action: AUDIT_ACTIONS.SUPPLIER_CREATE,
      outcome: 'success',
      ctx,
      target: { type: 'supplier', id: supplier.id, label: supplier.name },
      metadata: { supplierId: supplier.id, document: supplier.document },
    });

    return supplier;
  }

  listReceipts(ctx: RequestContext, filters: { status?: string } = {}) {
    assertAnyPermission(ctx, [TENANT_PERMISSIONS.PURCHASES_READ], 'Sem permissao para ler recebimentos.');
    return this.prisma.purchaseReceipt.findMany({
      where: buildAllowedBranchesWhere(ctx, {
        ...(filters.status ? { status: filters.status } : {}),
      }) as any,
      include: {
        supplier: true,
        items: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async createReceipt(ctx: RequestContext, input: PurchaseReceiptInput) {
    assertAnyPermission(ctx, [TENANT_PERMISSIONS.PURCHASES_RECEIVE], 'Sem permissao para receber compras.');
    const branchId = requireBranchId(ctx);
    if (!input.items?.length) throw new BadRequestException('items obrigatorio.');

    if (input.supplierId) {
      const supplier = await this.prisma.supplier.findFirst({
        where: buildCompanyWhere(ctx, { id: input.supplierId }) as any,
        select: { id: true },
      });
      if (!supplier) throw new NotFoundException('Fornecedor nao encontrado.');
    }

    const normalizedItems = [];
    for (const item of input.items) {
      const quantity = Number(item.quantityReceived);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new BadRequestException('quantityReceived deve ser maior que zero.');
      }
      const unitOfMeasure = String(item.unitOfMeasure ?? '').trim().toUpperCase();
      if (!unitOfMeasure) throw new BadRequestException('unitOfMeasure obrigatorio.');
      if (item.stockItemId) {
        const stockItem = await this.prisma.inventoryItem.findFirst({
          where: buildCompanyWhere(ctx, { id: item.stockItemId }) as any,
          select: { id: true },
        });
        if (!stockItem) throw new NotFoundException('Insumo nao encontrado.');
      }
      const unitCost = item.unitCost == null ? null : Number(item.unitCost);
      normalizedItems.push({
        companyId: ctx.companyId,
        branchId,
        stockItemId: item.stockItemId ?? null,
        description: clean(item.description),
        quantityReceived: quantity,
        unitOfMeasure,
        unitCost,
        totalCost: unitCost == null ? null : Number((quantity * unitCost).toFixed(2)),
        notes: clean(item.notes),
      });
    }

    const totalReceivedAmount = normalizedItems.reduce((sum, item) => sum + Number(item.totalCost ?? 0), 0);
    const receipt = await this.prisma.purchaseReceipt.create({
      data: {
        companyId: ctx.companyId,
        branchId,
        supplierId: input.supplierId ?? null,
        purchaseOrderId: input.purchaseOrderId ?? null,
        documentNumber: clean(input.documentNumber),
        fiscalKey: clean(input.fiscalKey),
        totalReceivedAmount: Number(totalReceivedAmount.toFixed(2)),
        notes: clean(input.notes),
        receivedByUserId: ctx.userId ?? null,
        items: { create: normalizedItems },
      },
      include: { items: true },
    });

    await this.auditLog.recordFromContext({
      action: AUDIT_ACTIONS.PURCHASE_RECEIPT_CREATE_PREMIUM,
      outcome: 'success',
      ctx,
      target: { type: 'purchase_receipt', id: receipt.id },
      metadata: {
        receiptId: receipt.id,
        branchId,
        supplierId: input.supplierId,
        itemCount: normalizedItems.length,
        totalReceivedAmount,
      },
    });

    return receipt;
  }

  listQuotes(ctx: RequestContext, filters: { supplierId?: string; stockItemId?: string } = {}) {
    assertAnyPermission(
      ctx,
      [TENANT_PERMISSIONS.PURCHASES_QUOTES_READ, TENANT_PERMISSIONS.PURCHASES_READ],
      'Sem permissao para ler cotacoes.',
    );
    return this.prisma.purchaseQuote.findMany({
      where: buildCompanyWhere(ctx, {
        ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
        ...(filters.stockItemId ? { stockItemId: filters.stockItemId } : {}),
      }) as any,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}

function clean(value?: string | null): string | null {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : null;
}
