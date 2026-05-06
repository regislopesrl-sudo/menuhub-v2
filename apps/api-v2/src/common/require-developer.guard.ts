import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { RequestContext } from './request-context';
import { isPlatformContext } from './platform-access';
import { TENANT_ROLES } from './rbac';

type HttpRequest = { context?: RequestContext };

@Injectable()
export class RequireDeveloperGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<HttpRequest>();
    const ctx = request.context;
    const isDeveloperTenantRole = ctx?.userRole === TENANT_ROLES.DEVELOPER;
    const hasPlatformAccess = ctx ? isPlatformContext(ctx) : false;

    if (!isDeveloperTenantRole && !hasPlatformAccess) {
      throw new ForbiddenException('Area tecnica restrita.');
    }
    return true;
  }
}
