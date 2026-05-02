import { KdsService } from './kds.service';
import type { RequestContext } from '../common/request-context';
import type { OrdersService } from '../orders/orders.service';
import type { OrdersEventsService } from '../orders/orders-events.service';

describe('KdsService', () => {
  const ctx: RequestContext = {
    companyId: 'company-1',
    userRole: 'admin',
    requestId: 'req-1',
    branchId: 'branch-1',
    channel: 'admin_panel',
  };

  const orderDetail = {
    id: 'ord-1',
    orderNumber: 'V2-20260430-AAAAAA',
    channel: 'delivery',
    status: 'CONFIRMED',
    totals: { subtotal: 20, discount: 0, deliveryFee: 5, total: 25 },
    deliveryFee: 5,
    items: [
      {
        id: 'item-1',
        name: 'Hamburguer',
        quantity: 1,
        unitPrice: 20,
        totalPrice: 20,
        selectedOptions: [{ optionId: 'o1', name: 'Bacon', price: 3, quantity: 1 }],
      },
    ],
    createdAt: new Date(Date.now() - 2 * 60_000).toISOString(),
  };

  const ordersServiceMock: Pick<OrdersService, 'list' | 'getById' | 'updateStatus'> = {
    list: jest.fn(),
    getById: jest.fn(),
    updateStatus: jest.fn(),
  };

  const ordersEventsMock: Pick<OrdersEventsService, 'emitOrderStatusUpdated'> = {
    emitOrderStatusUpdated: jest.fn(),
  };

  let service: KdsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new KdsService(ordersServiceMock as OrdersService, ordersEventsMock as OrdersEventsService);
  });

  it('lists KDS orders for confirmed/in preparation/ready', async () => {
    (ordersServiceMock.list as jest.Mock)
      .mockResolvedValueOnce({ data: [{ id: 'ord-1' }], pagination: {} })
      .mockResolvedValueOnce({ data: [], pagination: {} })
      .mockResolvedValueOnce({ data: [], pagination: {} });
    (ordersServiceMock.getById as jest.Mock).mockResolvedValue(orderDetail);

    const result = await service.listOrders(ctx);

    expect(ordersServiceMock.list).toHaveBeenCalledTimes(3);
    expect(ordersServiceMock.list).toHaveBeenNthCalledWith(
      1,
      ctx,
      expect.objectContaining({ status: 'CONFIRMED' }),
    );
    expect(ordersServiceMock.list).toHaveBeenNthCalledWith(
      2,
      ctx,
      expect.objectContaining({ status: 'IN_PREPARATION' }),
    );
    expect(ordersServiceMock.list).toHaveBeenNthCalledWith(
      3,
      ctx,
      expect.objectContaining({ status: 'READY' }),
    );
    expect(result.data).toHaveLength(1);
    expect(result.data[0].orderNumber).toBe(orderDetail.orderNumber);
    expect(result.columns.new).toHaveLength(1);
    expect(result.data[0].totals.total).toBe(25);
    expect(result.data[0].customer).toBeUndefined();
  });

  it('updates status to IN_PREPARATION and emits event', async () => {
    (ordersServiceMock.updateStatus as jest.Mock).mockResolvedValue({
      ...orderDetail,
      status: 'IN_PREPARATION',
    });

    const result = await service.startOrder('ord-1', ctx);

    expect(ordersServiceMock.updateStatus).toHaveBeenCalledWith('ord-1', 'IN_PREPARATION', ctx, {
      emitEvent: false,
    });
    expect(ordersEventsMock.emitOrderStatusUpdated).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('IN_PREPARATION');
  });

  it('updates status to READY', async () => {
    (ordersServiceMock.updateStatus as jest.Mock).mockResolvedValue({
      ...orderDetail,
      status: 'READY',
    });

    const result = await service.markReady('ord-1', ctx);

    expect(ordersServiceMock.updateStatus).toHaveBeenCalledWith('ord-1', 'READY', ctx, {
      emitEvent: false,
    });
    expect(result.status).toBe('READY');
    expect(ordersEventsMock.emitOrderStatusUpdated).toHaveBeenCalledTimes(1);
  });

  it('updates status to FINALIZED on bump', async () => {
    (ordersServiceMock.updateStatus as jest.Mock).mockResolvedValue({
      ...orderDetail,
      status: 'FINALIZED',
    });

    const result = await service.bumpOrder('ord-1', ctx);

    expect(ordersServiceMock.updateStatus).toHaveBeenCalledWith('ord-1', 'FINALIZED', ctx, {
      emitEvent: false,
    });
    expect(result.status).toBe('FINALIZED');
    expect(ordersEventsMock.emitOrderStatusUpdated).toHaveBeenCalledTimes(1);
  });

  it('emitter failure does not break KDS update', async () => {
    (ordersServiceMock.updateStatus as jest.Mock).mockResolvedValue({
      ...orderDetail,
      status: 'READY',
    });
    (ordersEventsMock.emitOrderStatusUpdated as jest.Mock).mockRejectedValue(new Error('event failure'));

    await expect(service.markReady('ord-1', ctx)).resolves.toMatchObject({ status: 'READY' });
  });

  it('always forwards context for multi-tenant isolation', async () => {
    (ordersServiceMock.updateStatus as jest.Mock).mockResolvedValue({
      ...orderDetail,
      status: 'IN_PREPARATION',
    });

    await service.startOrder('ord-1', ctx);

    expect(ordersServiceMock.updateStatus).toHaveBeenCalledWith('ord-1', 'IN_PREPARATION', ctx, {
      emitEvent: false,
    });
  });
});
