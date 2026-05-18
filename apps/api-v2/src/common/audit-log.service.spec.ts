import { AUDIT_ACTIONS } from './audit-log';
import { AuditLogService } from './audit-log.service';
import type { RequestContext } from './request-context';

const ctx: RequestContext = {
  companyId: 'company-a',
  branchId: 'branch-a',
  allowedBranchIds: ['branch-a'],
  userRole: 'owner',
  userId: 'user-a',
  requestId: 'req-a',
  permissions: [],
  source: 'jwt',
};

describe('AuditLogService', () => {
  it('grava evento sanitizado no banco', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'audit-a' });
    const service = new AuditLogService({ auditLog: { create } } as any);

    const result = await service.recordFromContext({
      action: AUDIT_ACTIONS.INVENTORY_MOVEMENT_CREATE,
      outcome: 'success',
      ctx,
      target: { type: 'inventory_item', id: 'item-a' },
      metadata: {
        quantity: 2,
        token: 'secret-token',
        nested: { cpf: '12345678900' },
      },
    });

    expect(result).toEqual({ recorded: true, id: 'audit-a' });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'company-a',
        branchId: 'branch-a',
        actorUserId: 'user-a',
        actorType: 'user',
        action: AUDIT_ACTIONS.INVENTORY_MOVEMENT_CREATE,
        outcome: 'success',
        targetType: 'inventory_item',
        targetId: 'item-a',
        metadata: {
          quantity: 2,
          token: '[REDACTED]',
          nested: { cpf: '[REDACTED]' },
        },
      }),
    });
  });

  it('nao derruba fluxo de negocio se auditoria falhar', async () => {
    const create = jest.fn().mockRejectedValue(new Error('db unavailable'));
    const service = new AuditLogService({ auditLog: { create } } as any);

    await expect(
      service.record({
        action: AUDIT_ACTIONS.REPORT_SNAPSHOT_CREATE,
        outcome: 'success',
        ctx,
      }),
    ).resolves.toEqual({ recorded: false, error: 'db unavailable' });
  });
});
