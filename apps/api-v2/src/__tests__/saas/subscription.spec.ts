import { UnauthorizedException } from '@nestjs/common';
import { DeveloperController } from '../../developer/developer.controller';
import { canUseModules } from '../../subscriptions/domain/can-use-modules';
import { signTechnicalToken } from '../../common/technical-auth';

describe('SaaS Subscription Flow', () => {
  const headers = {
    'x-developer-session': signTechnicalToken({ sub: 'developer-code', email: 'developer@local', role: 'DEVELOPER_SESSION' }),
  };

  it('criar ACTIVE', async () => {
    const prisma = {
      plan: {
        findFirst: jest.fn().mockResolvedValue({ id: 'p1' }),
      },
      companySubscription: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 's1', status: 'ACTIVE' }),
      },
    };
    const controller = new DeveloperController(prisma as never);

    const result = await controller.createCompanySubscription(
      'c1',
      {
        planId: 'p1',
        status: 'ACTIVE',
        startsAt: '2026-01-01T00:00:00.000Z',
      },
      headers,
    );

    expect(result.id).toBe('s1');
  });

  it('impedir 2 ACTIVE', async () => {
    const prisma = {
      plan: {
        findFirst: jest.fn().mockResolvedValue({ id: 'p1' }),
      },
      companySubscription: {
        findFirst: jest.fn().mockResolvedValue({ id: 'old-active' }),
        create: jest.fn(),
      },
    };
    const controller = new DeveloperController(prisma as never);

    await expect(
      controller.createCompanySubscription('c1', {
        planId: 'p1',
        status: 'ACTIVE',
        startsAt: '2026-01-01T00:00:00.000Z',
      }, headers),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('expirar assinatura bloqueia uso de modulos', () => {
    expect(canUseModules('EXPIRED')).toBe(false);
    expect(canUseModules('ACTIVE')).toBe(true);
  });
});
