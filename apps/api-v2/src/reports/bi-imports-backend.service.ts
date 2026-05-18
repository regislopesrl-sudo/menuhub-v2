import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AUDIT_ACTIONS } from '../common/audit-log';
import { AuditLogService } from '../common/audit-log.service';
import type { RequestContext } from '../common/request-context';
import { TENANT_PERMISSIONS } from '../common/rbac';
import {
  assertAnyPermission,
  assertBranchAllowed,
  buildAllowedBranchesWhere,
  buildBranchWhere,
  buildCompanyWhere,
  getAllowedBranchIds,
  requireBranchId,
} from '../common/query-scope';

export interface SalesImportInput {
  sourceType?: string;
  originalFileName?: string | null;
  fileHash?: string | null;
  periodStart?: Date | string | null;
  periodEnd?: Date | string | null;
  rows?: Array<{
    rowNumber: number;
    externalOrderId?: string | null;
    rawData: Record<string, unknown>;
    normalizedData?: Record<string, unknown> | null;
  }>;
  metadata?: Record<string, unknown>;
}

export interface ImportedSaleInput {
  importId?: string | null;
  importRowId?: string | null;
  externalOrderId?: string | null;
  saleDate: Date | string;
  productId?: string | null;
  productName?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  quantity?: number | null;
  grossAmount?: number | null;
  discountAmount?: number | null;
  netAmount?: number | null;
  costAmount?: number | null;
  channel?: string | null;
  paymentMethod?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class BiImportsBackendService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async createSalesImport(ctx: RequestContext, input: SalesImportInput) {
    assertAnyPermission(
      ctx,
      [TENANT_PERMISSIONS.REPORTS_BI, TENANT_PERMISSIONS.REPORTS_SALES],
      'Sem permissao para importar vendas.',
    );
    const branchId = requireBranchId(ctx);
    const fileHash = clean(input.fileHash);

    if (fileHash) {
      const existing = await this.prisma.branchSalesImport.findFirst({
        where: buildBranchWhere(ctx, { fileHash }, branchId) as any,
      });
      if (existing) return existing;
    }

    const rows = input.rows ?? [];
    const salesImport = await this.prisma.branchSalesImport.create({
      data: {
        companyId: ctx.companyId,
        branchId,
        sourceType: clean(input.sourceType) ?? 'MANUAL_UPLOAD',
        originalFileName: clean(input.originalFileName),
        fileHash,
        periodStart: normalizeDate(input.periodStart),
        periodEnd: normalizeDate(input.periodEnd),
        totalRows: rows.length,
        dataStatus: rows.length > 0 ? 'PENDING_PROCESSING' : 'NO_DATA',
        metadata: input.metadata as any,
        createdByUserId: ctx.userId ?? null,
        rows: {
          create: rows.map((row) => ({
            companyId: ctx.companyId,
            branchId,
            rowNumber: Number(row.rowNumber),
            externalOrderId: clean(row.externalOrderId),
            rawData: row.rawData as any,
            normalizedData: row.normalizedData as any,
          })),
        },
      } as any,
      include: { rows: true },
    });

    await this.auditLog.recordFromContext({
      action: AUDIT_ACTIONS.IMPORT_SALES_CREATE,
      outcome: 'success',
      ctx,
      target: { type: 'branch_sales_import', id: salesImport.id },
      metadata: { branchId, importId: salesImport.id, rows: rows.length, fileHash },
    });

    return salesImport;
  }

  listImportedSalesHistory(ctx: RequestContext, filters: { productId?: string; channel?: string } = {}) {
    assertAnyPermission(
      ctx,
      [TENANT_PERMISSIONS.REPORTS_READ, TENANT_PERMISSIONS.REPORTS_SALES, TENANT_PERMISSIONS.REPORTS_BI],
      'Sem permissao para ler historico importado.',
    );
    return this.prisma.importedSalesHistory.findMany({
      where: buildAllowedBranchesWhere(ctx, {
        ...(filters.productId ? { productId: filters.productId } : {}),
        ...(filters.channel ? { channel: filters.channel } : {}),
      }) as any,
      orderBy: { saleDate: 'desc' },
      take: 500,
    });
  }

