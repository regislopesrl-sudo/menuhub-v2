import { ForbiddenException } from '@nestjs/common';
import type { RequestContext } from './request-context';
import { isPlatformContext } from './platform-access';

export function isDeveloper(ctx: Pick<RequestContext, 'userRole'>): boolean {
  return ctx.userRole === 'developer';
}

export function requireDeveloper(ctx: Pick<RequestContext, 'userRole'>): void {
  if (!isDeveloper(ctx)) {
    throw new ForbiddenException('Area tecnica restrita.');
  }
}

export function requireDeveloperOrAdmin(
  ctx: Pick<RequestContext, 'userRole' | 'source' | 'permissions'>,
): void {
  if (!isDeveloper(ctx) && !isPlatformContext(ctx as RequestContext)) {
    throw new ForbiddenException('Area tecnica restrita.');
  }
}
