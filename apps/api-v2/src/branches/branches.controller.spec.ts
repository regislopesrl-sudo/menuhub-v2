import { BadRequestException } from '@nestjs/common';
import * as auditRecorder from '../common/audit-log-recorder';
import { BranchesController } from './branches.controller';

describe('BranchesController', () => {
  const service = {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const controller = new BranchesController(service as any);
  const auditSpy = jest.spyOn(auditRecorder, 'recordAuditFromContext').mockImplementation(() => undefined);
  const ctx = {
    companyId: 'company_a',
    userRole: 'admin',
    requestId: 'r1',
    permissions: ['settings.write'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('list repassa service', async () => {
    service.list.mockResolvedValueOnce({ items: [], total: 0 });
    const result = await controller.list(ctx as any);
    expect(result.total).toBe(0);
    expect(service.list).toHaveBeenCalledWith(ctx);
  });

  it('create registra audit success', async () => {
    service.create.mockResolvedValueOnce({ id: 'b1', name: 'Loja Centro' });
    await controller.create(ctx as any, { name: 'Loja Centro' });
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'settings.update',
        outcome: 'success',
      }),
    );
  });

  it('create registra audit failure', async () => {
    service.create.mockRejectedValueOnce(new BadRequestException('name obrigatorio.'));
    await expect(controller.create(ctx as any, { name: '' })).rejects.toBeInstanceOf(BadRequestException);
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'settings.update',
        outcome: 'failure',
      }),
    );
  });
});
