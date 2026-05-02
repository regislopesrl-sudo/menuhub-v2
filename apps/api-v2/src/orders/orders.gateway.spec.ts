import { OrdersEventsService } from './orders-events.service';
import { OrdersGateway } from './orders.gateway';

describe('OrdersGateway', () => {
  function makeGateway() {
    const eventsService = new OrdersEventsService({
      publish: jest.fn().mockResolvedValue(undefined),
    });
    const gateway = new OrdersGateway(eventsService);

    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    (gateway as any).server = { to };

    return { gateway, eventsService, to, emit };
  }

  it('evento order.created e encaminhado', () => {
    const { gateway, to, emit } = makeGateway();
    gateway.forwardEvent({
      type: 'order.created',
      companyId: 'company_a',
      branchId: 'branch_a',
      orderId: 'order_1',
      orderNumber: 'V2-1',
      status: 'CONFIRMED',
      timestamp: new Date().toISOString(),
      requestId: 'req_1',
    });

    expect(to).toHaveBeenCalledWith('company:company_a');
    expect(emit).toHaveBeenCalledWith(
      'order.created',
      expect.objectContaining({ orderId: 'order_1', companyId: 'company_a' }),
    );
  });

  it('evento order.status_updated e encaminhado', () => {
    const { gateway, emit } = makeGateway();
    gateway.forwardEvent({
      type: 'order.status_updated',
      companyId: 'company_a',
      branchId: 'branch_a',
      orderId: 'order_1',
      orderNumber: 'V2-1',
      status: 'READY',
      timestamp: new Date().toISOString(),
      requestId: 'req_1',
    });

    expect(emit).toHaveBeenCalledWith(
      'order.status_updated',
      expect.objectContaining({ status: 'READY', requestId: 'req_1' }),
    );
  });

  it('emite para company room', () => {
    const { gateway, to } = makeGateway();
    gateway.forwardEvent({
      type: 'order.created',
      companyId: 'company_x',
      orderId: 'order_1',
      orderNumber: 'V2-1',
      status: 'CONFIRMED',
      timestamp: new Date().toISOString(),
      requestId: 'req_1',
    });
    expect(to).toHaveBeenCalledWith('company:company_x');
  });

  it('emite para branch room quando branchId existir', () => {
    const { gateway, to } = makeGateway();
    gateway.forwardEvent({
      type: 'order.created',
      companyId: 'company_x',
      branchId: 'branch_x',
      orderId: 'order_1',
      orderNumber: 'V2-1',
      status: 'CONFIRMED',
      timestamp: new Date().toISOString(),
      requestId: 'req_1',
    });
    expect(to).toHaveBeenCalledWith('company:company_x');
    expect(to).toHaveBeenCalledWith('branch:branch_x');
  });

  it('erro de socket nao quebra servico', () => {
    const eventsService = new OrdersEventsService({
      publish: jest.fn().mockResolvedValue(undefined),
    });
    const gateway = new OrdersGateway(eventsService);
    (gateway as any).server = {
      to: jest.fn().mockImplementation(() => {
        throw new Error('socket failure');
      }),
    };

    expect(() =>
      gateway.forwardEvent({
        type: 'order.created',
        companyId: 'company_x',
        orderId: 'order_1',
        orderNumber: 'V2-1',
        status: 'CONFIRMED',
        timestamp: new Date().toISOString(),
        requestId: 'req_1',
      }),
    ).not.toThrow();
  });

  it('quando OrdersEventsService emite, gateway repassa', async () => {
    const { gateway, eventsService, emit } = makeGateway();
    gateway.onModuleInit();

    await eventsService.emitOrderCreated(
      {
        id: 'order_9',
        orderNumber: 'V2-9',
        status: 'CONFIRMED',
      },
      {
        companyId: 'company_z',
        branchId: 'branch_z',
        requestId: 'req_9',
        userRole: 'admin',
      },
    );

    expect(emit).toHaveBeenCalledWith(
      'order.created',
      expect.objectContaining({ orderId: 'order_9', companyId: 'company_z' }),
    );
  });

  it('conecta usando headers', () => {
    const { gateway } = makeGateway();
    const join = jest.fn();
    gateway.handleConnection({
      handshake: {
        headers: {
          'x-company-id': 'company_h',
          'x-branch-id': 'branch_h',
          'x-user-role': 'admin',
        },
      },
      join,
    });

    expect(join).toHaveBeenCalledWith('company:company_h');
    expect(join).toHaveBeenCalledWith('branch:branch_h');
  });

  it('conecta usando auth', () => {
    const { gateway } = makeGateway();
    const join = jest.fn();
    gateway.handleConnection({
      handshake: {
        headers: {},
        auth: {
          companyId: 'company_a',
          branchId: 'branch_a',
          userRole: 'admin',
        },
      },
      join,
    });

    expect(join).toHaveBeenCalledWith('company:company_a');
    expect(join).toHaveBeenCalledWith('branch:branch_a');
  });

  it('conecta usando query', () => {
    const { gateway } = makeGateway();
    const join = jest.fn();
    gateway.handleConnection({
      handshake: {
        headers: {},
        query: {
          companyId: 'company_q',
          branchId: 'branch_q',
          userRole: 'admin',
        },
      },
      join,
    });

    expect(join).toHaveBeenCalledWith('company:company_q');
    expect(join).toHaveBeenCalledWith('branch:branch_q');
  });

  it('sem companyId nao entra em room', () => {
    const { gateway } = makeGateway();
    const join = jest.fn();
    gateway.handleConnection({
      handshake: {
        headers: {},
        auth: { branchId: 'branch_only' },
        query: { userRole: 'admin' },
      },
      join,
    });

    expect(join).not.toHaveBeenCalled();
  });

  it('branchId entra em branch room', () => {
    const { gateway } = makeGateway();
    const join = jest.fn();
    gateway.handleConnection({
      handshake: {
        headers: {
          'x-company-id': 'company_b',
        },
        auth: { branchId: 'branch_b' },
      },
      join,
    });

    expect(join).toHaveBeenCalledWith('company:company_b');
    expect(join).toHaveBeenCalledWith('branch:branch_b');
  });
});
