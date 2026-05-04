import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { RequestContext } from './request-context';

type HttpRequest = { context?: RequestContext };

@Injectable()
export class RequireDeveloperGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<HttpRequest>();
    if (request.context?.userRole !== 'developer' && request.context?.userRole !== 'technical_admin') {
      throw new ForbiddenException('Area tecnica restrita.');
    }
    return true;
  }
}

