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
      },
    });
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
        internalNotes: {
          contains: '"providerPaymentId":"pix_123"',
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
