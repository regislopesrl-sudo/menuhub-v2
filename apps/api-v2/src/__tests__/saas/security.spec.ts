import { ForbiddenException } from '@nestjs/common';
import { assertSameCompany } from '../../common/assert-same-company';
import { BillingController } from '../../billing/billing.controller';

describe('SaaS Security', () => {
  it('acessar outra empresa -> 403', async () => {
    const billingService = {
      getCompanyBilling: jest.fn(),
    };
    const controller = new BillingController(billingService as never);

    await expect(
      controller.getBilling('company-b', {
        companyId: 'company-a',
        userRole: 'developer',
        requestId: 'r1',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('alterar modulo de outra empresa -> 403', () => {
    expect(() => assertSameCompany('company-a', 'company-b')).toThrow(ForbiddenException);
  });
});
