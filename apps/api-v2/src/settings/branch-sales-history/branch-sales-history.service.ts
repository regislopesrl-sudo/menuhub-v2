import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SalesImportJobStatus, SalesImportRowStatus } from '@prisma/client';
import type { RequestContext } from '../../common/request-context';
import { isPlatformContext } from '../../common/platform-access';
import { PrismaService } from '../../database/prisma.service';
import { StockService } from '../../stock/stock.service';
import {
  parseSalesHistoryCsv,
  parseSalesHistoryXlsx,
  salesHistoryTemplateCsv,
  type SalesHistoryNormalizedRow,
  type SalesHistoryParsedFile,
  type SalesHistoryParsedRow,
} from './branch-sales-history.parser';

type UploadedFileLike = {
  originalname?: string;
  mimetype?: string;
  buffer?: Buffer;
  size?: number;
};

type ImportOptions = {
  previewOnly?: boolean;
  target?: 'history' | 'orders';
};

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 100000;

@Injectable()
export class BranchSalesHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockService: StockService,
  ) {}

  async getTemplate(ctx: RequestContext, branchId: string) {
    await this.assertBranchAccess(ctx, branchId);
    return salesHistoryTemplateCsv();
  }

  async importFile(ctx: RequestContext, branchId: string, file: UploadedFileLike | undefined, options: ImportOptions = {}) {
    await this.assertBranchAccess(ctx, branchId);
    const target = options.target ?? 'history';
    if (!file?.buffer?.length) {
      throw new BadRequestException('Envie um arquivo CSV no campo file.');
    }
    if ((file.size ?? file.buffer.length) > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('Arquivo acima do limite de 10 MB.');
    }

    const fileName = file.originalname ?? 'vendas-historicas.csv';
    const format = this.resolveFormat(fileName, file.mimetype);
    const rawContent = format === 'XLSX' ? file.buffer.toString('base64') : file.buffer.toString('utf8');
    const parsed = format === 'XLSX' ? await parseSalesHistoryXlsx(file.buffer) : parseSalesHistoryCsv(rawContent);
    if (parsed.rows.length > MAX_ROWS) {
      throw new BadRequestException(`Arquivo com mais de ${MAX_ROWS} linhas.`);
    }

    const job = await this.prisma.salesImportJob.create({
      data: {
        companyId: ctx.companyId,
        branchId,
        createdById: ctx.userId ?? null,
        createdByEmail: null,
        fileName,
        fileMimeType: file.mimetype ?? 'text/csv',
        sourceFormat: format,
        mode: 'UPSERT',
        status: options.previewOnly ? SalesImportJobStatus.PREVIEWED : SalesImportJobStatus.PROCESSING,
        detectedDelimiter: parsed.delimiter,
        detectedColumns: parsed.columns,
        rawContent,
        totalRows: parsed.rows.length,
        validRows: parsed.validRows,
        invalidRows: parsed.invalidRows,
        summary: this.buildJobSummary(parsed, options.previewOnly ? 'PREVIEW' : 'IMPORT', target),
      },
    });

    await this.createImportRows(job.id, parsed.rows, target);

    if (options.previewOnly) {
      if (target === 'orders') {
        await this.previewOperationalOrders(ctx, branchId, job.id, parsed.rows);
      }
      return this.getImport(ctx, branchId, job.id);
    }

    const importResult = target === 'orders'
      ? await this.persistOperationalOrders(ctx, branchId, job.id, parsed.rows)
      : await this.persistImportedSales(ctx, branchId, job.id, parsed.rows);
    const finalStatus =
      importResult.errorCount > 0 || parsed.invalidRows > 0
        ? importResult.createdCount + importResult.updatedCount > 0
          ? SalesImportJobStatus.COMPLETED_WITH_ERRORS
          : SalesImportJobStatus.FAILED
        : SalesImportJobStatus.COMPLETED;

    await this.prisma.salesImportJob.update({
      where: { id: job.id },
      data: {
        status: finalStatus,
        createdCount: importResult.createdCount,
        updatedCount: importResult.updatedCount,
        errorCount: importResult.errorCount,
        skippedCount: parsed.invalidRows,
        completedAt: new Date(),
        summary: {
          ...this.buildJobSummary(parsed, 'IMPORT', target),
          createdCount: importResult.createdCount,
          updatedCount: importResult.updatedCount,
          errorCount: importResult.errorCount,
          skippedCount: parsed.invalidRows,
          ...(target === 'orders'
            ? {
                orderGroups: (importResult as any).orderGroups ?? 0,
                stockConsumedOrders: (importResult as any).stockConsumedOrders ?? 0,
                stockWarnings: (importResult as any).stockWarnings ?? 0,
              }
            : {}),
        },
      },
    });

    return this.getImport(ctx, branchId, job.id);
  }

  async listImports(ctx: RequestContext, branchId: string) {
    await this.assertBranchAccess(ctx, branchId);
    const rows = await this.prisma.salesImportJob.findMany({
      where: { companyId: ctx.companyId, branchId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: this.jobSelect(),
    });
    return {
      items: rows.map((row) => this.mapJob(row)),
      total: rows.length,
      source: 'IMPORTED_HISTORY',
    };
  }

  async getImport(ctx: RequestContext, branchId: string, importId: string) {
    await this.assertBranchAccess(ctx, branchId);
    const job = await this.prisma.salesImportJob.findFirst({
      where: { id: importId, companyId: ctx.companyId, branchId },
      select: {
        ...this.jobSelect(),
        rows: {
          orderBy: { lineNumber: 'asc' },
          take: 20,
          select: {
            id: true,
            lineNumber: true,
            status: true,
            action: true,
            entityType: true,
            entityId: true,
            messages: true,
          },
        },
      },
    });
    if (!job) {
      throw new NotFoundException('Importacao nao encontrada.');
    }
    return {
      ...this.mapJob(job),
      rows: job.rows,
    };
  }

  async getImportErrors(ctx: RequestContext, branchId: string, importId: string) {
    await this.assertBranchAccess(ctx, branchId);
    const job = await this.prisma.salesImportJob.findFirst({
      where: { id: importId, companyId: ctx.companyId, branchId },
      select: { id: true },
    });
    if (!job) {
      throw new NotFoundException('Importacao nao encontrada.');
    }
    const rows = await this.prisma.salesImportRow.findMany({
      where: { jobId: importId, status: { in: [SalesImportRowStatus.INVALID, SalesImportRowStatus.ERROR] } },
      orderBy: { lineNumber: 'asc' },
      take: 200,
      select: {
        id: true,
        lineNumber: true,
        status: true,
        rawPayload: true,
        normalizedPayload: true,
        messages: true,
        resultPayload: true,
      },
    });
    return { items: rows, total: rows.length };
  }

  async cancelImport(ctx: RequestContext, branchId: string, importId: string) {
    await this.assertBranchAccess(ctx, branchId);
    const job = await this.prisma.salesImportJob.findFirst({
      where: { id: importId, companyId: ctx.companyId, branchId },
      select: { id: true, status: true, summary: true },
    });
    if (!job) {
      throw new NotFoundException('Importacao nao encontrada.');
    }
    const finishedStatuses: SalesImportJobStatus[] = [SalesImportJobStatus.COMPLETED, SalesImportJobStatus.COMPLETED_WITH_ERRORS];
    if (finishedStatuses.includes(job.status)) {
      throw new BadRequestException('Importacao ja concluida nao pode ser cancelada.');
    }
    await this.prisma.salesImportJob.update({
      where: { id: importId },
      data: {
        status: SalesImportJobStatus.FAILED,
        completedAt: new Date(),
        summary: {
          ...(typeof job.summary === 'object' && job.summary ? job.summary : {}),
          canceled: true,
          canceledAt: new Date().toISOString(),
        },
      },
    });
    return this.getImport(ctx, branchId, importId);
  }

  private async assertBranchAccess(ctx: RequestContext, branchId: string) {
    if (ctx.branchId && ctx.branchId !== branchId && !isPlatformContext(ctx)) {
      throw new ForbiddenException('Filial fora do escopo do usuario atual.');
    }
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, companyId: ctx.companyId },
      select: { id: true },
    });
    if (!branch) {
      throw new NotFoundException('Filial nao encontrada.');
    }
  }

  private resolveFormat(fileName: string, mimeType?: string) {
    const normalizedName = fileName.toLowerCase();
    const normalizedMime = String(mimeType ?? '').toLowerCase();
    if (normalizedName.endsWith('.xlsx') || normalizedName.endsWith('.xls')) {
      return 'XLSX';
    }
    if (normalizedName.endsWith('.csv') || normalizedMime.includes('csv') || normalizedMime.includes('text/plain')) {
      return 'CSV';
    }
    throw new BadRequestException('Formato nao suportado. Envie um arquivo CSV.');
  }

  private async createImportRows(jobId: string, rows: SalesHistoryParsedRow[], target: 'history' | 'orders' = 'history') {
    if (!rows.length) return;
    await this.prisma.salesImportRow.createMany({
      data: rows.map((row) => ({
        jobId,
        lineNumber: row.lineNumber,
        status: row.valid ? SalesImportRowStatus.VALID : SalesImportRowStatus.INVALID,
        action: row.valid ? (target === 'orders' ? 'READY_TO_CREATE_ORDER' : 'READY_TO_UPSERT') : 'SKIP',
        entityType: target === 'orders' ? 'ORDER' : 'IMPORTED_SALE',
        rawPayload: row.raw as Prisma.InputJsonValue,
        normalizedPayload: (row.normalized ?? {}) as Prisma.InputJsonValue,
        messages: row.messages as Prisma.InputJsonValue,
      })),
    });
  }

  private async previewOperationalOrders(ctx: RequestContext, branchId: string, jobId: string, rows: SalesHistoryParsedRow[]) {
    const groups = this.groupValidRowsByOrder(branchId, rows);
    let warningCount = 0;
    for (const [dedupKey, group] of groups.entries()) {
      const warnings = await this.validateOperationalGroup(ctx, group);
      if (warnings.length > 0) warningCount += warnings.length;
      await this.prisma.salesImportRow.updateMany({
        where: { jobId, lineNumber: { in: group.map((row) => row.lineNumber) } },
        data: {
          action: warnings.length > 0 ? 'PREVIEW_WITH_WARNINGS' : 'READY_TO_CREATE_ORDER',
          resultPayload: {
            dedupKey,
            source: 'IMPORTED_REAL_ORDERS',
            orderLines: group.length,
            warnings,
          },
          messages: warnings as Prisma.InputJsonValue,
        },
      });
    }
    await this.prisma.salesImportJob.update({
      where: { id: jobId },
      data: {
        summary: {
          mode: 'PREVIEW',
          source: 'IMPORTED_REAL_ORDERS',
          orderGroups: groups.size,
          warningCount,
          behavior: 'Valida vendas reais sem criar pedidos, pagamentos ou baixa de estoque.',
        },
      },
    });
  }

  private async persistImportedSales(ctx: RequestContext, branchId: string, jobId: string, rows: SalesHistoryParsedRow[]) {
    let createdCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    for (const row of rows) {
      if (!row.valid || !row.normalized) continue;
      const dedupKey = this.buildDedupKey(branchId, row.normalized, row.lineNumber);
      try {
        const existing = await this.prisma.importedSale.findUnique({
          where: { companyId_dedupKey: { companyId: ctx.companyId, dedupKey } },
          select: { id: true },
        });
        const sale = await this.prisma.importedSale.upsert({
          where: { companyId_dedupKey: { companyId: ctx.companyId, dedupKey } },
          create: this.toImportedSaleCreate(ctx.companyId, branchId, jobId, dedupKey, row.normalized, row.raw),
          update: {
            importJobId: jobId,
            externalSaleId: row.normalized.externalOrderId,
            orderNumber: row.normalized.orderNumber,
            saleDate: new Date(row.normalized.saleDate),
            channel: row.normalized.channel,
            customerName: row.normalized.customerName,
            subtotal: row.normalized.grossAmount,
            discountAmount: row.normalized.discountAmount,
            deliveryFee: row.normalized.deliveryFee,
            totalAmount: row.normalized.netAmount,
            paymentMethod: row.normalized.paymentMethod,
            saleStatus: row.normalized.status,
            importedBranchName: row.normalized.branchName,
            notes: row.normalized.notes,
            rawPayload: row.raw as Prisma.InputJsonValue,
            normalizedPayload: row.normalized as Prisma.InputJsonValue,
            lastImportedAt: new Date(),
          },
          select: { id: true },
        });
        if (existing) {
          updatedCount += 1;
        } else {
          createdCount += 1;
        }
        await this.prisma.salesImportRow.updateMany({
          where: { jobId, lineNumber: row.lineNumber },
          data: {
            status: existing ? SalesImportRowStatus.UPDATED : SalesImportRowStatus.CREATED,
            action: existing ? 'UPDATED' : 'CREATED',
            entityId: sale.id,
            resultPayload: { dedupKey, source: 'IMPORTED_HISTORY' },
          },
        });
      } catch (error) {
        errorCount += 1;
        await this.prisma.salesImportRow.updateMany({
          where: { jobId, lineNumber: row.lineNumber },
          data: {
            status: SalesImportRowStatus.ERROR,
            action: 'ERROR',
            messages: [error instanceof Error ? error.message : String(error)],
          },
        });
      }
    }

    return { createdCount, updatedCount, errorCount };
  }

  private async persistOperationalOrders(ctx: RequestContext, branchId: string, jobId: string, rows: SalesHistoryParsedRow[]) {
    let createdCount = 0;
    let updatedCount = 0;
    let errorCount = 0;
    let stockConsumedOrders = 0;
    let stockWarnings = 0;
    const groups = this.groupValidRowsByOrder(branchId, rows);

    for (const [dedupKey, group] of groups.entries()) {
      const lineNumbers = group.map((row) => row.lineNumber);
      const first = group[0]?.normalized;
      if (!first) continue;
      const idempotencyKey = this.buildOperationalIdempotencyKey(dedupKey);

      try {
        const existing = await this.prisma.order.findFirst({
          where: { companyId: ctx.companyId, branchId, idempotencyKey },
          select: { id: true },
        });
        if (existing) {
          updatedCount += 1;
          await this.prisma.salesImportRow.updateMany({
            where: { jobId, lineNumber: { in: lineNumbers } },
            data: {
              status: SalesImportRowStatus.UPDATED,
              action: 'EXISTING_ORDER',
              entityType: 'ORDER',
              entityId: existing.id,
              resultPayload: { dedupKey, source: 'IMPORTED_REAL_ORDERS', reused: true },
            },
          });
          continue;
        }

        const warnings = await this.validateOperationalGroup(ctx, group);
        const items = await this.buildOperationalOrderItems(ctx.companyId, group);
        if (items.length === 0) {
          throw new BadRequestException('Venda sem itens para criar pedido real.');
        }

        const saleDate = new Date(first.saleDate);
        const status = this.mapImportedOrderStatus(first.status);
        const channel = this.mapImportedChannel(first.channel);
        const paymentStatus = this.mapImportedPaymentSummaryStatus(first.status);
        const subtotal = this.money(items.reduce((sum, item) => sum + item.totalPrice, 0) || first.grossAmount);
        const totalAmount = this.money(first.netAmount);
        const paidAmount = paymentStatus === 'PAID' || paymentStatus === 'REFUNDED' ? totalAmount : 0;
        const refundedAmount = paymentStatus === 'REFUNDED' ? totalAmount : 0;
        const payment = this.buildImportedPayment(first, totalAmount, saleDate);
        const orderNumber = await this.buildImportedOrderNumber(branchId, first, group[0].lineNumber);

        const order = await this.prisma.order.create({
          data: {
            companyId: ctx.companyId,
            branchId,
            createdById: ctx.userId ?? null,
            orderNumber,
            idempotencyKey,
            publicTrackingToken: this.buildPublicTrackingToken(),
            orderType: this.mapImportedOrderType(first.channel),
            channel,
            status,
            paymentStatus,
            subtotal,
            discountAmount: first.discountAmount,
            deliveryFee: first.deliveryFee,
            extraFee: first.serviceFee,
            paidAmount,
            refundedAmount,
            totalAmount,
            notes: first.notes ?? undefined,
            internalNotes: JSON.stringify({
              externalSalesImport: {
                jobId,
                dedupKey,
                source: 'IMPORTED_REAL_ORDERS',
                externalOrderId: first.externalOrderId,
                originalOrderNumber: first.orderNumber,
                operatorName: first.operatorName,
                waiterName: first.waiterName,
                tableNumber: first.tableNumber,
                tabNumber: first.tabNumber,
              },
            }),
            confirmedAt: status !== 'CANCELED' ? saleDate : null,
            finalizedAt: status === 'FINALIZED' || status === 'REFUNDED' ? saleDate : null,
            canceledAt: status === 'CANCELED' ? saleDate : null,
            createdAt: saleDate,
            items: {
              create: items.map((item) => ({
                productId: item.productId,
                productNameSnapshot: item.productNameSnapshot,
                station: item.station,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                theoreticalCostSnapshot: item.theoreticalCostSnapshot,
                totalPrice: item.totalPrice,
                notes: item.notes,
                status: status === 'CANCELED' ? 'CANCELED' : 'DONE',
              })),
            },
            ...(payment ? { payments: { create: [payment] } } : {}),
            statusLogs: {
              create: [{
                userId: ctx.userId ?? null,
                previousStatus: null,
                newStatus: status,
                notes: 'Pedido criado por importacao real de vendas externas.',
                createdAt: saleDate,
              }],
            },
            timelineEvents: {
              create: [{
                actorType: 'INTEGRATION',
                actorUserId: ctx.userId ?? null,
                eventType: 'order.imported.external_sale',
                newStatus: status,
                sourceModule: 'settings.sales_history',
                sourceAction: 'operational_import',
                reasonCode: 'external_sales_import',
                channel,
                correlationId: ctx.requestId,
                payload: {
                  jobId,
                  dedupKey,
                  lineNumbers,
                  source: 'IMPORTED_REAL_ORDERS',
                },
                createdAt: saleDate,
              }],
            },
          },
          include: { items: true },
        });

        let stockConsumption: Prisma.InputJsonValue = { consumed: false, reason: 'not_applicable' };
        if ((status === 'FINALIZED' || status === 'DELIVERED') && items.some((item) => item.productId)) {
          try {
            stockConsumption = JSON.parse(JSON.stringify(await this.stockService.consumeByOrder(ctx, order.id))) as Prisma.InputJsonValue;
            if ((stockConsumption as any).consumed) stockConsumedOrders += 1;
          } catch (error) {
            stockWarnings += 1;
            warnings.push(`Pedido criado, mas a baixa de estoque falhou: ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        createdCount += 1;
        if (warnings.length > 0) stockWarnings += warnings.length;
        await this.prisma.salesImportRow.updateMany({
          where: { jobId, lineNumber: { in: lineNumbers } },
          data: {
            status: SalesImportRowStatus.CREATED,
            action: warnings.length > 0 ? 'ORDER_CREATED_WITH_WARNINGS' : 'ORDER_CREATED',
            entityType: 'ORDER',
            entityId: order.id,
            messages: warnings as Prisma.InputJsonValue,
            resultPayload: {
              dedupKey,
              source: 'IMPORTED_REAL_ORDERS',
              orderId: order.id,
              orderNumber: order.orderNumber,
              stockConsumption,
            },
          },
        });
      } catch (error) {
        errorCount += 1;
        await this.prisma.salesImportRow.updateMany({
          where: { jobId, lineNumber: { in: lineNumbers } },
          data: {
            status: SalesImportRowStatus.ERROR,
            action: 'ERROR',
            entityType: 'ORDER',
            messages: [error instanceof Error ? error.message : String(error)],
          },
        });
      }
    }

    return { createdCount, updatedCount, errorCount, orderGroups: groups.size, stockConsumedOrders, stockWarnings };
  }

  private toImportedSaleCreate(
    companyId: string,
    branchId: string,
    jobId: string,
    dedupKey: string,
    row: SalesHistoryNormalizedRow,
    raw: Record<string, string>,
  ) {
    return {
      companyId,
      branchId,
      importJobId: jobId,
      externalSaleId: row.externalOrderId,
      orderNumber: row.orderNumber,
      dedupKey,
      saleDate: new Date(row.saleDate),
      channel: row.channel,
      customerName: row.customerName,
      subtotal: row.grossAmount,
      discountAmount: row.discountAmount,
      deliveryFee: row.deliveryFee,
      totalAmount: row.netAmount,
      paymentMethod: row.paymentMethod,
      saleStatus: row.status,
      importedBranchName: row.branchName,
      notes: row.notes,
      rawPayload: raw as Prisma.InputJsonValue,
      normalizedPayload: row as Prisma.InputJsonValue,
      lastImportedAt: new Date(),
    };
  }

  private buildDedupKey(branchId: string, row: SalesHistoryNormalizedRow, lineNumber: number) {
    const saleDay = row.saleDate.slice(0, 10);
    const primary = row.externalOrderId ?? row.orderNumber ?? `linha-${lineNumber}`;
    return [branchId, saleDay, primary, row.channel, row.netAmount.toFixed(2)].join('|');
  }

  private groupValidRowsByOrder(branchId: string, rows: SalesHistoryParsedRow[]) {
    const groups = new Map<string, SalesHistoryParsedRow[]>();
    for (const row of rows) {
      if (!row.valid || !row.normalized) continue;
      const key = this.buildDedupKey(branchId, row.normalized, row.lineNumber);
      const current = groups.get(key) ?? [];
      current.push(row);
      groups.set(key, current);
    }
    return groups;
  }

  private async validateOperationalGroup(ctx: RequestContext, rows: SalesHistoryParsedRow[]) {
    const warnings: string[] = [];
    if (!rows.some((row) => row.normalized?.productId || row.normalized?.productSku || row.normalized?.productName)) {
      warnings.push('Venda sem colunas de produto: sera criado um item generico sem baixa de estoque.');
    }
    for (const row of rows) {
      const normalized = row.normalized;
      if (!normalized) continue;
      if ((normalized.productId || normalized.productSku) && !(await this.resolveProductForRow(ctx.companyId, normalized))) {
        warnings.push(`Linha ${row.lineNumber}: produto informado nao encontrado; item sera importado sem vinculo de estoque.`);
      }
      if (!normalized.itemQuantity && (normalized.productId || normalized.productSku || normalized.productName)) {
        warnings.push(`Linha ${row.lineNumber}: quantidade do item ausente; sera usado 1.`);
      }
    }
    return warnings;
  }

  private async buildOperationalOrderItems(companyId: string, rows: SalesHistoryParsedRow[]) {
    const items = [];
    const first = rows[0]?.normalized;
    const itemRows = rows.filter((row) => row.normalized?.productId || row.normalized?.productSku || row.normalized?.productName);
    const sourceRows = itemRows.length > 0 ? itemRows : rows.slice(0, 1);

    for (const row of sourceRows) {
      const normalized = row.normalized;
      if (!normalized) continue;
      const product = await this.resolveProductForRow(companyId, normalized);
      const quantity = this.quantity(normalized.itemQuantity ?? (itemRows.length > 0 ? 1 : normalized.itemsCount ?? 1));
      const total = this.money(normalized.itemTotal ?? (normalized.itemUnitPrice ? normalized.itemUnitPrice * quantity : itemRows.length > 0 ? 0 : first?.grossAmount ?? 0));
      const unitPrice = this.money(normalized.itemUnitPrice ?? (quantity > 0 ? total / quantity : total));
      const theoreticalCostSnapshot = this.resolveProductTheoreticalCost(product);
      items.push({
        productId: product?.id ?? null,
        productNameSnapshot: product?.name ?? normalized.productName ?? `Venda importada ${normalized.orderNumber ?? normalized.externalOrderId ?? row.lineNumber}`,
        station: product?.kitchenStation ?? undefined,
        quantity,
        unitPrice,
        theoreticalCostSnapshot,
        totalPrice: total > 0 ? total : this.money(unitPrice * quantity),
        notes: normalized.itemNotes,
      });
    }

    return items;
  }

  private async resolveProductForRow(companyId: string, row: SalesHistoryNormalizedRow) {
    const productDelegate = (this.prisma as any).product;
    if (!productDelegate?.findFirst) return null;
    if (row.productId) {
      const product = await productDelegate.findFirst({
        where: { id: row.productId, companyId, deletedAt: null },
        select: this.operationalProductSelect(),
      });
      if (product) return product;
    }
    if (row.productSku) {
      return productDelegate.findFirst({
        where: {
          companyId,
          deletedAt: null,
          OR: [{ sku: row.productSku }, { pdvCode: row.productSku }],
        },
        select: this.operationalProductSelect(),
      });
    }
    return null;
  }

  private operationalProductSelect() {
    return {
      id: true,
      name: true,
      salePrice: true,
      costPrice: true,
      kitchenStation: true,
      controlsStock: true,
      recipe: {
        select: {
          yieldQuantity: true,
          lossPercent: true,
          items: {
            where: { affectsCost: true },
            select: {
              quantity: true,
              stockItem: { select: { averageCost: true } },
            },
          },
        },
      },
    };
  }

  private resolveProductTheoreticalCost(product: any) {
    if (!product) return undefined;
    const recipe = product.recipe;
    const yieldQuantity = Number(recipe?.yieldQuantity ?? 1);
    const lossPercent = Number(recipe?.lossPercent ?? 0);
    const grossCost = (recipe?.items ?? []).reduce((sum: number, item: any) => (
      sum + Number(item.quantity ?? 0) * Number(item.stockItem?.averageCost ?? 0)
    ), 0);
    const recipeCost = grossCost * (1 + lossPercent / 100);
    const recipeUnitCost = yieldQuantity > 0 ? recipeCost / yieldQuantity : recipeCost;
    const fallbackCost = Number(product.costPrice ?? 0);
    const cost = recipeUnitCost > 0 ? recipeUnitCost : fallbackCost;
    return cost > 0 ? this.money(cost) : undefined;
  }

  private buildOperationalIdempotencyKey(dedupKey: string) {
    return `external-sales-import:${dedupKey}`;
  }

  private async buildImportedOrderNumber(branchId: string, row: SalesHistoryNormalizedRow, lineNumber: number) {
    const primary = row.orderNumber ?? row.externalOrderId ?? `linha-${lineNumber}`;
    const base = `IMP-${String(primary).replace(/[^a-zA-Z0-9_-]+/g, '').slice(0, 32) || lineNumber}`;
    const existing = await this.prisma.order.findFirst({ where: { branchId, orderNumber: base }, select: { id: true } });
    if (!existing) return base;
    return `${base}-${Date.now().toString(36).slice(-5).toUpperCase()}`;
  }

  private mapImportedOrderStatus(status: string): 'FINALIZED' | 'CANCELED' | 'REFUNDED' | 'DELIVERED' {
    if (status === 'CANCELED' || status === 'FAILED') return 'CANCELED';
    if (status === 'REFUNDED' || status === 'PARTIALLY_REFUNDED') return 'REFUNDED';
    return 'FINALIZED';
  }

  private mapImportedPaymentSummaryStatus(status: string): 'PAID' | 'CANCELED' | 'REFUNDED' | 'PARTIALLY_REFUNDED' {
    if (status === 'CANCELED' || status === 'FAILED') return 'CANCELED';
    if (status === 'REFUNDED') return 'REFUNDED';
    if (status === 'PARTIALLY_REFUNDED') return 'PARTIALLY_REFUNDED';
    return 'PAID';
  }

  private mapImportedOrderType(channel: string): 'DELIVERY' | 'COUNTER' | 'PICKUP' | 'TABLE' | 'COMMAND' | 'KIOSK' {
    if (channel === 'DELIVERY') return 'DELIVERY';
    if (channel === 'KIOSK') return 'KIOSK';
    if (channel === 'WAITER_APP' || channel === 'TABLE') return 'TABLE';
    if (channel === 'TAKEOUT') return 'PICKUP';
    return 'COUNTER';
  }

  private mapImportedChannel(channel: string): 'PDV' | 'WEB' | 'KIOSK' | 'WAITER_APP' | 'INTEGRATION' {
    if (channel === 'DELIVERY') return 'WEB';
    if (channel === 'KIOSK') return 'KIOSK';
    if (channel === 'WAITER_APP' || channel === 'TABLE') return 'WAITER_APP';
    if (channel === 'PDV' || channel === 'TAKEOUT') return 'PDV';
    return 'INTEGRATION';
  }

  private buildImportedPayment(row: SalesHistoryNormalizedRow, totalAmount: number, saleDate: Date) {
    const status = this.mapImportedPaymentSummaryStatus(row.status);
    if (status === 'CANCELED') return null;
    const paymentStatus: 'PAID' | 'REFUNDED' | 'PARTIALLY_REFUNDED' =
      status === 'REFUNDED' ? 'REFUNDED' : status === 'PARTIALLY_REFUNDED' ? 'PARTIALLY_REFUNDED' : 'PAID';
    return {
      paymentMethod: this.mapImportedPaymentMethod(row.paymentMethod),
      amount: totalAmount,
      status: paymentStatus,
      transactionReference: row.externalOrderId ?? row.orderNumber,
      provider: 'external-import',
      providerTransactionId: row.externalOrderId,
      metadata: {
        source: 'IMPORTED_REAL_ORDERS',
        originalPaymentMethod: row.paymentMethod,
      },
      authorizedAt: saleDate,
      capturedAt: paymentStatus === 'PAID' ? saleDate : null,
      paidAt: paymentStatus === 'PAID' ? saleDate : null,
      refundedAt: paymentStatus === 'REFUNDED' || paymentStatus === 'PARTIALLY_REFUNDED' ? saleDate : null,
    };
  }

  private mapImportedPaymentMethod(paymentMethod: string): 'PIX' | 'CARD' | 'CASH' | 'EXTERNAL' {
    if (paymentMethod === 'PIX') return 'PIX';
    if (paymentMethod === 'CARTAO') return 'CARD';
    if (paymentMethod === 'DINHEIRO') return 'CASH';
    return 'EXTERNAL';
  }

  private quantity(value: number) {
    const parsed = Number(value ?? 1);
    if (!Number.isFinite(parsed) || parsed <= 0) return 1;
    return Number(parsed.toFixed(3));
  }

  private money(value: number) {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed)) return 0;
    return Number(parsed.toFixed(2));
  }

  private buildPublicTrackingToken() {
    const randomPart = Math.random().toString(36).slice(2, 14);
    const timePart = Date.now().toString(36);
    return `trk_imp_${timePart}_${randomPart}`;
  }

  private buildJobSummary(parsed: SalesHistoryParsedFile, mode: 'PREVIEW' | 'IMPORT', target: 'history' | 'orders' = 'history') {
    return {
      mode,
      source: target === 'orders' ? 'IMPORTED_REAL_ORDERS' : 'IMPORTED_HISTORY',
      biCoverage: target === 'orders' ? 'LIVE_ORDERS' : 'LIVE_AND_IMPORTED',
      totalRows: parsed.rows.length,
      validRows: parsed.validRows,
      invalidRows: parsed.invalidRows,
      periodStart: parsed.summary.periodStart,
      periodEnd: parsed.summary.periodEnd,
      grossAmount: parsed.summary.grossAmount,
      netAmount: parsed.summary.netAmount,
      channels: parsed.summary.channels,
      statuses: parsed.summary.statuses,
      paymentMethods: parsed.summary.paymentMethods,
      missingDetails: target === 'orders'
        ? ['Pedidos reais sao criados. Baixa de estoque depende de product_id/product_sku vinculado a produto com ficha tecnica.']
        : ['Itens/produtos nao sao criados no catalogo; CMV e top produtos permanecem parciais para vendas historicas.'],
    };
  }

  private jobSelect() {
    return {
      id: true,
      companyId: true,
      branchId: true,
      fileName: true,
      fileMimeType: true,
      sourceFormat: true,
      mode: true,
      status: true,
      detectedDelimiter: true,
      detectedColumns: true,
      totalRows: true,
      validRows: true,
      invalidRows: true,
      createdCount: true,
      updatedCount: true,
      skippedCount: true,
      errorCount: true,
      summary: true,
      createdAt: true,
      updatedAt: true,
      completedAt: true,
    } satisfies Prisma.SalesImportJobSelect;
  }

  private mapJob(job: any) {
    return {
      id: job.id,
      companyId: job.companyId,
      branchId: job.branchId,
      fileName: job.fileName,
      sourceFormat: job.sourceFormat,
      status: job.status,
      detectedDelimiter: job.detectedDelimiter,
      detectedColumns: job.detectedColumns,
      totalRows: job.totalRows,
      validRows: job.validRows,
      invalidRows: job.invalidRows,
      createdCount: job.createdCount,
      updatedCount: job.updatedCount,
      skippedCount: job.skippedCount,
      errorCount: job.errorCount,
      summary: job.summary,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt,
    };
  }
}
