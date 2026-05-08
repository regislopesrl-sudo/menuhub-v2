import { BadRequestException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';

describe('OnboardingService', () => {
  const ctx = {
    companyId: 'company_a',
    branchId: 'branch_a',
    userRole: 'admin' as const,
    requestId: 'req_1',
    permissions: ['settings.write'],
  };

  function prismaMock() {
    return {
      branch: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'branch_a',
          companyId: 'company_a',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      },
      companySetting: {
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'setting_onboarding' }),
      },
    } as any;
  }

  it('retorna status com etapas padrao', async () => {
    const service = new OnboardingService(prismaMock());
    const status = await service.getStatus(ctx);

    expect(status.completed).toBe(false);
    expect(status.progress.total).toBeGreaterThan(0);
    expect(status.steps[0]).toEqual(
      expect.objectContaining({
        stepKey: expect.any(String),
        completed: false,
      }),
    );
  });

  it('conclui etapa e atualiza progresso', async () => {
    const prisma = prismaMock();
    prisma.companySetting.findFirst
      .mockResolvedValueOnce({ value: {} })
      .mockResolvedValueOnce({ value: { completedSteps: ['company_profile'] } });
    const service = new OnboardingService(prisma);

    const status = await service.patchStep(ctx, 'company_profile', true);

    expect(prisma.companySetting.upsert).toHaveBeenCalled();
    expect(status.progress.done).toBe(1);
  });

  it('falha para stepKey invalido', async () => {
    const service = new OnboardingService(prismaMock());

    await expect(service.patchStep(ctx, 'invalid_step' as any, true)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('bloqueia conclusao fora de ordem quando ha prerequisito pendente', async () => {
    const prisma = prismaMock();
    prisma.companySetting.findFirst.mockResolvedValueOnce({ value: { completedSteps: ['company_profile'] } });
    const service = new OnboardingService(prisma);

    await expect(service.patchStep(ctx, 'payment_methods', true)).rejects.toThrow(
      "Etapa 'payment_methods' exige conclusao previa de: branch_profile, operation_hours.",
    );
  });

  it('permite desmarcar etapa mesmo com etapas seguintes concluidas', async () => {
    const prisma = prismaMock();
    prisma.companySetting.findFirst
      .mockResolvedValueOnce({
        value: {
          completedSteps: ['company_profile', 'branch_profile', 'operation_hours'],
        },
      })
      .mockResolvedValueOnce({
        value: {
          completedSteps: ['company_profile', 'operation_hours'],
        },
      });
    const service = new OnboardingService(prisma);

    const status = await service.patchStep(ctx, 'branch_profile', false);

    expect(status.progress.done).toBe(2);
    expect(prisma.companySetting.upsert).toHaveBeenCalled();
  });
});
