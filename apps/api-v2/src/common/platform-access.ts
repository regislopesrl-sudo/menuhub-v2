import { ForbiddenException } from '@nestjs/common';
import type { RequestContext } from './request-context';
import { assertSameCompany } from './assert-same-company';
import { PLATFORM_PERMISSIONS, hasAnyPermission, isTechnicalAdminSource } from './rbac';

export function isPlatformContext(ctx: RequestContext): boolean {
  return (
    isTechnicalAdminSource(ctx) ||
    hasAnyPermission(ctx, [PLATFORM_PERMISSIONS.ADMIN, PLATFORM_PERMISSIONS.ALL])
  );
}

export function assertPlatformAdmin(ctx: RequestContext): void {
  if (!isPlatformContext(ctx)) {
    throw new ForbiddenException('Acesso restrito ao nivel tecnico da plataforma.');
  }
}

export function assertCompanyScope(ctx: RequestContext, companyId: string): void {
  if (isPlatformContext(ctx)) {
    return;
  }
  assertSameCompany(ctx.companyId, companyId);
}
