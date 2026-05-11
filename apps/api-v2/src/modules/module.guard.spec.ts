import 'reflect-metadata';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { ModuleGuard } from './module.guard';
import { MODULE_ACCESS_KEY } from './module-access.decorator';

function makeContext(input: { moduleKey?: string; classModuleKey?: string; context?: any }): ExecutionContext {
  const handler = () => undefined;
  class TestController {}
  if (input.moduleKey) {
    Reflect.defineMetadata(MODULE_ACCESS_KEY, input.moduleKey, handler);
  }
  if (input.classModuleKey) {
    Reflect.defineMetadata(MODULE_ACCESS_KEY, input.classModuleKey, TestController);
  }

  const request = {
    headers: { 'x-company-id': 'company_a' },
    context: input.context,
  };

  return {
    getHandler: () => handler,
    getClass: () => TestController,
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('ModuleGuard', () => {
  it('modulo permitido passa', async () => {
    const service = {
      checkAccess: jest.fn().mockResolvedValue({ allowed: true }),
    } as any;
    const guard = new ModuleGuard(service);
    await expect(
      guard.canActivate(
        makeContext({
          moduleKey: 'orders',
          context: { companyId: 'company_a', userRole: 'manager' },
        }),
      ),
    ).resolves.toBe(true);
  });

  it('modulo bloqueado falha', async () => {
    const service = {
      checkAccess: jest.fn().mockResolvedValue({ allowed: false, reason: 'BLOCKED_NOT_ENABLED' }),
    } as any;
    const guard = new ModuleGuard(service);
    await expect(
      guard.canActivate(
        makeContext({
          moduleKey: 'whatsapp',
          context: { companyId: 'company_a', userRole: 'manager' },
        }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('contexto platform ignora bloqueio de modulo', async () => {
    const service = {
      checkAccess: jest.fn(),
    } as any;
    const guard = new ModuleGuard(service);
    await expect(
      guard.canActivate(
        makeContext({
          moduleKey: 'whatsapp',
          context: {
            companyId: 'company_a',
            userRole: 'developer',
            source: 'technical-admin',
            permissions: ['*'],
          },
        }),
      ),
    ).resolves.toBe(true);
    expect(service.checkAccess).not.toHaveBeenCalled();
  });

  it('usa metadata de modulo no controller quando o handler nao define modulo', async () => {
    const service = {
      checkAccess: jest.fn().mockResolvedValue({ allowed: true }),
    } as any;
    const guard = new ModuleGuard(service);

    await expect(
      guard.canActivate(
        makeContext({
          classModuleKey: 'stock',
          context: { companyId: 'company_a', userRole: 'owner' },
        }),
      ),
    ).resolves.toBe(true);

    expect(service.checkAccess).toHaveBeenCalledWith({
      companyId: 'company_a',
      moduleKey: 'stock',
      isAdmin: true,
    });
  });
});
