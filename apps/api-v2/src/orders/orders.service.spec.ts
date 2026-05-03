import { NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  const ctxBase = {
    companyId: 'company_a',
    userRole: 'admin' as const,
    requestId: 'req_1',
    channel: 'delivery' as const,
  };

  function createService(repoMock: any, eventsMock?: any) {
    return new OrdersService(repoMock, eventsMock ?? { emitOrderStatusUpdated: jest.fn() });
  }

  it('retorna pedido da empresa correta', async () => {
    const repoMock = {
      findById: jest.fn().mockResolvedValue({
        id: 'order_1',
        orderNumber: 'V2-20260501-ABC123',
        status: 'CONFIRMED',
        subtotal: 50,
        discountAmount: 0,
        deliveryFee: 8,
        totalAmount: 58,
        paymentStatus: 'PAID',
        paidAmount: 58,
        refundedAmount: 0,
        internalNotes: JSON.stringify({
          checkoutSnapshot: {
            customer: { name: 'Maria', phone: '11999990000' },
            deliveryAddress: { street: 'Rua A', number: '10', neighborhood: 'Centro', reference: 'Casa' },
          },
        }),
        createdAt: new Date('2026-05-01T10:00:00.000Z'),
        timelineEvents: [
          {
            eventType: 'order_created',
            newStatus: 'CONFIRMED',
            payload: {
              type: 'order_created',
              status: 'CONFIRMED',
              message: 'Pedido criado',
              actor: { role: 'system', name: 'Sistema' },
            },
            createdAt: new Date('2026-05-01T10:00:00.000Z'),
          },
          {
            eventType: 'status_changed',
            previousStatus: 'CONFIRMED',
            newStatus: 'READY',
            payload: {
              type: 'status_changed',
              status: 'READY',
              message: 'Pedido marcado como pronto',
              actor: { role: 'kds', name: 'KDS' },
            },
            createdAt: new Date('2026-05-01T10:05:00.000Z'),
          },
        ],
        items: [],
      }),
    } as any;
    const service = createService(repoMock);
    const result = await service.getById('order_1', ctxBase);
    expect(result.id).toBe('order_1');
    expect(result.customer?.name).toBe('Maria');
    expect(result.deliveryAddress?.neighborhood).toBe('Centro');
    expect(result.timelineSource).toBe('events');
    expect(result.timeline).toEqual([
      expect.objectContaining({
        type: 'order_created',
        status: 'CONFIRMED',
        message: 'Pedido criado',
      }),
      expect.objectContaining({
        type: 'status_changed',
        status: 'READY',
        message: 'Pedido marcado como pronto',
        actor: { role: 'kds', name: 'KDS' },
      }),
    ]);
  });

  it('nao retorna pedido de outra empresa (404)', async () => {
    const service = createService({ findById: jest.fn().mockResolvedValue(null) } as any);
    await expect(service.getById('order_other', ctxBase)).rejects.toThrow(NotFoundException);
  });

  it('retorna 404 claro quando nao encontrado', async () => {
    const service = createService({ findById: jest.fn().mockResolvedValue(null) } as any);
    await expect(service.getById('missing_id', ctxBase)).rejects.toThrow(
      "Pedido 'missing_id' nao encontrado para a empresa atual.",
    );
  });

  it('pedido sem eventos retorna timeline fallback identificada', async () => {
    const createdAt = new Date('2026-05-01T10:00:00.000Z');
    const repoMock = {
      findById: jest.fn().mockResolvedValue({
        id: 'order_legacy',
        orderNumber: 'V2-LEGACY',
        status: 'READY',
        subtotal: 50,
        discountAmount: 0,
        deliveryFee: 0,
        totalAmount: 50,
        paymentStatus: 'PAID',
        paidAmount: 50,
        refundedAmount: 0,
        internalNotes: '',
        createdAt,
        preparationStartedAt: new Date('2026-05-01T10:03:00.000Z'),
        readyAt: new Date('2026-05-01T10:08:00.000Z'),
        timelineEvents: [],
        items: [],
      }),
    } as any;

    const service = createService(repoMock);
    const result = await service.getById('order_legacy', ctxBase);

    expect(result.timelineSource).toBe('fallback');
    expect(result.timeline).toEqual([
      expect.objectContaining({ type: 'order_created', status: 'READY' }),
      expect.objectContaining({ type: 'status_changed', status: 'IN_PREPARATION' }),
      expect.objectContaining({ type: 'status_changed', status: 'READY' }),
    ]);
  });

  it('retorna waiter_app para pedido novo com Channel.WAITER_APP', async () => {
    const repoMock = {
      findById: jest.fn().mockResolvedValue({
        id: 'order_waiter_new',
        orderNumber: 'V2-WAITER-NEW',
        channel: 'WAITER_APP',
        status: 'CONFIRMED',
        subtotal: 30,
        discountAmount: 0,
        deliveryFee: 0,
        totalAmount: 30,
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        refundedAmount: 0,
        internalNotes: JSON.stringify({ sourceChannel: 'waiter_app' }),
        createdAt: new Date('2026-05-01T10:00:00.000Z'),
        timelineEvents: [],
        items: [],
      }),
    } as any;

    const service = createService(repoMock);
    const result = await service.getById('order_waiter_new', ctxBase);

    expect(result.channel).toBe('waiter_app');
  });

  it('trata pedido legado QR com sourceChannel waiter_app como waiter_app', async () => {
    const repoMock = {
      findById: jest.fn().mockResolvedValue({
        id: 'order_waiter_legacy',
        orderNumber: 'V2-WAITER-LEGACY',
        channel: 'QR',
        status: 'CONFIRMED',
        subtotal: 30,
        discountAmount: 0,
        deliveryFee: 0,
        totalAmount: 30,
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        refundedAmount: 0,
        internalNotes: JSON.stringify({ sourceChannel: 'waiter_app' }),
        createdAt: new Date('2026-05-01T10:00:00.000Z'),
        timelineEvents: [],
        items: [],
      }),
    } as any;

    const service = createService(repoMock);
    const result = await service.getById('order_waiter_legacy', ctxBase);

    expect(result.channel).toBe('waiter_app');
  });

  it('lista somente pedidos da empresa atual e ordena mais recentes primeiro', async () => {
    const rows = [
      {
        id: 'o2',
        orderNumber: 'V2-2',
        channel: 'PDV',
        status: 'CONFIRMED',
        totalAmount: 30,
        paymentStatus: 'PAID',
        internalNotes: JSON.stringify({ checkoutSnapshot: { customer: { name: 'Balcao', phone: '' } } }),
        createdAt: new Date('2026-05-02T10:00:00.000Z'),
        updatedAt: new Date('2026-05-02T10:02:00.000Z'),
      },
      {
        id: 'o1',
        orderNumber: 'V2-1',
        channel: 'WEB',
        status: 'PENDING_CONFIRMATION',
        totalAmount: 20,
        paymentStatus: 'UNPAID',
        internalNotes: JSON.stringify({ checkoutSnapshot: { customer: { name: 'Maria', phone: '' } } }),
        createdAt: new Date('2026-05-01T10:00:00.000Z'),
        updatedAt: new Date('2026-05-01T10:05:00.000Z'),
      },
    ];
    const repoMock = { findMany: jest.fn().mockResolvedValue({ total: 2, rows }) } as any;
    const service = createService(repoMock);
    const result = await service.list(ctxBase, {});
    expect(result.data[0].id).toBe('o2');
    expect(result.data[1].id).toBe('o1');
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        channel: 'PDV',
        customerName: 'Balcao',
        elapsedMinutes: expect.any(Number),
        isDelayed: expect.any(Boolean),
      }),
    );
  });

  it('filtra por branchId, status, canal, pagamento e busca', async () => {
    const ctx = { ...ctxBase, branchId: 'branch_a' };
    const repoMock = { findMany: jest.fn().mockResolvedValue({ total: 0, rows: [] }) } as any;
    const service = createService(repoMock);
    await service.list(ctx, {
      status: 'CONFIRMED',
      channel: 'pdv',
      paymentStatus: 'PAID',
      search: 'V2-1',
      activeOnly: 'true',
      sortBy: 'updatedAt',
      sortDirection: 'asc',
    });
    expect(repoMock.findMany).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        status: 'CONFIRMED',
        channel: 'pdv',
        paymentStatus: 'PAID',
        search: 'V2-1',
        activeOnly: true,
        sortBy: 'updatedAt',
        sortDirection: 'asc',
      }),
    );
  });

  it('suporta delayedOnly e timeline basica no detalhe', async () => {
    const createdAt = new Date(Date.now() - 25 * 60_000);
    const repoMock = {
      findMany: jest.fn().mockResolvedValue({
        total: 1,
        rows: [
          {
            id: 'late_1',
            orderNumber: 'V2-LATE',
            channel: 'WEB',
            status: 'IN_PREPARATION',
            totalAmount: 42,
            paymentStatus: 'PAID',
            internalNotes: '',
            createdAt,
            updatedAt: createdAt,
          },
        ],
      }),
    } as any;
    const service = createService(repoMock);
    const result = await service.list(ctxBase, { delayedOnly: true });
    expect(repoMock.findMany).toHaveBeenCalledWith(ctxBase, expect.objectContaining({ delayedOnly: true }));
    expect(result.data[0].isDelayed).toBe(true);
    expect(result.data[0].delayLevel).toBe('urgent');
  });

  it('paginacao funciona e limit maximo 100', async () => {
    const repoMock = { findMany: jest.fn().mockResolvedValue({ total: 250, rows: [] }) } as any;
    const service = createService(repoMock);
    const result = await service.list(ctxBase, { page: 3, limit: 999 });
    expect(result.pagination.limit).toBe(100);
    expect(result.pagination.totalPages).toBe(3);
  });

  it('summary calcula KPIs globais do backend', async () => {
    const repoMock = {
      summary: jest.fn().mockResolvedValue({
        totalOrders: 10,
        activeOrders: 4,
        delayedOrders: 1,
        preparingOrders: 2,
        readyOrders: 1,
        canceledOrders: 1,
        grossRevenue: 230.456,
        netRevenue: 180.445,
        canceledRevenue: 50.011,
        averageTicket: 23.045,
        ordersByChannel: { WEB: 6, PDV: 4 },
        ordersByStatus: { CONFIRMED: 4 },
        paymentsByStatus: { PAID: 7 },
        dateFrom: '2026-05-02T00:00:00.000Z',
        dateTo: '2026-05-02T23:59:59.999Z',
      }),
    } as any;
    const service = createService(repoMock);
    const result = await service.summary(ctxBase, {
      dateFrom: '2026-05-02T00:00:00.000Z',
      dateTo: '2026-05-02T23:59:59.999Z',
      channel: 'delivery',
    });

    expect(repoMock.summary).toHaveBeenCalledWith(ctxBase, {
      dateFrom: new Date('2026-05-02T00:00:00.000Z'),
      dateTo: new Date('2026-05-02T23:59:59.999Z'),
      channel: 'delivery',
    });
    expect(result.totalOrders).toBe(10);
    expect(result.averageTicket).toBe(23.05);
    expect(result.grossRevenue).toBe(230.46);
    expect(result.netRevenue).toBe(180.45);
    expect(result.canceledRevenue).toBe(50.01);
    expect(result.ordersByStatus).toEqual({ CONFIRMED: 4 });
  });

  it('tracking retorna timeline publica e dados de entrega', async () => {
    const repoMock = {
      findById: jest.fn().mockResolvedValue({
        id: 'order_track',
        orderNumber: 'V2-TRACK',
        channel: 'WEB',
        status: 'IN_PREPARATION',
        subtotal: 50,
        discountAmount: 0,
        deliveryFee: 8,
        totalAmount: 58,
        paymentStatus: 'PAID',
        paidAmount: 58,
        refundedAmount: 0,
        deliveryDistanceMeters: 2400,
        deliveryDurationSec: 1500,
        internalNotes: '',
        createdAt: new Date('2026-05-01T10:00:00.000Z'),
        timelineEvents: [
          {
            eventType: 'order_created',
            newStatus: 'CONFIRMED',
            payload: { status: 'CONFIRMED', message: 'Pedido criado' },
            createdAt: new Date('2026-05-01T10:00:00.000Z'),
          },
          {
            eventType: 'status_changed',
            newStatus: 'IN_PREPARATION',
            payload: { status: 'IN_PREPARATION', message: 'Pedido marcado como IN_PREPARATION' },
            createdAt: new Date('2026-05-01T10:05:00.000Z'),
          },
        ],
        items: [],
      }),
    } as any;

    const service = createService(repoMock);
    const result = await service.getTrackingById('order_track', ctxBase);

    expect(result.orderNumber).toBe('V2-TRACK');
    expect(result.paymentStatus).toBe('PAID');
    expect(result.deliveryFee).toBe(8);
    expect(result.deliveryDistanceMeters).toBe(2400);
    expect(result.estimatedMinutes).toBe(25);
    expect(result.timeline).toEqual([
      expect.objectContaining({ status: 'CONFIRMED', message: 'Pedido recebido' }),
      expect.objectContaining({ status: 'IN_PREPARATION', message: 'Em preparo' }),
    ]);
    expect(result.trackingSecurity).toBe('tenant_header');
  });

  it('atualiza pedido da empresa correta', async () => {
    const repoMock = {
      updateStatus: jest.fn().mockResolvedValue({
        id: 'order_1',
        orderNumber: 'V2-20260501-ABC123',
        status: 'CONFIRMED',
        subtotal: 50,
        discountAmount: 0,
        deliveryFee: 8,
        totalAmount: 58,
        paymentStatus: 'PAID',
        paidAmount: 58,
        refundedAmount: 0,
        createdAt: new Date('2026-05-01T10:00:00.000Z'),
        items: [],
      }),
    } as any;
    const eventsMock = { emitOrderStatusUpdated: jest.fn() } as any;
    const service = createService(repoMock, eventsMock);
    const result = await service.updateStatus('order_1', 'CONFIRMED', ctxBase);
    expect(result.status).toBe('CONFIRMED');
    expect(eventsMock.emitOrderStatusUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'order_1',
        orderNumber: 'V2-20260501-ABC123',
        status: 'CONFIRMED',
      }),
      expect.objectContaining({ companyId: 'company_a', requestId: 'req_1' }),
    );
  });

  it('nao atualiza pedido de outra empresa', async () => {
    const service = createService({ updateStatus: jest.fn().mockResolvedValue(null) } as any);
    await expect(service.updateStatus('order_other', 'CONFIRMED', ctxBase)).rejects.toThrow(NotFoundException);
  });

  it('respeita branchId', async () => {
    const ctx = { ...ctxBase, branchId: 'branch_a' };
    const repoMock = {
      updateStatus: jest.fn().mockResolvedValue({
        id: 'order_1',
        orderNumber: 'V2-1',
        status: 'READY',
        subtotal: 10,
        discountAmount: 0,
        deliveryFee: 0,
        totalAmount: 10,
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        refundedAmount: 0,
        createdAt: new Date('2026-05-01T10:00:00.000Z'),
        items: [],
      }),
    } as any;
    const service = createService(repoMock);
    await service.updateStatus('order_1', 'READY', ctx);
    expect(repoMock.updateStatus).toHaveBeenCalledWith('order_1', 'READY', ctx);
  });

  it('status invalido retorna erro claro', async () => {
    const repoMock = { updateStatus: jest.fn() } as any;
    const service = createService(repoMock);
    await expect(service.updateStatus('order_1', 'INVALID_STATUS', ctxBase)).rejects.toThrow(
      "Status invÃ¡lido: 'INVALID_STATUS'.",
    );
    expect(repoMock.updateStatus).not.toHaveBeenCalled();
  });

  it('pedido inexistente retorna 404', async () => {
    const service = createService({ updateStatus: jest.fn().mockResolvedValue(null) } as any);
    await expect(service.updateStatus('missing_id', 'CONFIRMED', ctxBase)).rejects.toThrow(
      "Pedido 'missing_id' nao encontrado para a empresa atual.",
    );
  });

  it('erro no emitter nao quebra update', async () => {
    const repoMock = {
      updateStatus: jest.fn().mockResolvedValue({
        id: 'order_safe',
        orderNumber: 'V2-SAFE',
        status: 'CONFIRMED',
        subtotal: 10,
        discountAmount: 0,
        deliveryFee: 0,
        totalAmount: 10,
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        refundedAmount: 0,
        createdAt: new Date('2026-05-01T10:00:00.000Z'),
        items: [],
      }),
    } as any;
    const eventsMock = {
      emitOrderStatusUpdated: jest.fn().mockImplementation(() => {
        throw new Error('emitter failure');
      }),
    } as any;
    const service = createService(repoMock, eventsMock);
    const result = await service.updateStatus('order_safe', 'CONFIRMED', ctxBase);
    expect(result.id).toBe('order_safe');
  });

  it('GET pedido retorna addons', async () => {
    const repoMock = {
      findById: jest.fn().mockResolvedValue({
        id: 'order_addon',
        orderNumber: 'V2-ADDON',
        status: 'CONFIRMED',
        subtotal: 54,
        discountAmount: 0,
        deliveryFee: 8,
        totalAmount: 62,
        paymentStatus: 'PAID',
        paidAmount: 62,
        refundedAmount: 0,
        createdAt: new Date('2026-05-01T10:00:00.000Z'),
        items: [
          {
            id: 'item_1',
            productId: 'p1',
            productNameSnapshot: 'Pizza',
            quantity: 1,
            unitPrice: 50,
            totalPrice: 54,
            addons: [{ addonItemId: 'add_1', nameSnapshot: 'Queijo', priceSnapshot: 4, quantity: 1 }],
          },
        ],
      }),
    } as any;
    const service = createService(repoMock);
    const result = await service.getById('order_addon', ctxBase);
    expect(result.items[0].selectedOptions?.[0]).toEqual({
      optionId: 'add_1',
      name: 'Queijo',
      price: 4,
      quantity: 1,
    });
  });

  it('tracking publico por token nao exige tenant header', async () => {
    const repoMock = {
      findByPublicTrackingToken: jest.fn().mockResolvedValue({
        id: 'order_public',
        orderNumber: 'V2-PUBLIC',
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        deliveryDurationSec: 900,
        deliveryDistanceMeters: 1200,
        deliveryFee: 6,
        totalAmount: 42,
        createdAt: new Date('2026-05-02T12:00:00.000Z'),
        timelineEvents: [
          {
            eventType: 'order_created',
            newStatus: 'CONFIRMED',
            payload: { status: 'CONFIRMED', message: 'Pedido criado' },
            createdAt: new Date('2026-05-02T12:00:00.000Z'),
          },
        ],
        items: [],
      }),
    } as any;

    const service = createService(repoMock);
    const result = await service.getPublicTrackingByToken('a'.repeat(48));

    expect(repoMock.findByPublicTrackingToken).toHaveBeenCalledWith('a'.repeat(48));
    expect(result.orderNumber).toBe('V2-PUBLIC');
    expect(result.trackingSecurity).toBe('public_token');
    expect(result.timeline[0].message).toBe('Pedido recebido');
    expect('internalNotes' in (result as unknown as object)).toBe(false);
  });

  it('tracking token invalido retorna 404', async () => {
    const service = createService({ findByPublicTrackingToken: jest.fn() } as any);

    await expect(service.getPublicTrackingByToken('curto')).rejects.toThrow(NotFoundException);
  });
});

