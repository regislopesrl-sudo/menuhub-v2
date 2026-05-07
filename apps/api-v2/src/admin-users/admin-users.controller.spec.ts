import { AdminUsersController } from './admin-users.controller';
import * as auditRecorder from '../common/audit-log-recorder';

describe('AdminUsersController', () => {
  const service = {
    createUser: jest.fn(),
    updateUser: jest.fn(),
  };

  const controller = new AdminUsersController(service as never);
  const auditSpy = jest.spyOn(auditRecorder, 'recordAuditFromContext').mockImplementation(() => undefined);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('createUser registra evento de auditoria em sucesso', async () => {
    service.createUser.mockResolvedValueOnce({ id: 'u1', email: 'user@menuhub.local', name: 'User 1' });

    await controller.createUser(
      { companyId: 'c1', userRole: 'admin', requestId: 'r1', permissions: ['admin.users.write'] },
      { name: 'User 1', email: 'user@menuhub.local', password: 'secret123' } as never,
    );

    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.user.create',
        outcome: 'success',
      }),
    );
  });

  it('updateUser registra evento de auditoria em sucesso', async () => {
    service.updateUser.mockResolvedValueOnce({ id: 'u1', email: 'user@menuhub.local', name: 'User 1' });

    await controller.updateUser(
      'u1',
      { companyId: 'c1', userRole: 'admin', requestId: 'r1', permissions: ['admin.users.write'] },
      { name: 'User 1 updated' } as never,
    );

    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.user.update',
        outcome: 'success',
      }),
    );
  });
});

