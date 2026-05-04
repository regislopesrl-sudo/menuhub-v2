import 'reflect-metadata';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { ModuleGuard } from './module.guard';
import { MODULE_ACCESS_KEY } from './module-access.decorator';

function makeContext(input: {
  moduleKey?: string;
  companyId?: string;
  userRole?: string;
  user?: { role?: string; isAdmin?: boolean; isMaster?: boolean };
}): ExecutionContext {
  const handler = () => undefined;
  if (input.moduleKey) {
    Reflect.defineMetadata(MODULE_ACCESS_KEY, input.moduleKey, handler);
  }

  const headers: Record<string, string> = {};
  if (input.companyId) {
    headers['x-company-id'] = input.companyId;
  }
  if (input.userRole) {
    headers['x-user-role'] = input.userRole;
  }

  const request = {
    headers,
    user: input.user,
  };

  return {
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('ModuleGuard', () => {
  const modulesService = {
    checkAccess: jest.fn(async (input: { moduleKey: string; isAdmin: boolean; companyId: string }) => {
      if (input.moduleKey === 'unknown_module') {
        return {
          companyId: input.companyId,
          moduleKey: input.moduleKey,
          allowed: false,
          reason: 'MODULE_NOT_FOUND',
          adminOnly: false,
          enabledByDefault: false,
          source: 'not_found',
        };
      }
      if (input.moduleKey === 'whatsapp') {
        return {
          companyId: input.companyId,
          moduleKey: input.moduleKey,
          allowed: false,
          reason: 'BLOCKED_NOT_ENABLED',
          adminOnly: false,
          enabledByDefault: false,
          source: 'plan',
        };
      }
      if (input.moduleKey === 'admin_panel' && !input.isAdmin) {
        return {
          companyId: input.companyId,
          moduleKey: input.moduleKey,
          allowed: false,
          reason: 'BLOCKED_ADMIN_ONLY',
          adminOnly: true,
          enabledByDefault: true,
          source: 'plan',
        };
      }
      return {
        companyId: input.companyId,
        moduleKey: input.moduleKey,
        allowed: true,
        reason: 'ALLOWED_PLAN',
        adminOnly: false,
        enabledByDefault: true,
        source: 'plan',
      };
    }),
  };
  const guard = new ModuleGuard(modulesService as never);

  it('delivery habilitado permite checkout', async () => {
    const context = makeContext({
      moduleKey: 'delivery',
      companyId: 'default-company',
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('modulo desabilitado bloqueia', async () => {
    const context = makeContext({
      moduleKey: 'whatsapp',
      companyId: 'default-company',
    });
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('modulo inexistente bloqueia com erro claro', async () => {
    const context = makeContext({
      moduleKey: 'unknown_module',
      companyId: 'default-company',
    });
    await expect(guard.canActivate(context)).rejects.toThrow('nao cadastrado na V2');
  });

  it('adminOnly bloqueia usuario comum', async () => {
    const context = makeContext({
      moduleKey: 'admin_panel',
      companyId: 'default-company',
      userRole: 'attendant',
    });
    await expect(guard.canActivate(context)).rejects.toThrow('exige perfil admin/master');
  });

  it('adminOnly permite admin', async () => {
    const context = makeContext({
      moduleKey: 'admin_panel',
      companyId: 'default-company',
      userRole: 'admin',
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
