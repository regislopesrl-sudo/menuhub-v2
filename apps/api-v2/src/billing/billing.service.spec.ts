import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BillingService } from './billing.service';

describe('BillingService', () => {
  function createService() {
    const prisma = {
      company: { findUnique: jest.fn().mockResolvedValue({ id: 'c1', name: 'Empresa', legalName: 'Empresa LTDA' }) },
      billingAccount: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'ba1', companyId: 'c1', billingEmail: 'billing@x.com' }),
      },
      companySubscription: {
        findFirst: jest.fn().mockResolvedValue({
          id: 's1',
          companyId: 'c1',
          status: 'ACTIVE',
          plan: { id: 'p1', key: 'pro', name: 'Pro' },
        }),
        update: jest.fn().mockResolvedValue({ id: 's1', status: 'ACTIVE' }),
      },
      invoice: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'i1', companyId: 'c1', status: 'OPEN', amountCents: 19900, items: [], attempts: [] }),
        findUnique: jest.fn().mockResolvedValue({ id: 'i1', companyId: 'c1', subscriptionId: 's1' }),
        update: jest.fn().mockResolvedValue({ id: 'i1', companyId: 'c1', status: 'PAID', attempts: [{ id: 'pa1', status: 'SUCCEEDED' }], items: [] }),
      },
      paymentAttempt: {
        create: jest.fn().mockResolvedValue({ id: 'pa1', status: 'SUCCEEDED' }),
      },
    };

    return { prisma, service: new BillingService(prisma as never) };
  }

  it('cria billing account', async () => {
    const { service, prisma } = createService();
    await service.upsertBillingAccount('c1', { billingEmail: 'billing@x.com' });
    expect(prisma.billingAccount.upsert).toHaveBeenCalled();
  });

  it('gera invoice mock', async () => {
    const { service, prisma } = createService();
    await service.createMockInvoice('c1');
    expect(prisma.invoice.create).toHaveBeenCalled();
  });

  it('paga invoice mock e cria payment_attempt', async () => {
    const { service, prisma } = createService();
    const result = await service.payMockInvoice('i1', 'c1');
    expect(result.status).toBe('PAID');
    expect(prisma.paymentAttempt.create).toHaveBeenCalled();
  });

  it('bloqueia acesso cross-company', async () => {
    const { service } = createService();
    await expect(service.payMockInvoice('i1', 'c2')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('bloqueia gerar fatura sem assinatura ativa', async () => {
    const { service, prisma } = createService();
    prisma.companySubscription.findFirst.mockResolvedValueOnce({ id: 's1', companyId: 'c1', status: 'CANCELED', plan: { id: 'p1', key: 'pro', name: 'Pro' } });
    await expect(service.createMockInvoice('c1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
