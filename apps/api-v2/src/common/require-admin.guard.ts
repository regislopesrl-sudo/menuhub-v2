import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { RequestContext } from './request-context';

type HttpRequest = { context?: RequestContext };

@Injectable()
export class RequireAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<HttpRequest>();
    const role = request.context?.userRole;
    if (
      role !== 'admin' &&
      role !== 'master' &&
      role !== 'developer' &&
      role !== 'owner' &&
      role !== 'manager'
    ) {
      throw new ForbiddenException('Area administrativa restrita.');
    }
    return true;
  }
}
