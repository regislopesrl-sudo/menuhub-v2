import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { BillingController } from './billing.controller';
import * as auditRecorder from '../common/audit-log-recorder';

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
  const auditSpy = jest.spyOn(auditRecorder, 'recordAuditFromContext').mockImplementation(() => undefined);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('bloqueia cross-company no endpoint billing', async () => {
    await expect(
      controller.getBilling('c2', {
        companyId: 'c1',
        userRole: 'developer',
        requestId: 'r1',
        permissions: ['billing.read'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('permite developer e chama service', async () => {
    service.listInvoices.mockResolvedValueOnce([]);
    await controller.listInvoices('c1', {
      companyId: 'c1',
      userRole: 'developer',
      requestId: 'r1',
      permissions: ['billing.read'],
    });
    expect(service.listInvoices).toHaveBeenCalledWith('c1');
  });

  it('permite contexto platform consultar billing de outra empresa', async () => {
    service.getCompanyBilling.mockResolvedValueOnce({ companyId: 'c2' });
    await controller.getBilling('c2', {
      companyId: 'c1',
      userRole: 'developer',
      source: 'technical-admin',
      requestId: 'r1',
      permissions: ['*'],
    });
    expect(service.getCompanyBilling).toHaveBeenCalledWith('c2');
  });

  it('cria payment link para invoice da empresa atual', async () => {
    service.createPaymentLink.mockResolvedValueOnce({ provider: 'mock', status: 'PENDING' });
    await controller.createPaymentLink('i1', {
      companyId: 'c1',
      userRole: 'developer',
      requestId: 'r1',
      permissions: ['billing.manage'],
    });
    expect(service.createPaymentLink).toHaveBeenCalledWith('i1', 'c1');
  });

  it('executa ciclo de billing para a empresa atual', async () => {
    service.runBillingCycle.mockResolvedValueOnce({ companyId: 'c1' });
    await controller.runBillingCycle(
      'c1',
      { referenceDate: '2026-05-04T00:00:00.000Z' },
      {
        companyId: 'c1',
        userRole: 'developer',
        requestId: 'r1',
        permissions: ['billing.manage'],
      },
    );
    expect(service.runBillingCycle).toHaveBeenCalledWith('c1', '2026-05-04T00:00:00.000Z');
  });

  it('bloqueia billing.manage quando contexto possui somente platform:billing:read', async () => {
    await expect(
      controller.runBillingCycle(
        'c1',
        { referenceDate: '2026-05-04T00:00:00.000Z' },
        {
          companyId: 'c1',
          userRole: 'developer',
          source: 'jwt',
          requestId: 'r1',
          permissions: ['platform:billing:read'],
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('billing account update com payload vazio bloqueia', async () => {
    await expect(
      controller.upsertBillingAccount(
        'c1',
        // @ts-expect-error edge-case runtime validation
        {},
        {
          companyId: 'c1',
          userRole: 'developer',
          source: 'jwt',
          requestId: 'r1',
          permissions: ['billing.manage'],
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('mock payment de invoice inexistente propaga erro esperado', async () => {
    service.payMockInvoice.mockRejectedValueOnce(new BadRequestException('Fatura nao encontrada.'));
    await expect(
      controller.payMockInvoice('inv_missing', {
        companyId: 'c1',
        userRole: 'developer',
        source: 'jwt',
        requestId: 'r1',
        permissions: ['billing.manage'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'platform.billing.mock_payment',
        outcome: 'failure',
      }),
    );
  });

  it('platform:billing:read nao executa mock payment', async () => {
    await expect(
      controller.payMockInvoice('inv_1', {
        companyId: 'c1',
        userRole: 'developer',
        source: 'jwt',
        requestId: 'r1',
        permissions: ['platform:billing:read'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('platform:billing:manage executa mock payment', async () => {
    service.payMockInvoice.mockResolvedValueOnce({ id: 'inv_1', status: 'PAID' });
    await controller.payMockInvoice('inv_1', {
      companyId: 'c1',
      userRole: 'developer',
      source: 'jwt',
      requestId: 'r1',
      permissions: ['platform:billing:manage'],
    });
    expect(service.payMockInvoice).toHaveBeenCalledWith('inv_1', 'c1');
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'platform.billing.mock_payment',
        outcome: 'success',
      }),
    );
  });
});
