import { ForbiddenException } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { signTechnicalToken } from '../common/technical-auth';
import { UnauthorizedException } from '@nestjs/common';

describe('BillingController', () => {
  const service = {
    getCompanyBilling: jest.fn(),
    upsertBillingAccount: jest.fn(),
    listInvoices: jest.fn(),
    createMockInvoice: jest.fn(),
    payMockInvoice: jest.fn(),
    createPaymentLink: jest.fn(),
    runBillingCycle: jest.fn(),
  };
  const controller = new BillingController(service as never);
  const devHeaders = {
    'x-developer-session': signTechnicalToken({ sub: 'developer-code', email: 'developer@local', role: 'DEVELOPER_SESSION' }),
  };

  it('bloqueia cross-company no endpoint billing', async () => {
    await expect(
      controller.getBilling('c2', { companyId: 'c1', userRole: 'developer', requestId: 'r1' }, devHeaders),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('permite developer e chama service', async () => {
    service.listInvoices.mockResolvedValueOnce([]);
    await controller.listInvoices('c1', { companyId: 'c1', userRole: 'developer', requestId: 'r1' }, devHeaders);
    expect(service.listInvoices).toHaveBeenCalledWith('c1');
  });

  it('cria payment link para invoice da empresa atual', async () => {
    service.createPaymentLink.mockResolvedValueOnce({ provider: 'mock', status: 'PENDING' });
    await controller.createPaymentLink('i1', { companyId: 'c1', userRole: 'developer', requestId: 'r1' }, devHeaders);
    expect(service.createPaymentLink).toHaveBeenCalledWith('i1', 'c1');
  });

  it('executa ciclo de billing para a empresa atual', async () => {
    service.runBillingCycle.mockResolvedValueOnce({ companyId: 'c1' });
    await controller.runBillingCycle(
      'c1',
      { referenceDate: '2026-05-04T00:00:00.000Z' },
      { companyId: 'c1', userRole: 'developer', requestId: 'r1' },
      devHeaders,
    );
    expect(service.runBillingCycle).toHaveBeenCalledWith('c1', '2026-05-04T00:00:00.000Z');
  });

  it('sem sessao tecnica falha com 401', async () => {
    await expect(
      controller.listInvoices('c1', { companyId: 'c1', userRole: 'developer', requestId: 'r1' }, {}),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
