import { BadRequestException } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import * as auditRecorder from '../common/audit-log-recorder';

describe('SettingsController', () => {
  const service = {
    patchCompany: jest.fn(),
    patchBranch: jest.fn(),
    patchOperation: jest.fn(),
    patchPayments: jest.fn(),
  };

  const controller = new SettingsController(service as never);
  const auditSpy = jest.spyOn(auditRecorder, 'recordAuditFromContext').mockImplementation(() => undefined);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('patchCompany registra auditoria em sucesso', async () => {
    service.patchCompany.mockResolvedValueOnce({ success: true });

    await controller.patchCompany(
      { companyId: 'c1', userRole: 'admin', requestId: 'r1', permissions: ['settings.write'] },
      { tradeName: 'MenuHub' } as never,
    );

    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'settings.update',
        outcome: 'success',
      }),
    );
  });

  it('patchPayments registra auditoria em falha', async () => {
    service.patchPayments.mockRejectedValueOnce(new BadRequestException('payload invalido'));

    await expect(
      controller.patchPayments(
        { companyId: 'c1', userRole: 'admin', requestId: 'r1', permissions: ['settings.write'] },
        {} as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'settings.update',
        outcome: 'failure',
      }),
    );
  });
});

