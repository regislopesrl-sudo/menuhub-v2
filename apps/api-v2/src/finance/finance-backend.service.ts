import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AUDIT_ACTIONS } from '../common/audit-log';
import { AuditLogService } from '../common/audit-log.service';
import type { RequestContext } from '../common/request-context';
import { TENANT_PERMISSIONS } from '../common/rbac';
import {
  assertAnyPermission,
  buildCompanyWhere,
  canReadFinance,
  getAllowedBranchIds,
  requireBranchId,
} from '../common/query-scope';

export interface FinancialLedgerEntryInput {
  branchId?: string;
  financialAccountId?: string | null;
  categoryId?: string | null;
  costCenterId?: string | null;
  entryType: 'DEBIT' | 'CREDIT' | string;
  originType?: string;
  originId?: string | null;
  amount: number;
  reasonCode?: string | null;
  reasonText?: string | null;
  externalReference?: string | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class FinanceBackendService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  listLedgerEntries(ctx: RequestContext, filters: { status?: string } = {}) {
    assertAnyPermission(ctx, [TENANT_PERMISSIONS.FINANCE_READ], 'Sem permissao para ler financeiro.');
    if (!canReadFinance(ctx)) {
      throw new BadRequestException('Permissoes financeiras inconsistentes.');
    }
    return this.prisma.financialLedgerEntry.findMany({
      where: this.branchScopedWhere(ctx, {
        ...(filters.status ? { status: filters.status } : {}),
      }),
      orderBy: { createdAt: 'desc' },
      take: 250,
    });
  }

  async createLedgerEntry(ctx: RequestContext, input: FinancialLedgerEntryInput) {
    assertAnyPermission(ctx, [TENANT_PERMISSIONS.FINANCE_MANAGE], 'Sem permissao para lancar financeiro.');
    const branchId = requireBranchId(ctx, input.branchId ?? ctx.branchId);
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('amount deve ser maior que zero.');
    }

    if (input.idempotencyKey) {
      const existing = await this.prisma.financialLedgerEntry.findFirst({
        where: this.branchScopedWhere(ctx, { idempotencyKey: input.idempotencyKey }, branchId),
      });
      if (existing) return existing;
    }

    await this.assertCompanyEntity(ctx, 'financialAccount', input.financialAccountId, 'Conta financeira nao encontrada.');
    await this.assertCompanyEntity(ctx, 'financialCategory', input.categoryId, 'Categoria financeira nao encontrada.');
    await this.assertCompanyEntity(ctx, 'costCenter', input.costCenterId, 'Centro de custo nao encontrado.');

    const entry = await this.prisma.financialLedgerEntry.create({
      data: {
        branchId,
        actorUserId: ctx.userId ?? null,
        financialAccountId: input.financialAccountId ?? null,
        categoryId: input.categoryId ?? null,
        costCenterId: input.costCenterId ?? null,
        entryType: String(input.entryType ?? '').trim().toUpperCase(),
        originType: input.originType ?? 'ADJUSTMENT',
        originId: input.originId ?? null,
        amount,
        reasonCode: clean(input.reasonCode),
        reasonText: clean(input.reasonText),
        externalReference: clean(input.externalReference),
        requestId: ctx.requestId,
        idempotencyKey: clean(input.idempotencyKey),
        metadata: input.metadata as any,
      } as any,
    });

    await this.auditLog.recordFromContext({
      action: AUDIT_ACTIONS.FINANCE_ENTRY_CREATE,
      outcome: 'success',
      ctx,
      target: { type: 'financial_ledger_entry', id: entry.id },
      metadata: {
        branchId,
        amount,
        entryType: input.entryType,
        idempotencyKey: input.idempotencyKey,
      },
    });

    return entry;
  }

  listPayables(ctx: RequestContext, filters: { status?: string } = {}) {
    assertAnyPermission(
      ctx,
      [TENANT_PERMISSIONS.ACCOUNTS_PAYABLE_READ, TENANT_PERMISSIONS.FINANCE_READ],
      'Sem permissao para ler contas a pagar.',
    );
    return this.prisma.accountsPayable.findMany({
      where: this.branchScopedWhere(ctx, {
        ...(filters.status ? { status: filters.status } : {}),
      }),
      orderBy: { dueDate: 'asc' },
      take: 250,
    });
  }

  private branchScopedWhere(ctx: RequestContext, extra: Record<string, unknown> = {}, branchId?: string) {
    const branchIds = getAllowedBranchIds(ctx);
    const branchFilter =
      branchId
        ? { branchId }
        : branchIds.length === 0
        ? {}
        : branchIds.length === 1
          ? { branchId: branchIds[0] }
          : { branchId: { in: branchIds } };
    return {
      ...extra,
      ...branchFilter,
      branch: { companyId: ctx.companyId },
    } as any;
  }

  private async assertCompanyEntity(
    ctx: RequestContext,
    model: 'financialAccount' | 'financialCategory' | 'costCenter',
    id?: string | null,
    message = 'Registro nao encontrado.',
  ) {
    if (!id) return;
    const delegate = this.prisma[model] as any;
    const record = await delegate.findFirst({
      where: buildCompanyWhere(ctx, { id }) as any,
      select: { id: true },
    });
    if (!record) throw new NotFoundException(message);
  }
}

function clean(value?: string | null): string | null {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : null;
}
