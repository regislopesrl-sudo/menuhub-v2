import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentsService } from './payments.service';

describe('PaymentsService webhook', () => {
  function build(overrides?: {
    provider?: any;
    orderRepository?: any;
    ordersEvents?: any;
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
    return {
      service: new PaymentsService(provider, orderRepository, ordersEvents),
      provider,
      orderRepository,
      ordersEvents,
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
    const { service, provider } = build({
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
});
