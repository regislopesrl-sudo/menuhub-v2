import { BadRequestException } from '@nestjs/common';
import * as auditRecorder from '../common/audit-log-recorder';
import { OnboardingController } from './onboarding.controller';

describe('OnboardingController', () => {
  const service = {
    getStatus: jest.fn(),
    patchStep: jest.fn(),
    reset: jest.fn(),
  };
  const controller = new OnboardingController(service as never);
  const auditSpy = jest.spyOn(auditRecorder, 'recordAuditFromContext').mockImplementation(() => undefined);

  const ctx = {
    companyId: 'company_a',
    branchId: 'branch_a',
    userRole: 'admin',
    requestId: 'req_1',
    permissions: ['settings.write'],
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('patchStep registra auditoria de sucesso', async () => {
    service.patchStep.mockResolvedValueOnce({ completed: false, steps: [] });

    await controller.patchStep(ctx, 'company_profile' as any, { completed: true });

    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'onboarding.step.update',
        outcome: 'success',
      }),
    );
  });

  it('patchStep registra auditoria de falha', async () => {
    service.patchStep.mockRejectedValueOnce(new BadRequestException('invalid'));

    await expect(controller.patchStep(ctx, 'invalid' as any, { completed: true })).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'onboarding.step.update',
        outcome: 'failure',
      }),
    );
  });

  it('reset registra auditoria de sucesso', async () => {
    service.reset.mockResolvedValueOnce({ completed: false, steps: [] });

    await controller.reset(ctx);

    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'onboarding.reset',
        outcome: 'success',
      }),
    );
  });
});
