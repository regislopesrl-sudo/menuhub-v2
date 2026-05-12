import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentsService } from './payments.service';

describe('PaymentsService webhook', () => {
  function build(overrides?: {
    provider?: any;
    orderRepository?: any;
    ordersEvents?: any;
    prisma?: any;
  }) {
    const provider = overrides?.provider ?? {
      providerName: 'mock',
      createPixPayment: jest.fn(),
      getPaymentStatus: jest.fn(),
      handleWebhook: jest.fn(),
    };
    const orderRepository = overrides?.orderRepository ?? {
      findByProviderPaymentIdCandidates: jest.fn().mockResolvedValue([]),
      findByProviderPaymentId: jest.fn(),
      applyWebhookPaymentUpdate: jest.fn(),
      findByProviderPaymentIdForCompany: jest.fn(),
    };
    const ordersEvents = overrides?.ordersEvents ?? {
      emitOrderStatusUpdated: jest.fn(),
    };
    const prisma = overrides?.prisma ?? {
      order: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      billingWebhookEvent: {
        create: jest.fn().mockResolvedValue({ id: 'evt_db_1' }),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    return {
      service: new PaymentsService(provider, orderRepository, ordersEvents, prisma),
      provider,
      orderRepository,
      ordersEvents,
      prisma,
    };
  }

  it('provider invalido bloqueia webhook', async () => {
    const { service } = build();
    await expect(
      service.handleWebhook('stripe', { eventId: 'x', providerPaymentId: 'p1', status: 'PENDING' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('endpoint retorna status por providerPaymentId', async () => {
    const { service } = build({
      orderRepository: {
        findByProviderPaymentIdCandidates: jest.fn().mockResolvedValue([]),
        findByProviderPaymentId: jest.fn(),
        applyWebhookPaymentUpdate: jest.fn(),
        findByProviderPaymentIdForCompany: jest.fn().mockResolvedValue({
          id: 'ord_1',
          orderNumber: 'V2-123',
          status: 'CONFIRMED',
          paymentStatus: 'PAID',
        }),
      },
    });

    const result = await service.getPaymentStatusByProviderPaymentId('pay_1', {
      companyId: 'c1',
      userRole: 'user',
      requestId: 'r1',
    });

    expect(result).toEqual({
      providerPaymentId: 'pay_1',
      paymentStatus: 'PAID',
      orderStatus: 'CONFIRMED',
      orderId: 'ord_1',
      orderNumber: 'V2-123',
    });
  });

  it('endpoint bloqueia pedido de outra empresa', async () => {
    const repo = {
      findByProviderPaymentIdCandidates: jest.fn().mockResolvedValue([]),
      findByProviderPaymentId: jest.fn(),
      applyWebhookPaymentUpdate: jest.fn(),
      findByProviderPaymentIdForCompany: jest.fn().mockResolvedValue(null),
    };
    const { service } = build({ orderRepository: repo });

    await expect(
      service.getPaymentStatusByProviderPaymentId('pay_other_company', {
        companyId: 'company_a',
        userRole: 'user',
        requestId: 'req_1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('payload invalido bloqueia webhook', async () => {
    const { service } = build();
    await expect(service.handleWebhook('mock', null)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('webhook duplicado e ignorado', async () => {
    const createMock = jest
      .fn()
      .mockResolvedValueOnce({ id: 'evt_db_1' })
      .mockRejectedValueOnce({ code: 'P2002' });
    const { service, provider, prisma } = build({
      provider: {
        providerName: 'mock',
        createPixPayment: jest.fn(),
        getPaymentStatus: jest.fn(),
        handleWebhook: jest.fn().mockResolvedValue({
          provider: 'mock',
          providerPaymentId: 'pay_1',
          eventId: 'evt_1',
          status: 'PENDING',
          processed: true,
        }),
      },
      prisma: {
        billingWebhookEvent: {
          create: createMock,
          findUnique: jest.fn().mockResolvedValue({ processedAt: new Date('2026-01-01T00:00:00.000Z') }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      },
    });

    const first = await service.handleWebhook('mock', {
      eventId: 'evt_1',
      providerPaymentId: 'pay_1',
      status: 'PENDING',
    });
    const second = await service.handleWebhook('mock', {
      eventId: 'evt_1',
      providerPaymentId: 'pay_1',
      status: 'PENDING',
    });

    expect(first.processed).toBe(true);
    expect(second.processed).toBe(false);
    expect(second.reason).toBe('DUPLICATE_EVENT');
    expect(provider.handleWebhook).toHaveBeenCalledTimes(1);
    expect(prisma.billingWebhookEvent.create).toHaveBeenCalledTimes(2);
  });

  it('marca processedAt apenas apos sucesso', async () => {
    const provider = {
      providerName: 'mock',
      createPixPayment: jest.fn(),
      getPaymentStatus: jest.fn(),
      handleWebhook: jest.fn().mockResolvedValue({
        provider: 'mock',
        providerPaymentId: 'pay_ok',
        eventId: 'evt_ok',
        status: 'PENDING',
        processed: true,
      }),
    };
    const prisma = {
      billingWebhookEvent: {
        create: jest.fn().mockResolvedValue({ id: 'evt_db_1' }),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const { service } = build({ provider, prisma });

    await service.handleWebhook('mock', {
      eventId: 'evt_ok',
      providerPaymentId: 'pay_ok',
      status: 'PENDING',
    });

    expect(provider.handleWebhook).toHaveBeenCalledTimes(1);
    expect(prisma.billingWebhookEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { provider: 'mock', eventId: 'evt_ok', processedAt: null },
      }),
    );
  });

  it('salva payload de webhook sanitizado sem dados sensiveis', async () => {
    const { service, prisma } = build({
      provider: {
        providerName: 'mock',
        createPixPayment: jest.fn(),
        getPaymentStatus: jest.fn(),
        handleWebhook: jest.fn().mockResolvedValue({
          provider: 'mock',
          providerPaymentId: 'pay_safe',
          eventId: 'evt_safe',
          status: 'PENDING',
          processed: true,
        }),
      },
    });

    await service.handleWebhook('mock', {
      eventId: 'evt_safe',
      providerPaymentId: 'pay_safe',
      status: 'PENDING',
      cardNumber: '4111111111111111',
      cvv: '123',
      customer: { email: 'cliente@local.test', phone: '11999999999' },
    });

    expect(prisma.billingWebhookEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payloadJson: expect.objectContaining({
            cardNumber: '[REDACTED]',
            cvv: '[REDACTED]',
            customer: {
              email: '[REDACTED]',
              phone: '[REDACTED]',
            },
          }),
        }),
      }),
    );
  });

  it('falha do provider nao queima evento e libera retry', async () => {
    const provider = {
      providerName: 'mock',
      createPixPayment: jest.fn(),
      getPaymentStatus: jest.fn(),
      handleWebhook: jest.fn().mockRejectedValue(new Error('temporary failure')),
    };
    const prisma = {
      billingWebhookEvent: {
        create: jest.fn().mockResolvedValue({ id: 'evt_db_1' }),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const { service } = build({ provider, prisma });

    await expect(
      service.handleWebhook('mock', {
        eventId: 'evt_fail',
        providerPaymentId: 'pay_fail',
        status: 'PENDING',
      }),
    ).rejects.toThrow('temporary failure');

    expect(prisma.billingWebhookEvent.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { provider: 'mock', eventId: 'evt_fail', processedAt: null },
      }),
    );
    expect(prisma.billingWebhookEvent.updateMany).not.toHaveBeenCalled();
  });

  it('evento existente sem processedAt tenta reprocessar', async () => {
    const createMock = jest.fn().mockRejectedValue({ code: 'P2002' });
    const provider = {
      providerName: 'mock',
      createPixPayment: jest.fn(),
      getPaymentStatus: jest.fn(),
      handleWebhook: jest.fn().mockResolvedValue({
        provider: 'mock',
        providerPaymentId: 'pay_retry',
        eventId: 'evt_retry',
        status: 'PENDING',
        processed: true,
      }),
    };
    const prisma = {
      billingWebhookEvent: {
        create: createMock,
        findUnique: jest.fn().mockResolvedValue({ processedAt: null }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const { service } = build({ provider, prisma });

    const result = await service.handleWebhook('mock', {
      eventId: 'evt_retry',
      providerPaymentId: 'pay_retry',
      status: 'PENDING',
    });

    expect(result.processed).toBe(true);
    expect(provider.handleWebhook).toHaveBeenCalledTimes(1);
  });

  it('webhook APPROVED atualiza pedido e emite evento', async () => {
    const { service, orderRepository, ordersEvents } = build({
      provider: {
        providerName: 'mock',
        createPixPayment: jest.fn(),
        getPaymentStatus: jest.fn(),
        handleWebhook: jest.fn().mockResolvedValue({
          provider: 'mock',
          providerPaymentId: 'pay_approved',
          eventId: 'evt_ok',
          status: 'APPROVED',
          processed: true,
        }),
      },
      orderRepository: {
        findByProviderPaymentIdCandidates: jest.fn().mockResolvedValue([]),
        findByProviderPaymentId: jest.fn().mockResolvedValue({
          id: 'ord_1',
          status: 'PENDING_CONFIRMATION',
        }),
        applyWebhookPaymentUpdate: jest.fn().mockResolvedValue({
          id: 'ord_1',
          companyId: 'c1',
          branchId: 'b1',
          orderNumber: 'V2-1',
          status: 'CONFIRMED',
        }),
      },
      ordersEvents: {
        emitOrderStatusUpdated: jest.fn().mockResolvedValue(undefined),
      },
    });

    await service.handleWebhook('mock', {
      eventId: 'evt_ok',
      providerPaymentId: 'pay_approved',
      status: 'APPROVED',
    });

    expect(orderRepository.applyWebhookPaymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'ord_1',
        paymentStatus: 'APPROVED',
      }),
    );
    expect(ordersEvents.emitOrderStatusUpdated).toHaveBeenCalledTimes(1);
  });

  it('webhook DECLINED atualiza pedido corretamente', async () => {
    const { service, orderRepository } = build({
      provider: {
        providerName: 'mock',
        createPixPayment: jest.fn(),
        getPaymentStatus: jest.fn(),
        handleWebhook: jest.fn().mockResolvedValue({
          provider: 'mock',
          providerPaymentId: 'pay_declined',
          eventId: 'evt_declined',
          status: 'DECLINED',
          processed: true,
        }),
      },
      orderRepository: {
        findByProviderPaymentIdCandidates: jest.fn().mockResolvedValue([]),
        findByProviderPaymentId: jest.fn().mockResolvedValue({
          id: 'ord_2',
          status: 'PENDING_CONFIRMATION',
        }),
        applyWebhookPaymentUpdate: jest.fn().mockResolvedValue({
          id: 'ord_2',
          companyId: 'c1',
          branchId: 'b1',
          orderNumber: 'V2-2',
          status: 'PENDING_CONFIRMATION',
        }),
      },
    });

    await service.handleWebhook('mock', {
      eventId: 'evt_declined',
      providerPaymentId: 'pay_declined',
      status: 'DECLINED',
    });

    expect(orderRepository.applyWebhookPaymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'ord_2',
        paymentStatus: 'DECLINED',
      }),
    );
  });

  it('pedido nao encontrado retorna erro claro', async () => {
    const { service } = build({
      provider: {
        providerName: 'mock',
        createPixPayment: jest.fn(),
        getPaymentStatus: jest.fn(),
        handleWebhook: jest.fn().mockResolvedValue({
          provider: 'mock',
          providerPaymentId: 'missing',
          eventId: 'evt_missing',
          status: 'APPROVED',
          processed: true,
        }),
      },
      orderRepository: {
        findByProviderPaymentIdCandidates: jest.fn().mockResolvedValue([]),
        findByProviderPaymentId: jest.fn().mockResolvedValue(null),
        applyWebhookPaymentUpdate: jest.fn(),
      },
    });

    await expect(
      service.handleWebhook('mock', {
        eventId: 'evt_missing',
        providerPaymentId: 'missing',
        status: 'APPROVED',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('gera conciliacao mock com escopo de company e branch sem payload sensivel', async () => {
    const prisma = {
      order: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'ord_paid',
            orderNumber: 'V2-1',
            status: 'CONFIRMED',
            paymentStatus: 'PAID',
            totalAmount: 50,
            paidAmount: 50,
            refundedAmount: 0,
            internalNotes: JSON.stringify({
              payment: {
                provider: 'mock',
                providerPaymentId: 'pix_1',
                status: 'APPROVED',
                method: 'PIX',
                rawPayload: { cardNumber: '4111111111111111' },
              },
            }),
            createdAt: new Date('2026-05-01T10:00:00.000Z'),
            updatedAt: new Date('2026-05-01T10:05:00.000Z'),
          },
          {
            id: 'ord_mismatch',
            orderNumber: 'V2-2',
            status: 'PENDING_CONFIRMATION',
            paymentStatus: 'UNPAID',
            totalAmount: 30,
            paidAmount: 0,
            refundedAmount: 0,
            internalNotes: JSON.stringify({
              payment: { provider: 'mock', providerPaymentId: 'pix_2', status: 'APPROVED', method: 'PIX' },
            }),
            createdAt: new Date('2026-05-01T11:00:00.000Z'),
            updatedAt: new Date('2026-05-01T11:05:00.000Z'),
          },
          {
            id: 'ord_missing',
            orderNumber: 'V2-3',
            status: 'CONFIRMED',
            paymentStatus: 'UNPAID',
            totalAmount: 20,
            paidAmount: 0,
            refundedAmount: 0,
            internalNotes: '{}',
            createdAt: new Date('2026-05-01T12:00:00.000Z'),
            updatedAt: new Date('2026-05-01T12:05:00.000Z'),
          },
        ]),
      },
      billingWebhookEvent: {
        create: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    const { service } = build({ prisma });

    const result = await service.getMockReconciliation(
      { companyId: 'company_a', branchId: 'branch_a', userRole: 'owner', requestId: 'req_1' },
      { dateFrom: '2026-05-01T00:00:00.000Z', dateTo: '2026-05-02T00:00:00.000Z', limit: 25 },
    );

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId: 'company_a',
          branchId: 'branch_a',
          createdAt: {
            gte: new Date('2026-05-01T00:00:00.000Z'),
            lte: new Date('2026-05-02T00:00:00.000Z'),
          },
        },
        take: 25,
      }),
    );
    expect(result.summary).toEqual({
      totalOrders: 3,
      reconciled: 1,
      pending: 0,
      missingPaymentSnapshot: 1,
      statusMismatch: 1,
      totalAmount: 100,
      paidAmount: 50,
      refundedAmount: 0,
    });
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        providerPaymentId: 'pix_1',
        providerStatus: 'APPROVED',
        divergence: 'reconciled',
      }),
    );
    expect(JSON.stringify(result)).not.toContain('4111111111111111');
  });

  it('conciliacao mock limita take e valida filtros', async () => {
    const { service, prisma } = build({
      prisma: {
        order: { findMany: jest.fn().mockResolvedValue([]) },
        billingWebhookEvent: {
          create: jest.fn(),
          findUnique: jest.fn(),
          updateMany: jest.fn(),
          deleteMany: jest.fn(),
        },
      },
    });

    await service.getMockReconciliation(
      { companyId: 'company_a', userRole: 'owner', requestId: 'req_1' },
      { limit: 999 },
    );
    expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 200 }));

    await expect(
      service.getMockReconciliation(
        { companyId: 'company_a', userRole: 'owner', requestId: 'req_1' },
        { limit: 0 },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getMockReconciliation(
        { companyId: 'company_a', userRole: 'owner', requestId: 'req_1' },
        { dateFrom: 'data-invalida' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
