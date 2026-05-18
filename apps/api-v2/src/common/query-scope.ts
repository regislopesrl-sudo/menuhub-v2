import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { RequestContext } from './request-context';
import { TENANT_PERMISSIONS, hasAnyPermission } from './rbac';

type ScopeRecord = {
  companyId?: string | null;
  branchId?: string | null;
};

export const INVENTORY_COST_READ_PERMISSIONS = [
  TENANT_PERMISSIONS.INVENTORY_COST_READ,
  TENANT_PERMISSIONS.INVENTORY_COST_MANAGE,
  TENANT_PERMISSIONS.RECIPE_COST_READ,
  TENANT_PERMISSIONS.RECIPE_COST_MANAGE,
  TENANT_PERMISSIONS.COST_READ,
  TENANT_PERMISSIONS.CMV_READ,
  TENANT_PERMISSIONS.CMV_MANAGE,
] as const;

export const FINANCE_READ_PERMISSIONS = [
  TENANT_PERMISSIONS.FINANCE_READ,
  TENANT_PERMISSIONS.FINANCE_MANAGE,
  TENANT_PERMISSIONS.FINANCE_REPORTS,
  TENANT_PERMISSIONS.ACCOUNTS_PAYABLE_READ,
  TENANT_PERMISSIONS.ACCOUNTS_RECEIVABLE_READ,
  TENANT_PERMISSIONS.CASH_FLOW_READ,
  TENANT_PERMISSIONS.DRE_READ,
] as const;

export const REPORT_READ_PERMISSIONS = [
  TENANT_PERMISSIONS.REPORTS_READ,
  TENANT_PERMISSIONS.REPORTS_BI,
  TENANT_PERMISSIONS.REPORTS_FINANCE,
  TENANT_PERMISSIONS.REPORTS_INVENTORY,
  TENANT_PERMISSIONS.REPORTS_SALES,
  TENANT_PERMISSIONS.FINANCE_REPORTS,
] as const;

export function requireCompanyId(ctx: Pick<RequestContext, 'companyId'>): string {
  const companyId = String(ctx.companyId ?? '').trim();
  if (!companyId) {
    throw new BadRequestException('companyId obrigatorio no contexto.');
  }
  return companyId;
}

export function getAllowedBranchIds(
  ctx: Pick<RequestContext, 'branchId' | 'allowedBranchIds'>,
): string[] {
  const source = ctx.allowedBranchIds?.length ? ctx.allowedBranchIds : ctx.branchId ? [ctx.branchId] : [];
  return [...new Set(source.map((item) => String(item ?? '').trim()).filter(Boolean))];
}

export function assertBranchAllowed(
  ctx: Pick<RequestContext, 'branchId' | 'allowedBranchIds'>,
  branchId: string,
): void {
  const normalizedBranchId = String(branchId ?? '').trim();
  if (!normalizedBranchId) {
    throw new BadRequestException('branchId obrigatorio no contexto.');
  }

  const allowedBranchIds = getAllowedBranchIds(ctx);
  if (allowedBranchIds.length > 0 && !allowedBranchIds.includes(normalizedBranchId)) {
    throw new ForbiddenException('Filial fora do escopo permitido.');
  }
  if (allowedBranchIds.length === 0 && ctx.branchId && ctx.branchId !== normalizedBranchId) {
    throw new ForbiddenException('Filial fora do escopo permitido.');
  }
}

export function requireBranchId(
  ctx: Pick<RequestContext, 'branchId' | 'allowedBranchIds'>,
  branchId = ctx.branchId,
): string {
  const normalizedBranchId = String(branchId ?? '').trim();
  if (!normalizedBranchId) {
    throw new BadRequestException('branchId obrigatorio no contexto.');
  }
  assertBranchAllowed(ctx, normalizedBranchId);
  return normalizedBranchId;
}

export function buildCompanyWhere<T extends Record<string, unknown> = Record<string, never>>(
  ctx: Pick<RequestContext, 'companyId'>,
  extra?: T,
): T & { companyId: string } {
  return {
    ...(extra ?? ({} as T)),
    companyId: requireCompanyId(ctx),
  };
}

export function buildBranchWhere<T extends Record<string, unknown> = Record<string, never>>(
  ctx: Pick<RequestContext, 'companyId' | 'branchId' | 'allowedBranchIds'>,
  extra?: T,
  branchId = ctx.branchId,
): T & { companyId: string; branchId: string } {
  return {
    ...(extra ?? ({} as T)),
    companyId: requireCompanyId(ctx),
    branchId: requireBranchId(ctx, branchId),
  };
}

export function buildAllowedBranchesWhere<T extends Record<string, unknown> = Record<string, never>>(
  ctx: Pick<RequestContext, 'companyId' | 'branchId' | 'allowedBranchIds'>,
  extra?: T,
): T & { companyId: string; branchId?: string | { in: string[] } } {
  const allowedBranchIds = getAllowedBranchIds(ctx);
  const branchFilter =
    allowedBranchIds.length === 0
      ? {}
      : allowedBranchIds.length === 1
        ? { branchId: allowedBranchIds[0] }
        : { branchId: { in: allowedBranchIds } };

  return {
    ...(extra ?? ({} as T)),
    companyId: requireCompanyId(ctx),
    ...branchFilter,
  };
}

export function assertTenantRecord<T extends ScopeRecord>(
  ctx: Pick<RequestContext, 'companyId'>,
  record: T | null | undefined,
  message = 'Registro nao encontrado.',
): T {
  if (!record || record.companyId !== requireCompanyId(ctx)) {
    throw new NotFoundException(message);
  }
  return record;
}

export function assertBranchRecord<T extends ScopeRecord>(
  ctx: Pick<RequestContext, 'companyId' | 'branchId' | 'allowedBranchIds'>,
  record: T | null | undefined,
  message = 'Registro nao encontrado.',
): T {
  const scopedRecord = assertTenantRecord(ctx, record, message);
  if (scopedRecord.branchId) {
    assertBranchAllowed(ctx, scopedRecord.branchId);
  }
  return scopedRecord;
}

export function assertAnyPermission(
  ctx: Pick<RequestContext, 'permissions'>,
  required: readonly string[],
  message = 'Permissao insuficiente.',
): void {
  if (!hasAnyPermission(ctx, required)) {
    throw new ForbiddenException(message);
  }
}

export function canReadInventoryCosts(ctx: Pick<RequestContext, 'permissions'>): boolean {
  return hasAnyPermission(ctx, INVENTORY_COST_READ_PERMISSIONS);
}

export function canManageInventoryCosts(ctx: Pick<RequestContext, 'permissions'>): boolean {
  return hasAnyPermission(ctx, [
    TENANT_PERMISSIONS.INVENTORY_COST_MANAGE,
    TENANT_PERMISSIONS.CMV_MANAGE,
  ]);
}

export function canReadFinance(ctx: Pick<RequestContext, 'permissions'>): boolean {
  return hasAnyPermission(ctx, FINANCE_READ_PERMISSIONS);
}

export function canManageFinance(ctx: Pick<RequestContext, 'permissions'>): boolean {
  return hasAnyPermission(ctx, [
    TENANT_PERMISSIONS.FINANCE_MANAGE,
    TENANT_PERMISSIONS.ACCOUNTS_PAYABLE_MANAGE,
    TENANT_PERMISSIONS.ACCOUNTS_RECEIVABLE_MANAGE,
  ]);
}

export function canReadReports(ctx: Pick<RequestContext, 'permissions'>): boolean {
  return hasAnyPermission(ctx, REPORT_READ_PERMISSIONS);
}
