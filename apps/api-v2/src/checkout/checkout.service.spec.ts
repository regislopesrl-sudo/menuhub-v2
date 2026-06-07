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

  function build(menuPort: MenuPort, quoteService: any, repo?: any, paymentsService?: any, stockService?: any) {
    const prismaTransaction = {
      orderPayment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'pay_1',
          provider: 'pdv-local',
          providerTransactionId: 'pdv_txn_ord_1',
        }),
      },
      order: {
        update: jest.fn().mockResolvedValue({ id: 'order_db' }),
      },
      accountsReceivable: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'ar_1' }),
      },
      receivableSettlement: {
        create: jest.fn().mockResolvedValue({ id: 'settlement_1' }),
      },
      financialLedgerEntry: {
        create: jest.fn().mockResolvedValue({ id: 'ledger_1' }),
      },
    };
    const prisma = {
      customer: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'cust_1' }),
        update: jest.fn().mockResolvedValue({ id: 'cust_1' }),
      },
      customerAddress: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'addr_1' }),
        update: jest.fn().mockResolvedValue({ id: 'addr_1' }),
      },
      $transaction: jest.fn((callback) => callback(prismaTransaction)),
    };
    return new CheckoutService(
      menuPort,
      { authorizePayment: jest.fn().mockResolvedValue({ status: 'APPROVED', transactionId: 'txn_1' }) } as any,
      quoteService,
      paymentsService ?? {
        createPixPayment: jest.fn().mockResolvedValue({
          id: 'pix_1', provider: 'mock', providerPaymentId: 'mock_pix_1', method: 'PIX', status: 'PENDING', qrCode: 'data:image/png;base64,AAA', qrCodeText: '000201PIX', expiresAt: new Date().toISOString(),
        }),
      },
      prisma as any,
      repo ?? {
        createOrder: jest.fn().mockResolvedValue({
          id: 'order_db',
          orderNumber: 'V2-1',
          branchId: 'branch_1',
          status: 'CONFIRMED',
          publicTrackingToken: 'trk_public_1',
        }),
        attachPaymentIntent: jest.fn().mockResolvedValue({ id: 'order_db' }),
      },
      { emitOrderCreated: jest.fn() } as any,
      { getOpenSessionOrThrow: jest.fn().mockResolvedValue({ id: 'session_1', branchId: 'branch_1' }) } as any,
      stockService ?? { assertProductsAvailableForCheckout: jest.fn().mockResolvedValue({ available: true, blocked: [] }) } as any,
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
    expect(result.order.trackingToken).toBe('trk_public_1');
    expect(result.order.orderNumber).toBe('V2-1');
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
        customer: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'cust_1' }),
          update: jest.fn().mockResolvedValue({ id: 'cust_1' }),
        },
        customerAddress: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'addr_1' }),
          update: jest.fn().mockResolvedValue({ id: 'addr_1' }),
        },
      } as any,
      {
        createOrder: jest.fn().mockResolvedValue({
          id: 'order_db',
          orderNumber: 'V2-1',
          status: 'PENDING_CONFIRMATION',
          publicTrackingToken: 'trk_declined',
        }),
        attachPaymentIntent: jest.fn(),
      } as any,
      { emitOrderCreated: jest.fn() } as any,
      { getOpenSessionOrThrow: jest.fn().mockResolvedValue({ id: 'session_1', branchId: 'branch_1' }) } as any,
      { assertProductsAvailableForCheckout: jest.fn().mockResolvedValue({ available: true, blocked: [] }) } as any,
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

  it('bloqueia quote quando estoque tecnico nao atende o carrinho', async () => {
    const menuPort: MenuPort = {
      validateItems: jest.fn().mockResolvedValue({ storeId: 'store_1', items: [{ productId: 'p1', name: 'Pizza', quantity: 2, unitPrice: 40, selectedOptions: [] }] }),
    };
    const stockService = {
      assertProductsAvailableForCheckout: jest.fn().mockRejectedValue(new BadRequestException('Estoque insuficiente para Pizza: solicitado 2, disponivel 1.')),
    };
    const service = build(menuPort, { quoteByAddress: jest.fn().mockResolvedValue(quoteOk()) }, undefined, undefined, stockService);

    await expect(service.quoteDeliveryCheckout({ storeId: 'store_1', items: [{ productId: 'p1', quantity: 2 }], deliveryAddress: { cep: '01001000', number: '10' } }, ctx)).rejects.toBeInstanceOf(BadRequestException);
    expect(stockService.assertProductsAvailableForCheckout).toHaveBeenCalledWith(ctx, [
      expect.objectContaining({ productId: 'p1', quantity: 2 }),
    ]);
  });

  it('PDV cria pedido com pagamento imediato aprovado', async () => {
    const menuPort: MenuPort = {
      validateItems: jest.fn().mockResolvedValue({
        storeId: 'pdv_store',
        items: [{ productId: 'p1', name: 'X-Burger', quantity: 2, unitPrice: 25, selectedOptions: [] }],
      }),
    };

    const repo = {
      createOrder: jest.fn().mockResolvedValue({ id: 'order_db', orderNumber: 'V2-1', branchId: 'branch_1', status: 'CONFIRMED' }),
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
    expect(result.order.orderNumber).toBe('V2-1');
    expect(result.order.status).toBe('CONFIRMED');
    expect(result.order.totals.deliveryFee).toBe(0);
    expect(result.payment.status).toBe('APPROVED');
    expect(result.payment.id).toBe('pay_1');
    expect(result.payment.provider).toBe('pdv-local');
    expect(repo.createOrder).toHaveBeenCalledWith(
      expect.anything(),
      ctx,
      undefined,
      expect.objectContaining({ pdvSessionId: 'session_1' }),
    );
  });

  it('PDV nao persiste pedido quando produto controlado nao tem saldo disponivel', async () => {
    const menuPort: MenuPort = {
      validateItems: jest.fn().mockResolvedValue({
        storeId: 'pdv_store',
        items: [{ productId: 'p1', name: 'X-Burger', quantity: 3, unitPrice: 25, selectedOptions: [] }],
      }),
    };
    const repo = {
      createOrder: jest.fn().mockResolvedValue({ id: 'order_db', orderNumber: 'V2-1', status: 'CONFIRMED' }),
      attachPaymentIntent: jest.fn(),
    };
    const stockService = {
      assertProductsAvailableForCheckout: jest.fn().mockRejectedValue(new BadRequestException('Estoque insuficiente para X-Burger: solicitado 3, disponivel 1.')),
    };
    const service = build(menuPort, { quoteByAddress: jest.fn() }, repo, undefined, stockService);

    await expect(service.runPdvCheckout(
      {
        companyId: 'company_a',
        channel: 'pdv',
        storeId: 'pdv_store',
        items: [{ productId: 'p1', quantity: 3 }],
        paymentMethod: 'CASH',
      },
      ctx,
    )).rejects.toBeInstanceOf(BadRequestException);

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

  it('PDV aceita venda por mesa/comanda e persiste tipo de ordem', async () => {
    const menuPort: MenuPort = {
      validateItems: jest.fn().mockResolvedValue({
        storeId: 'pdv_store',
        items: [{ productId: 'p1', name: 'Prato', quantity: 1, unitPrice: 40, selectedOptions: [] }],
      }),
    };
    const repo = {
      createOrder: jest.fn().mockResolvedValue({ id: 'order_db', orderNumber: 'V2-2', status: 'CONFIRMED' }),
      attachPaymentIntent: jest.fn().mockResolvedValue({ id: 'order_db' }),
    };
    const service = build(menuPort, { quoteByAddress: jest.fn() }, repo);

    await service.runPdvCheckout(
      {
        companyId: 'company_a',
        channel: 'pdv',
        storeId: 'pdv_store',
        items: [{ productId: 'p1', quantity: 1 }],
        paymentMethod: 'CASH',
        saleType: 'TABLE',
        commandReference: 'MESA-12',
      },
      ctx,
    );

    expect(repo.createOrder).toHaveBeenCalledWith(
      expect.anything(),
      ctx,
      undefined,
      expect.objectContaining({
        pdvSessionId: 'session_1',
        pdvOrderType: 'TABLE',
        commandReference: 'MESA-12',
      }),
    );
  });

  it('Delivery TAKEOUT finaliza sem exigir endereco/quote e persiste pickup', async () => {
    const menuPort: MenuPort = {
      validateItems: jest.fn().mockResolvedValue({ storeId: 'store_1', items: [{ productId: 'p1', name: 'Pizza', quantity: 1, unitPrice: 40, selectedOptions: [] }] }),
    };
    const repo = {
      createOrder: jest.fn().mockResolvedValue({
        id: 'order_db',
        orderNumber: 'V2-3',
        status: 'CONFIRMED',
        publicTrackingToken: 'trk_takeout',
      }),
      attachPaymentIntent: jest.fn().mockResolvedValue({ id: 'order_db' }),
    };
    const quoteService = { quoteByAddress: jest.fn() };
    const service = build(menuPort, quoteService, repo);

    const result = await service.runDeliveryCheckout(
      {
        companyId: 'company_a',
        storeId: 'store_1',
        channel: 'delivery',
        fulfillmentType: 'TAKEOUT',
        customer: { name: 'Maria', phone: '1199' },
        deliveryAddress: { cep: '', street: '', number: '', neighborhood: '' },
        items: [{ productId: 'p1', quantity: 1 }],
        paymentMethod: 'CASH',
      },
      ctx,
    );

    expect(result.order.id).toBe('order_db');
    expect(result.order.trackingToken).toBe('trk_takeout');
    expect(quoteService.quoteByAddress).not.toHaveBeenCalled();
    expect(repo.createOrder).toHaveBeenCalledWith(
      expect.anything(),
      ctx,
      undefined,
      expect.objectContaining({ orderTypeOverride: 'PICKUP' }),
    );
  });
});
