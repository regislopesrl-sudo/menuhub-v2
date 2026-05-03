import type { CheckoutResult } from '@delivery-futuro/order-core';
import { OrderPrismaRepository } from './order.prisma';

describe('OrderPrismaRepository', () => {
  const checkoutResult: CheckoutResult = {
    order: {
      id: 'ord_local',
      channel: 'delivery',
      customerId: 'cust_1',
      customer: {
        name: 'Maria',
        phone: '11999990000',
      },
      deliveryAddress: {
        cep: '01001000',
        street: 'Rua A',
        number: '10',
        neighborhood: 'Centro',
        city: 'Sao Paulo',
        reference: 'Portao azul',
      },
      items: [
        {
          productId: 'p1',
          name: 'Pizza',
          quantity: 2,
          unitPrice: 30,
          selectedOptions: [{ groupId: 'grp_1', optionId: 'add_1', name: 'Queijo', price: 4 }],
        },
        { productId: 'p2', name: 'Refri', quantity: 1, unitPrice: 8 },
      ],
      status: 'CONFIRMED',
      totals: {
        subtotal: 68,
        deliveryFee: 8,
        discount: 0,
        total: 76,
      },
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    payment: {
      status: 'APPROVED',
      transactionId: 'txn_1',
    },
  };

  const ctxBase = {
    companyId: 'company_a',
    userRole: 'admin' as const,
    requestId: 'req-1234',
    channel: 'delivery' as const,
  };

  it('usa x-branch-id quando informado', async () => {
    const prismaMock = {
      branch: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: 'branch_a' }) // validation by id+company
          .mockResolvedValueOnce({ id: 'branch_a' }), // fallback not used, but keep stable
      },
      order: {
        create: jest.fn().mockResolvedValue({ id: 'order_db_1', items: [] }),
      },
    } as any;

    const repo = new OrderPrismaRepository(prismaMock);
    await repo.createOrder(
      checkoutResult,
      { ...ctxBase, branchId: 'branch_a' },
      {
        available: true,
        quoteId: 'q1',
        requestId: 'req-1234',
        areaId: 'area_1',
        fee: 8,
        estimatedMinutes: 30,
        minimumOrder: null,
        areaName: 'Centro',
        reason: null,
        message: null,
        distanceMeters: 2400,
        distanceKm: 2.4,
        durationSeconds: 600,
        address: { lat: -23.55, lng: -46.63 },
      },
      {
        publicTrackingToken: 'track_public_123',
      },
    );

    expect(prismaMock.branch.findFirst).toHaveBeenCalledWith({
      where: { id: 'branch_a', companyId: 'company_a' },
      select: { id: true },
    });
    expect(prismaMock.order.create).toHaveBeenCalled();
    const createData = prismaMock.order.create.mock.calls[0][0].data;
    expect(createData.deliveryAreaId).toBe('area_1');
    expect(createData.deliveryDistanceMeters).toBe(2400);
    expect(createData.deliveryDurationSec).toBe(600);
    expect(createData.items.create[0].addons.create).toEqual([
      {
        addonItemId: 'add_1',
        nameSnapshot: 'Queijo',
        priceSnapshot: 4,
        quantity: 1,
      },
    ]);
    const internalNotes = JSON.parse(createData.internalNotes);
    expect(internalNotes.checkoutSnapshot.customer.name).toBe('Maria');
    expect(internalNotes.checkoutSnapshot.deliveryAddress.neighborhood).toBe('Centro');
    expect(createData.publicTrackingToken).toBe('track_public_123');
    expect(createData.timelineEvents.create).toEqual(
      expect.objectContaining({
        eventType: 'order_created',
        newStatus: 'CONFIRMED',
        sourceAction: 'create_order',
      }),
    );
  });

  it('bloqueia branch de outra empresa', async () => {
    const prismaMock = {
      branch: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      order: {
        create: jest.fn(),
      },
    } as any;

    const repo = new OrderPrismaRepository(prismaMock);
    await expect(repo.createOrder(checkoutResult, { ...ctxBase, branchId: 'branch_x' })).rejects.toThrow(
      "Branch 'branch_x' nao pertence a company 'company_a'.",
    );
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it('fallback branch funciona sem x-branch-id', async () => {
    const prismaMock = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: 'branch_fallback' }),
      },
      order: {
        create: jest.fn().mockResolvedValue({ id: 'order_db_1', items: [] }),
      },
    } as any;

    const repo = new OrderPrismaRepository(prismaMock);
    await repo.createOrder(checkoutResult, ctxBase);

    expect(prismaMock.branch.findFirst).toHaveBeenCalledWith({
      where: { companyId: 'company_a' },
      select: { id: true },
    });
    const createCall = prismaMock.order.create.mock.calls[0][0];
    expect(createCall.data.branchId).toBe('branch_fallback');
  });

  it('preserva mapeamento delivery como WEB/DELIVERY', async () => {
    const prismaMock = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: 'branch_a' }),
      },
      order: {
        create: jest.fn().mockResolvedValue({ id: 'order_delivery', items: [] }),
      },
    } as any;

    const repo = new OrderPrismaRepository(prismaMock);
    await repo.createOrder(checkoutResult, ctxBase);

    const createData = prismaMock.order.create.mock.calls[0][0].data;
    expect(createData.orderType).toBe('DELIVERY');
    expect(createData.channel).toBe('WEB');
    expect(createData.commandId).toBeNull();
    expect(JSON.parse(createData.internalNotes).sourceChannel).toBe('delivery');
  });

  it('preserva mapeamento pdv como PDV/COUNTER', async () => {
    const prismaMock = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: 'branch_a' }),
      },
      order: {
        create: jest.fn().mockResolvedValue({ id: 'order_pdv', items: [] }),
      },
    } as any;

    const pdvResult: CheckoutResult = {
      ...checkoutResult,
      order: {
        ...checkoutResult.order,
        channel: 'pdv',
        deliveryAddress: undefined,
        totals: {
          ...checkoutResult.order.totals,
          deliveryFee: 0,
        },
      },
    };

    const repo = new OrderPrismaRepository(prismaMock);
    await repo.createOrder(pdvResult, { ...ctxBase, channel: 'pdv' }, undefined, { pdvSessionId: 'session_1' });

    const createData = prismaMock.order.create.mock.calls[0][0].data;
    expect(createData.orderType).toBe('COUNTER');
    expect(createData.channel).toBe('PDV');
    expect(JSON.parse(createData.internalNotes).pdv.sessionId).toBe('session_1');
  });

  it('mapeia kiosk como KIOSK sem cair em delivery', async () => {
    const prismaMock = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: 'branch_a' }),
      },
      order: {
        create: jest.fn().mockResolvedValue({ id: 'order_kiosk', items: [] }),
      },
    } as any;

    const kioskResult: CheckoutResult = {
      ...checkoutResult,
      order: {
        ...checkoutResult.order,
        channel: 'kiosk',
        deliveryAddress: undefined,
        totals: {
          ...checkoutResult.order.totals,
          deliveryFee: 0,
        },
      },
    };

    const repo = new OrderPrismaRepository(prismaMock);
    await repo.createOrder(kioskResult, { ...ctxBase, channel: 'kiosk' });

    const createData = prismaMock.order.create.mock.calls[0][0].data;
    expect(createData.orderType).toBe('KIOSK');
    expect(createData.channel).toBe('KIOSK');
    expect(JSON.parse(createData.internalNotes).sourceChannel).toBe('kiosk');
  });

  it('waiter_app exige commandId em vez de cair como delivery', async () => {
    const prismaMock = {
      branch: {
        findFirst: jest.fn(),
      },
      order: {
        create: jest.fn(),
      },
    } as any;

    const waiterResult: CheckoutResult = {
      ...checkoutResult,
      order: {
        ...checkoutResult.order,
        channel: 'waiter_app',
        deliveryAddress: undefined,
        totals: {
          ...checkoutResult.order.totals,
          deliveryFee: 0,
        },
      },
    };

    const repo = new OrderPrismaRepository(prismaMock);
    await expect(repo.createOrder(waiterResult, { ...ctxBase, channel: 'waiter_app' })).rejects.toThrow(
      'waiter_app exige commandId para vincular pedido a uma comanda.',
    );
    expect(prismaMock.branch.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it('mapeia waiter_app como COMMAND/WAITER_APP com origem documentada', async () => {
    const prismaMock = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: 'branch_a' }),
      },
      order: {
        create: jest.fn().mockResolvedValue({ id: 'order_waiter', items: [] }),
      },
    } as any;

    const waiterResult: CheckoutResult = {
      ...checkoutResult,
      order: {
        ...checkoutResult.order,
        channel: 'waiter_app',
        deliveryAddress: undefined,
        totals: {
          ...checkoutResult.order.totals,
          deliveryFee: 0,
        },
      },
    };

    const repo = new OrderPrismaRepository(prismaMock);
    await repo.createOrder(waiterResult, { ...ctxBase, channel: 'waiter_app' }, undefined, {
      commandId: 'command_1',
      tableId: 'table_1',
      tableSessionId: 'session_1',
    });

    const createData = prismaMock.order.create.mock.calls[0][0].data;
    const internalNotes = JSON.parse(createData.internalNotes);
    expect(createData.orderType).toBe('COMMAND');
    expect(createData.channel).toBe('WAITER_APP');
    expect(createData.commandId).toBe('command_1');
    expect(createData.deliveryFee).toBe(0);
    expect(createData.timelineEvents.create.channel).toBe('WAITER_APP');
    expect(internalNotes.sourceChannel).toBe('waiter_app');
    expect(internalNotes.waiter).toEqual({
      commandId: 'command_1',
      tableId: 'table_1',
      tableSessionId: 'session_1',
    });
  });

  it('retry de orderNumber em colisao', async () => {
    const prismaMock = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: 'branch_a' }),
      },
      order: {
        create: jest
          .fn()
          .mockRejectedValueOnce({ code: 'P2002', meta: { target: ['branch_id', 'order_number'] } })
          .mockResolvedValueOnce({ id: 'order_db_2', items: [] }),
      },
    } as any;

    const repo = new OrderPrismaRepository(prismaMock);
    const created = await repo.createOrder(checkoutResult, ctxBase);

    expect(created.id).toBe('order_db_2');
    expect(prismaMock.order.create).toHaveBeenCalledTimes(2);
  });

  it('falha clara apos 3 colisoes', async () => {
    const prismaMock = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: 'branch_a' }),
      },
      order: {
        create: jest
          .fn()
          .mockRejectedValue({ code: 'P2002', meta: { target: ['branch_id', 'order_number'] } }),
      },
    } as any;

    const repo = new OrderPrismaRepository(prismaMock);
    await expect(repo.createOrder(checkoutResult, ctxBase)).rejects.toThrow(
      'Nao foi possivel gerar orderNumber unico apos 3 tentativas para V2 checkout.',
    );
    expect(prismaMock.order.create).toHaveBeenCalledTimes(3);
  });

  it('findById respeita companyId', async () => {
    const prismaMock = {
      order: {
        findFirst: jest.fn().mockResolvedValue({ id: 'order_db_1' }),
      },
    } as any;

    const repo = new OrderPrismaRepository(prismaMock);
    await repo.findById('order_db_1', ctxBase);

    expect(prismaMock.order.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'order_db_1',
        companyId: 'company_a',
      },
      include: {
        items: {
          include: {
            addons: true,
          },
        },
        timelineEvents: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  });

  it('findById filtra por branchId quando informado', async () => {
    const prismaMock = {
      order: {
        findFirst: jest.fn().mockResolvedValue({ id: 'order_db_1' }),
      },
    } as any;

    const repo = new OrderPrismaRepository(prismaMock);
    await repo.findById('order_db_1', { ...ctxBase, branchId: 'branch_a' });

    expect(prismaMock.order.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'order_db_1',
        companyId: 'company_a',
        branchId: 'branch_a',
      },
      include: {
        items: {
          include: {
            addons: true,
          },
        },
        timelineEvents: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  });

  it('updateStatus registra timeline historica', async () => {
    const prismaMock = {
      order: {
        findFirst: jest.fn().mockResolvedValue({ id: 'order_db_1', status: 'CONFIRMED', channel: 'WEB' }),
        update: jest.fn().mockResolvedValue({ id: 'order_db_1', status: 'READY', items: [], timelineEvents: [] }),
      },
    } as any;

    const repo = new OrderPrismaRepository(prismaMock);
    await repo.updateStatus('order_db_1', 'READY', ctxBase);

    expect(prismaMock.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order_db_1' },
        data: expect.objectContaining({
          status: 'READY',
          timelineEvents: {
            create: expect.objectContaining({
              eventType: 'status_changed',
              previousStatus: 'CONFIRMED',
              newStatus: 'READY',
              payload: expect.objectContaining({
                type: 'status_changed',
                status: 'READY',
              }),
            }),
          },
        }),
      }),
    );
  });

  it('findMany aplica filtros e ordenacao', async () => {
    const prismaMock = {
      order: {
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any;

    const repo = new OrderPrismaRepository(prismaMock);
    await repo.findMany(
      { ...ctxBase, branchId: 'branch_a' },
      {
        status: 'CONFIRMED',
        page: 2,
        limit: 20,
        createdFrom: new Date('2026-05-01T00:00:00.000Z'),
        createdTo: new Date('2026-05-03T00:00:00.000Z'),
      },
    );

    const expectedWhere = {
      companyId: 'company_a',
      branchId: 'branch_a',
      status: 'CONFIRMED',
      createdAt: {
        gte: new Date('2026-05-01T00:00:00.000Z'),
        lte: new Date('2026-05-03T00:00:00.000Z'),
      },
    };
    expect(prismaMock.order.count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(prismaMock.order.findMany).toHaveBeenCalledWith({
      where: expectedWhere,
      orderBy: { createdAt: 'desc' },
      skip: 20,
      take: 20,
    });
  });

  it('findMany aplica filtros operacionais por canal, pagamento, ativos e busca', async () => {
    const prismaMock = {
      order: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any;

    const repo = new OrderPrismaRepository(prismaMock);
    await repo.findMany(
      { ...ctxBase, branchId: 'branch_a' },
      {
        channel: 'delivery',
        paymentStatus: 'PAID',
        activeOnly: true,
        search: 'Maria',
        sortBy: 'updatedAt',
        sortDirection: 'asc',
        page: 1,
        limit: 50,
      },
    );

    expect(prismaMock.order.count).toHaveBeenCalledWith({
      where: {
        companyId: 'company_a',
        branchId: 'branch_a',
        status: {
          in: [
            'DRAFT',
            'PENDING_CONFIRMATION',
            'CONFIRMED',
            'IN_PREPARATION',
            'READY',
            'WAITING_PICKUP',
            'WAITING_DISPATCH',
            'OUT_FOR_DELIVERY',
          ],
        },
        channel: 'WEB',
        paymentStatus: 'PAID',
        OR: [
          { orderNumber: { contains: 'Maria', mode: 'insensitive' } },
          { internalNotes: { contains: 'Maria', mode: 'insensitive' } },
        ],
      },
    });
    expect(prismaMock.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { updatedAt: 'asc' },
        skip: 0,
        take: 50,
      }),
    );
  });

  it('findMany delayedOnly busca ativos com createdAt antigo', async () => {
    const prismaMock = {
      order: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any;

    const repo = new OrderPrismaRepository(prismaMock);
    await repo.findMany(ctxBase, {
      delayedOnly: true,
      page: 1,
      limit: 20,
    });

    const where = prismaMock.order.count.mock.calls[0][0].where;
    expect(where.status.in).toContain('IN_PREPARATION');
    expect(where.createdAt.lte).toBeInstanceOf(Date);
  });

  it('summary respeita companyId/branchId e agrega por status/canal/pagamento', async () => {
    const prismaMock = {
      order: {
        count: jest
          .fn()
          .mockResolvedValueOnce(4)
          .mockResolvedValueOnce(2)
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(1),
        aggregate: jest.fn().mockResolvedValue({
          _sum: { totalAmount: 120, refundedAmount: 0 },
        })
          .mockResolvedValueOnce({
            _sum: { totalAmount: 120, refundedAmount: 0 },
          })
          .mockResolvedValueOnce({
            _sum: { totalAmount: 90, refundedAmount: 10 },
            _avg: { totalAmount: 45 },
          })
          .mockResolvedValueOnce({
            _sum: { totalAmount: 30, refundedAmount: 30 },
          }),
        groupBy: jest
          .fn()
          .mockResolvedValueOnce([{ channel: 'WEB', _count: { _all: 3 } }, { channel: 'PDV', _count: { _all: 1 } }])
          .mockResolvedValueOnce([{ status: 'CONFIRMED', _count: { _all: 2 } }])
          .mockResolvedValueOnce([{ paymentStatus: 'PAID', _count: { _all: 3 } }]),
      },
    } as any;

    const repo = new OrderPrismaRepository(prismaMock);
    const result = await repo.summary(
      { ...ctxBase, branchId: 'branch_a' },
      {
        dateFrom: new Date('2026-05-02T00:00:00.000Z'),
        dateTo: new Date('2026-05-02T23:59:59.999Z'),
        channel: 'delivery',
      },
    );

    expect(prismaMock.order.count).toHaveBeenCalledWith({
      where: {
        companyId: 'company_a',
        branchId: 'branch_a',
        channel: 'WEB',
        createdAt: {
          gte: new Date('2026-05-02T00:00:00.000Z'),
          lte: new Date('2026-05-02T23:59:59.999Z'),
        },
      },
    });
    expect(result.totalOrders).toBe(4);
    expect(result.grossRevenue).toBe(120);
    expect(result.netRevenue).toBe(80);
    expect(result.canceledRevenue).toBe(30);
    expect(result.averageTicket).toBe(45);
    expect(result.ordersByChannel).toEqual({ WEB: 3, PDV: 1 });
    expect(result.ordersByStatus).toEqual({ CONFIRMED: 2 });
    expect(result.paymentsByStatus).toEqual({ PAID: 3 });
    expect(prismaMock.order.aggregate).toHaveBeenCalledWith({
      where: {
        companyId: 'company_a',
        branchId: 'branch_a',
        channel: 'WEB',
        createdAt: {
          gte: new Date('2026-05-02T00:00:00.000Z'),
          lte: new Date('2026-05-02T23:59:59.999Z'),
        },
      },
      _sum: { totalAmount: true, refundedAmount: true },
    });
    expect(prismaMock.order.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { notIn: ['CANCELED', 'REFUNDED'] },
          paymentStatus: { notIn: ['CANCELED', 'REFUNDED'] },
        }),
        _avg: { totalAmount: true },
      }),
    );
    expect(prismaMock.order.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { status: { in: ['CANCELED', 'REFUNDED'] } },
            { paymentStatus: { in: ['CANCELED', 'REFUNDED'] } },
          ],
        }),
      }),
    );
  });

  it('findByProviderPaymentIdForCompany respeita companyId e branchId', async () => {
    const prismaMock = {
      order: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'ord_1',
          orderNumber: 'V2-1',
          status: 'CONFIRMED',
          paymentStatus: 'PAID',
        }),
      },
    } as any;

    const repo = new OrderPrismaRepository(prismaMock);
    await repo.findByProviderPaymentIdForCompany('pix_123', {
      ...ctxBase,
      branchId: 'branch_a',
    });

    expect(prismaMock.order.findFirst).toHaveBeenCalledWith({
      where: {
        companyId: 'company_a',
        branchId: 'branch_a',
        payments: {
          some: {
            providerTransactionId: 'pix_123',
          },
        },
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
      },
    });
  });
});
