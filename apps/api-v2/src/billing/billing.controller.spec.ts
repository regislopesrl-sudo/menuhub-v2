import { ForbiddenException } from '@nestjs/common';
import { BillingController } from './billing.controller';

describe('BillingController', () => {
  const service = {
    getCompanyBilling: jest.fn(),
    upsertBillingAccount: jest.fn(),
    listInvoices: jest.fn(),
    createMockInvoice: jest.fn(),
    payMockInvoice: jest.fn(),
  };
  const controller = new BillingController(service as never);

  it('bloqueia cross-company no endpoint billing', async () => {
    await expect(
      controller.getBilling('c2', { companyId: 'c1', userRole: 'developer', requestId: 'r1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('permite developer e chama service', async () => {
    service.listInvoices.mockResolvedValueOnce([]);
    await controller.listInvoices('c1', { companyId: 'c1', userRole: 'developer', requestId: 'r1' });
    expect(service.listInvoices).toHaveBeenCalledWith('c1');
  });
});
