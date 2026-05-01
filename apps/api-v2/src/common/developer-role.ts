import { ForbiddenException } from '@nestjs/common';
import type { RequestContext } from './request-context';

export function isDeveloper(ctx: Pick<RequestContext, 'userRole'>): boolean {
  return ctx.userRole === 'developer';
}

export function requireDeveloper(ctx: Pick<RequestContext, 'userRole'>): void {
  if (!isDeveloper(ctx)) {
    throw new ForbiddenException('Area tecnica restrita.');
  }
}
