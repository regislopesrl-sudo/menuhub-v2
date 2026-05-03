import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_PERMISSIONS_KEY } from './permissions.decorator';
import type { RequestContext } from './request-context';

type HttpRequest = { context?: RequestContext };

@Injectable()
export class PermissionGuardV2 implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<HttpRequest>();
    const granted = request.context?.permissions ?? [];
    const denied = required.filter((permission) => !granted.includes(permission));
    if (denied.length > 0) {
      throw new ForbiddenException(`Permissoes ausentes: ${denied.join(', ')}`);
    }
    return true;
  }
}
