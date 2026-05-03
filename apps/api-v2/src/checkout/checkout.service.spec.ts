import type { MenuPort } from '@delivery-futuro/order-core';
import { BadRequestException } from '@nestjs/common';
import { CheckoutService } from './checkout.service';

describe('CheckoutService', () => {
  const ctx = {
    companyId: 'company_a',
    userRole: 'admin' as const,
    requestId: 'req_1',
    channel: 'delivery' as const,
  };

  function quoteOk(override: Record<string, unknown> = {}) {
    return {
      available: true,
      quoteId: 'q1',
      requestId: 'req_1',
      areaId: 'area-1',
      fee: 7.5,
      estimatedMinutes: 30,
      minimumOrder: null,
      areaName: 'Centro',
      reason: null,
      message: null,
      distanceMeters: 2400,
      distanceKm: 2.4,
      durationSeconds: 600,
      address: { lat: -23.55, lng: -46.63 },
      ...override,
    };
  }

  function build(menuPort: MenuPort, quoteService: any, repo?: any, paymentsService?: any) {
    return new CheckoutService(
      menuPort,
      { authorizePayment: jest.fn().mockResolvedValue({ status: 'APPROVED', transactionId: 'txn_1' }) } as any,
      quoteService,
      paymentsService ?? {
        createPixPayment: jest.fn().mockResolvedValue({
          id: 'pix_1', provider: 'mock', providerPaymentId: 'mock_pix_1', method: 'PIX', status: 'PENDING', qrCode: 'data:image/png;base64,AAA', qrCodeText: '000201PIX', expiresAt: new Date().toISOString(),
        }),
      },
      repo ?? {
        createOrder: jest.fn().mockResolvedValue({ id: 'order_db', orderNumber: 'V2-1', status: 'CONFIRMED' }),
        attachPaymentIntent: jest.fn().mockResolvedValue({ id: 'order_db' }),
      },
      { emitOrderCreated: jest.fn() } as any,
      { getOpenSessionOrThrow: jest.fn().mockResolvedValue({ id: 'session_1', branchId: 'branch_1' }) } as any,
    );
  }

  it('checkout PIX retorna qrCodeText, providerPaymentId e expiresAt', async () => {
    const menuPort: MenuPort = {
      validateItems: jest.fn().mockResolvedValue({ storeId: 'store_1', items: [{ productId: 'p1', name: 'Pizza', quantity: 1, unitPrice: 40, selectedOptions: [] }] }),
    };
    const service = build(menuPort, { quoteByAddress: jest.fn().mockResolvedValue(quoteOk()) });

    const result = await service.runDeliveryCheckout({ companyId: 'company_a', storeId: 'store_1', channel: 'delivery', customer: { name: 'Maria', phone: '1199' }, deliveryAddress: { cep: '01001000', street: 'Rua', number: '10', neighborhood: 'Centro' }, items: [{ productId: 'p1', quantity: 1 }], paymentMethod: 'PIX' }, ctx);

    expect(result.order.status).toBe('CONFIRMED');
    expect(result.payment.status).toBe('PENDING');
    expect(result.payment.providerPaymentId).toBe('mock_pix_1');
    expect(result.payment.qrCodeText).toBeTruthy();
    expect(result.payment.expiresAt).toBeTruthy();
  });

  it('pagamento recusado mantem fluxo atual', async () => {
    const menuPort: MenuPort = {
      validateItems: jest.fn().mockResolvedValue({ storeId: 'store_1', items: [{ productId: 'p1', name: 'Pizza', quantity: 1, unitPrice: 40, selectedOptions: [] }] }),
    };

    const service = new CheckoutService(
      menuPort,
      { authorizePayment: jest.fn().mockResolvedValue({ status: 'DECLINED', reason: 'Saldo insuficiente' }) } as any,
      { quoteByAddress: jest.fn().mockResolvedValue(quoteOk()) } as any,
      { createPixPayment: jest.fn() } as any,
      {
        createOrder: jest.fn().mockResolvedValue({ id: 'order_db', orderNumber: 'V2-1', status: 'PENDING_CONFIRMATION' }),
        attachPaymentIntent: jest.fn(),
      } as any,
      { emitOrderCreated: jest.fn() } as any,
      { getOpenSessionOrThrow: jest.fn().mockResolvedValue({ id: 'session_1', branchId: 'branch_1' }) } as any,
    );

    const result = await service.runDeliveryCheckout({ companyId: 'company_a', storeId: 'store_1', channel: 'delivery', customer: { name: 'Maria', phone: '1199' }, deliveryAddress: { cep: '01001000', street: 'Rua', number: '10', neighborhood: 'Centro' }, items: [{ productId: 'p1', quantity: 1 }], paymentMethod: 'DENY' }, ctx);

    expect(result.payment.status).toBe('DECLINED');
  });

  it('fora da area bloqueia quote e checkout', async () => {
    const menuPort: MenuPort = {
      validateItems: jest.fn().mockResolvedValue({ storeId: 'store_1', items: [{ productId: 'p1', name: 'Pizza', quantity: 1, unitPrice: 40, selectedOptions: [] }] }),
    };
    const service = build(menuPort, { quoteByAddress: jest.fn().mockResolvedValue(quoteOk({ available: false, message: 'Endereco fora da area de entrega' })) });

    await expect(service.quoteDeliveryCheckout({ storeId: 'store_1', items: [{ productId: 'p1', quantity: 1 }], deliveryAddress: { cep: '01001000', number: '10' } }, ctx)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('checkout usa preco real atualizado das opcoes retornadas pelo menu', async () => {
    const menuPort: MenuPort = {
      validateItems: jest.fn().mockResolvedValue({
        storeId: 'store_1',
        items: [
          {
            productId: 'p1',
            name: 'X-Burger',
            quantity: 2,
            unitPrice: 25,
            selectedOptions: [{ groupId: 'g1', optionId: 'o1', name: 'Bacon', price: 7.5 }],
          },
        ],
      }),
    };
    const service = build(menuPort, { quoteByAddress: jest.fn().mockResolvedValue(quoteOk()) });

    const result = await service.quoteDeliveryCheckout(
      { storeId: 'store_1', items: [{ productId: 'p1', quantity: 2 }], deliveryAddress: { cep: '01001000', number: '10' } },
      ctx,
    );

    expect(result.items[0].selectedOptions[0].price).toBe(7.5);
    expect(result.items[0].totalPrice).toBe(65);
    expect(result.subtotal).toBe(65);
  });

  it('PDV cria pedido com pagamento imediato aprovado', async () => {
    const menuPort: MenuPort = {
      validateItems: jest.fn().mockResolvedValue({
        storeId: 'pdv_store',
        items: [{ productId: 'p1', name: 'X-Burger', quantity: 2, unitPrice: 25, selectedOptions: [] }],
      }),
    };

    const repo = {
      createOrder: jest.fn().mockResolvedValue({ id: 'order_db', orderNumber: 'V2-1', status: 'CONFIRMED' }),
      attachPaymentIntent: jest.fn().mockResolvedValue({ id: 'order_db' }),
    };
    const service = build(menuPort, { quoteByAddress: jest.fn() }, repo);
    const result = await service.runPdvCheckout(
      {
        companyId: 'company_a',
        channel: 'pdv',
        storeId: 'pdv_store',
        items: [{ productId: 'p1', quantity: 2 }],
        paymentMethod: 'CASH',
      },
      ctx,
    );

    expect(result.order.id).toBe('order_db');
    expect(result.order.status).toBe('CONFIRMED');
    expect(result.order.totals.deliveryFee).toBe(0);
    expect(result.payment.status).toBe('APPROVED');
    expect(repo.createOrder).toHaveBeenCalledWith(
      expect.anything(),
      ctx,
      undefined,
      expect.objectContaining({ pdvSessionId: 'session_1' }),
    );
  });

  it('PDV bloqueia venda sem caixa aberto', async () => {
    const menuPort: MenuPort = {
      validateItems: jest.fn().mockResolvedValue({
        storeId: 'pdv_store',
        items: [{ productId: 'p1', name: 'X-Burger', quantity: 1, unitPrice: 25, selectedOptions: [] }],
      }),
    };
    const repo = {
      createOrder: jest.fn(),
      attachPaymentIntent: jest.fn(),
    };
    const service = new CheckoutService(
      menuPort,
      { authorizePayment: jest.fn() } as any,
      { quoteByAddress: jest.fn() } as any,
      { createPixPayment: jest.fn() } as any,
      repo as any,
      { emitOrderCreated: jest.fn() } as any,
      {
        getOpenSessionOrThrow: jest.fn().mockRejectedValue(
          new BadRequestException('Nenhum caixa aberto para a filial atual. Abra o caixa antes de vender no PDV.'),
        ),
      } as any,
    );

    await expect(
      service.runPdvCheckout(
        {
          companyId: 'company_a',
          channel: 'pdv',
          storeId: 'pdv_store',
          items: [{ productId: 'p1', quantity: 1 }],
          paymentMethod: 'CASH',
        },
        ctx,
      ),
    ).rejects.toThrow('Nenhum caixa aberto');
    expect(repo.createOrder).not.toHaveBeenCalled();
  });

  it('PDV pode iniciar direto em preparo para aparecer no KDS', async () => {
    const menuPort: MenuPort = {
      validateItems: jest.fn().mockResolvedValue({
        storeId: 'pdv_store',
        items: [{ productId: 'p1', name: 'X-Burger', quantity: 1, unitPrice: 25, selectedOptions: [] }],
      }),
    };

    const service = build(menuPort, { quoteByAddress: jest.fn() });
    const result = await service.runPdvCheckout(
      {
        companyId: 'company_a',
        channel: 'pdv',
        storeId: 'pdv_store',
        items: [{ productId: 'p1', quantity: 1 }],
        paymentMethod: 'PIX',
        startInPreparation: true,
      },
      ctx,
    );

    expect(result.order.status).toBe('PREPARING');
    expect(result.payment.status).toBe('PENDING');
    expect(result.payment.method).toBe('PIX');
    expect(result.payment.qrCodeText).toBeTruthy();
    expect(result.payment.expiresAt).toBeTruthy();
  });

  it('checkout retorna trackingToken publico e salva no pedido', async () => {
    const menuPort: MenuPort = {
      validateItems: jest.fn().mockResolvedValue({ storeId: 'store_1', items: [{ productId: 'p1', name: 'Pizza', quantity: 1, unitPrice: 40, selectedOptions: [] }] }),
    };
    const repo = {
      createOrder: jest.fn().mockResolvedValue({ id: 'order_db', orderNumber: 'V2-1', status: 'CONFIRMED' }),
      attachPaymentIntent: jest.fn().mockResolvedValue({ id: 'order_db' }),
    };
    const service = build(menuPort, { quoteByAddress: jest.fn().mockResolvedValue(quoteOk()) }, repo);

    const result = await service.runDeliveryCheckout({ companyId: 'company_a', storeId: 'store_1', channel: 'delivery', customer: { name: 'Maria', phone: '1199' }, deliveryAddress: { cep: '01001000', street: 'Rua', number: '10', neighborhood: 'Centro' }, items: [{ productId: 'p1', quantity: 1 }], paymentMethod: 'CASH' }, ctx);

    expect(result.order.trackingToken).toMatch(/^[a-f0-9]{48}$/);
    expect(repo.createOrder).toHaveBeenCalledWith(
      expect.anything(),
      ctx,
      expect.anything(),
      expect.objectContaining({ publicTrackingToken: result.order.trackingToken }),
    );
  });

  it('delivery CREDIT_CARD cria intent online mock', async () => {
    const menuPort: MenuPort = {
      validateItems: jest.fn().mockResolvedValue({ storeId: 'store_1', items: [{ productId: 'p1', name: 'Pizza', quantity: 1, unitPrice: 40, selectedOptions: [] }] }),
    };
    const repo = {
      createOrder: jest.fn().mockResolvedValue({ id: 'order_db', orderNumber: 'V2-1', status: 'CONFIRMED' }),
      attachPaymentIntent: jest.fn().mockResolvedValue({ id: 'order_db' }),
    };
    const paymentsService = {
      createPixPayment: jest.fn(),
      createOnlineCardPayment: jest.fn().mockResolvedValue({ id: 'card_1', provider: 'mock', providerPaymentId: 'mock_card_1', method: 'CREDIT_CARD', status: 'APPROVED', message: 'Cartao online mock aprovado' }),
    };
    const service = build(menuPort, { quoteByAddress: jest.fn().mockResolvedValue(quoteOk()) }, repo, paymentsService);

    const result = await service.runDeliveryCheckout({ companyId: 'company_a', storeId: 'store_1', channel: 'delivery', customer: { name: 'Maria', phone: '1199' }, deliveryAddress: { cep: '01001000', street: 'Rua', number: '10', neighborhood: 'Centro' }, items: [{ productId: 'p1', quantity: 1 }], paymentMethod: 'CREDIT_CARD' }, ctx);

    expect(paymentsService.createOnlineCardPayment).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'order_db', orderNumber: 'V2-1', total: 47.5 }),
      ctx,
      undefined,
    );
    expect(repo.attachPaymentIntent).toHaveBeenCalledWith('order_db', expect.objectContaining({ method: 'CREDIT_CARD' }), ctx);
    expect(result.payment.method).toBe('CREDIT_CARD');
    expect(result.payment.status).toBe('APPROVED');
    expect(result.payment.providerPaymentId).toBe('mock_card_1');
    expect(result.order.trackingToken).toMatch(/^[a-f0-9]{48}$/);
  });

  it('delivery CREDIT_CARD mercadopago repassa payload tokenizado', async () => {
    const menuPort: MenuPort = {
      validateItems: jest.fn().mockResolvedValue({
        storeId: 'store_1',
        items: [{ productId: 'p1', name: 'Pizza', quantity: 1, unitPrice: 40, selectedOptions: [] }],
      }),
    };
    const repo = {
      createOrder: jest.fn().mockResolvedValue({ id: 'order_db', orderNumber: 'V2-1', status: 'CONFIRMED' }),
      attachPaymentIntent: jest.fn().mockResolvedValue({ id: 'order_db' }),
    };
    const paymentsService = {
      createPixPayment: jest.fn(),
      createOnlineCardPayment: jest.fn().mockResolvedValue({
        id: 'card_1',
        provider: 'mercadopago',
        providerPaymentId: 'mp_card_1',
        method: 'CREDIT_CARD',
        status: 'PENDING',
        message: 'Pagamento em analise',
      }),
    };
    const service = build(menuPort, { quoteByAddress: jest.fn().mockResolvedValue(quoteOk()) }, repo, paymentsService);

    await service.runDeliveryCheckout(
      {
        companyId: 'company_a',
        storeId: 'store_1',
        channel: 'delivery',
        customer: { name: 'Maria', phone: '1199' },
        deliveryAddress: { cep: '01001000', street: 'Rua', number: '10', neighborhood: 'Centro' },
        items: [{ productId: 'p1', quantity: 1 }],
        paymentMethod: 'CREDIT_CARD',
        cardPayment: {
          cardToken: 'tok_test_123',
          paymentMethodId: 'visa',
          installments: 1,
          payerEmail: 'maria@example.com',
          identificationType: 'CPF',
          identificationNumber: '12345678900',
        },
      },
      ctx,
    );

    expect(paymentsService.createOnlineCardPayment).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'order_db', orderNumber: 'V2-1', total: 47.5 }),
      ctx,
      expect.objectContaining({
        cardToken: 'tok_test_123',
        paymentMethodId: 'visa',
        installments: 1,
        payerEmail: 'maria@example.com',
      }),
    );
  });
});

