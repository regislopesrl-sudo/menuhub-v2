import 'reflect-metadata';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { ModuleGuard } from './module.guard';
import { MODULE_ACCESS_KEY } from './module-access.decorator';

function makeContext(input: { moduleKey?: string; context?: any }): ExecutionContext {
  const handler = () => undefined;
  if (input.moduleKey) {
    Reflect.defineMetadata(MODULE_ACCESS_KEY, input.moduleKey, handler);
  }

  const request = {
    headers: { 'x-company-id': 'company_a' },
    context: input.context,
  };

  return {
    getHandler: () => handler,
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
});
