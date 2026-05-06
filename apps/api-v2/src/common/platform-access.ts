import { ForbiddenException } from '@nestjs/common';
import type { RequestContext } from './request-context';
import { assertSameCompany } from './assert-same-company';

export function isPlatformContext(ctx: RequestContext): boolean {
  return (
    ctx.userRole === 'technical_admin' ||
    Boolean(ctx.permissions?.includes('platform:admin')) ||
    Boolean(ctx.permissions?.includes('*'))
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
