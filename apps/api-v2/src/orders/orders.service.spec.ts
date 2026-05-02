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
        items: [],
      }),
    } as any;
    const service = createService(repoMock);
    const result = await service.getById('order_1', ctxBase);
    expect(result.id).toBe('order_1');
    expect(result.customer?.name).toBe('Maria');
    expect(result.deliveryAddress?.neighborhood).toBe('Centro');
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

  it('lista somente pedidos da empresa atual e ordena mais recentes primeiro', async () => {
    const rows = [
      {
        id: 'o2',
        orderNumber: 'V2-2',
        status: 'CONFIRMED',
        totalAmount: 30,
        paymentStatus: 'PAID',
        createdAt: new Date('2026-05-02T10:00:00.000Z'),
      },
      {
        id: 'o1',
        orderNumber: 'V2-1',
        status: 'PENDING_CONFIRMATION',
        totalAmount: 20,
        paymentStatus: 'UNPAID',
        createdAt: new Date('2026-05-01T10:00:00.000Z'),
      },
    ];
    const repoMock = { findMany: jest.fn().mockResolvedValue({ total: 2, rows }) } as any;
    const service = createService(repoMock);
    const result = await service.list(ctxBase, {});
    expect(result.data[0].id).toBe('o2');
    expect(result.data[1].id).toBe('o1');
  });

  it('filtra por branchId e status', async () => {
    const ctx = { ...ctxBase, branchId: 'branch_a' };
    const repoMock = { findMany: jest.fn().mockResolvedValue({ total: 0, rows: [] }) } as any;
    const service = createService(repoMock);
    await service.list(ctx, { status: 'CONFIRMED' });
    expect(repoMock.findMany).toHaveBeenCalledWith(ctx, expect.objectContaining({ status: 'CONFIRMED' }));
  });

  it('paginacao funciona e limit maximo 100', async () => {
    const repoMock = { findMany: jest.fn().mockResolvedValue({ total: 250, rows: [] }) } as any;
    const service = createService(repoMock);
    const result = await service.list(ctxBase, { page: 3, limit: 999 });
    expect(result.pagination.limit).toBe(100);
    expect(result.pagination.totalPages).toBe(3);
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
      "Status inválido: 'INVALID_STATUS'.",
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
});
