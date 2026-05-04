import { ForbiddenException } from '@nestjs/common';
import { BillingController } from './billing.controller';

describe('BillingController', () => {
  const service = {
    getCompanyBilling: jest.fn(),
    upsertBillingAccount: jest.fn(),
    listInvoices: jest.fn(),
    createMockInvoice: jest.fn(),
    payMockInvoice: jest.fn(),
    createPaymentLink: jest.fn(),
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

  it('cria payment link para invoice da empresa atual', async () => {
    service.createPaymentLink.mockResolvedValueOnce({ provider: 'mock', status: 'PENDING' });
    await controller.createPaymentLink('i1', { companyId: 'c1', userRole: 'developer', requestId: 'r1' });
    expect(service.createPaymentLink).toHaveBeenCalledWith('i1', 'c1');
  });
});