  async appendImportedSale(ctx: RequestContext, input: ImportedSaleInput) {
    assertAnyPermission(
      ctx,
      [TENANT_PERMISSIONS.REPORTS_BI, TENANT_PERMISSIONS.REPORTS_SALES],
      'Sem permissao para gravar venda importada.',
    );
    const branchId = requireBranchId(ctx);
    const saleDate = normalizeDate(input.saleDate);
    if (!saleDate) throw new BadRequestException('saleDate obrigatorio.');

    return this.prisma.importedSalesHistory.create({
      data: {
        companyId: ctx.companyId,
        branchId,
        importId: input.importId ?? null,
        importRowId: input.importRowId ?? null,
        externalOrderId: clean(input.externalOrderId),
        saleDate,
        productId: clean(input.productId),
        productName: clean(input.productName),
        categoryId: clean(input.categoryId),
        categoryName: clean(input.categoryName),
        quantity: input.quantity ?? null,
        grossAmount: input.grossAmount ?? null,
        discountAmount: input.discountAmount ?? null,
        netAmount: input.netAmount ?? null,
        costAmount: input.costAmount ?? null,
        cmvPercent: calculateCmv(input.costAmount, input.netAmount),
        channel: clean(input.channel),
        paymentMethod: clean(input.paymentMethod),
        dataStatus: input.costAmount == null ? 'PARTIAL_DATA' : 'COMPLETE',
        metadata: input.metadata as any,
      } as any,
    });
  }

  async createReportSnapshot(
    ctx: RequestContext,
    input: {
      branchId?: string | null;
      reportKey: string;
      reportType: string;
      periodStart?: Date | string | null;
      periodEnd?: Date | string | null;
      payload: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    },
  ) {
    assertAnyPermission(ctx, [TENANT_PERMISSIONS.REPORTS_BI], 'Sem permissao para gravar snapshot de relatorio.');
    const branchId = clean(input.branchId);
    if (branchId) assertBranchAllowed(ctx, branchId);

    const snapshot = await this.prisma.reportSnapshot.create({
      data: {
        companyId: ctx.companyId,
        branchId,
        reportKey: required(input.reportKey, 'reportKey'),
        reportType: required(input.reportType, 'reportType'),
        periodStart: normalizeDate(input.periodStart),
        periodEnd: normalizeDate(input.periodEnd),
        dataStatus: 'COMPLETE',
        payload: input.payload as any,
        metadata: input.metadata as any,
        generatedByUserId: ctx.userId ?? null,
      },
    });

    await this.auditLog.recordFromContext({
      action: AUDIT_ACTIONS.REPORT_SNAPSHOT_CREATE,
      outcome: 'success',
      ctx,
      target: { type: 'report_snapshot', id: snapshot.id },
      metadata: { reportKey: snapshot.reportKey, reportType: snapshot.reportType, branchId },
    });

    return snapshot;
  }

  listReportSnapshots(ctx: RequestContext, filters: { reportType?: string } = {}) {
    assertAnyPermission(ctx, [TENANT_PERMISSIONS.REPORTS_READ, TENANT_PERMISSIONS.REPORTS_BI], 'Sem permissao para ler snapshots.');
    const allowedBranchIds = getAllowedBranchIds(ctx);
    const branchScope =
      allowedBranchIds.length === 0
        ? {}
        : {
            OR: [
              { branchId: null },
              allowedBranchIds.length === 1 ? { branchId: allowedBranchIds[0] } : { branchId: { in: allowedBranchIds } },
            ],
          };
    return this.prisma.reportSnapshot.findMany({
      where: buildCompanyWhere(ctx, {
        ...branchScope,
        ...(filters.reportType ? { reportType: filters.reportType } : {}),
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

function normalizeDate(value?: Date | string | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function calculateCmv(costAmount?: number | null, netAmount?: number | null): number | null {
  const cost = Number(costAmount ?? 0);
  const net = Number(netAmount ?? 0);
  if (!Number.isFinite(cost) || !Number.isFinite(net) || net <= 0) return null;
  return Number(((cost / net) * 100).toFixed(4));
}

function required(value: string | undefined | null, field: string): string {
  const normalized = clean(value);
  if (!normalized) throw new BadRequestException(`${field} obrigatorio.`);
  return normalized;
}
