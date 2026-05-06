import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { ModuleKey } from '@delivery-futuro/shared-types';
import { MODULE_ACCESS_KEY } from './module-access.decorator';
import { ModulesService } from './modules.service';
import { buildRequestContextFromHeaders } from '../common/request-context';
import type { RequestContext } from '../common/request-context';
import { allowHeaderContextFallback } from '../common/runtime-env';

type AuthLikeRequest = {
  headers: Record<string, string | string[] | undefined>;
  context?: RequestContext;
};

@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(private readonly modulesService: ModulesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredModule = Reflect.getMetadata(MODULE_ACCESS_KEY, context.getHandler()) as ModuleKey | undefined;
    if (!requiredModule) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthLikeRequest>();
    let ctx = request.context;
    if (!ctx) {
      if (!allowHeaderContextFallback()) {
        throw new UnauthorizedException('Authorization Bearer token obrigatorio.');
      }
      console.warn('[ModuleGuard] Header context fallback ativo. Use Authorization Bearer token.');
      ctx = buildRequestContextFromHeaders(request.headers);
      request.context = ctx;
    }
    const isAdmin =
      ctx.userRole === 'admin' ||
      ctx.userRole === 'master' ||
      ctx.userRole === 'owner' ||
      ctx.userRole === 'manager';
    const access = await this.modulesService.checkAccess({
      companyId: ctx.companyId,
      moduleKey: requiredModule,
      isAdmin,
    });

    if (!access.allowed) {
      if (access.reason === 'MODULE_NOT_FOUND') {
        throw new ForbiddenException(`Modulo '${requiredModule}' nao cadastrado na V2.`);
      }
      if (access.reason === 'BLOCKED_ADMIN_ONLY') {
        throw new ForbiddenException(`Modulo '${requiredModule}' exige perfil admin/master.`);
      }
      throw new ForbiddenException(`Modulo '${requiredModule}' desativado para a empresa atual.`);
    }

    return true;
  }
}
