import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { RequestContext } from './request-context';
import { isPlatformContext } from './platform-access';
import { isTenantAdminRole } from './rbac';

type HttpRequest = { context?: RequestContext };

@Injectable()
export class RequireAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<HttpRequest>();
    const role = request.context?.userRole;
    const ctx = request.context;
    const hasPlatformAccess = ctx ? isPlatformContext(ctx) : false;

    if (!isTenantAdminRole(role) && !hasPlatformAccess) {
      throw new ForbiddenException('Area administrativa restrita.');
    }
    return true;
  }
}
