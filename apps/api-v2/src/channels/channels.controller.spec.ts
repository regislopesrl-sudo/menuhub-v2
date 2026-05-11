import { BadRequestException, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { ChannelsController } from './channels.controller';

describe('ChannelsController hardening', () => {
  const checkoutService = {
    runDeliveryCheckout: jest.fn().mockResolvedValue({ order: { id: 'ord-kiosk' }, payment: { status: 'PENDING' } }),
    runPdvCheckout: jest.fn().mockResolvedValue({ order: { id: 'ord-waiter' }, payment: { status: 'APPROVED' } }),
  } as any;

  const prisma = {
    command: {
      findFirst: jest.fn(),
    },
  } as any;

  const controller = new ChannelsController(checkoutService, prisma);

  const baseCtx = {
    companyId: 'company-demo',
    branchId: 'branch-demo',
    requestId: 'req-1',
    userRole: 'waiter',
    permissions: ['waiter.operate'],
    source: 'jwt',
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.KIOSK_PUBLIC_TOKEN;
    process.env.NODE_ENV = 'test';
    process.env.APP_ENV = 'local';
  });

  it('kiosk exige x-idempotency-key', async () => {
    await expect(
      controller.kioskCheckout(
        {
          companyId: 'company-demo',
          branchId: 'branch-demo',
          customer: { name: 'Cliente', phone: '1199999' },
          items: [{ productId: 'p1', quantity: 1 }],
          paymentMethod: 'PIX',
        },
        baseCtx,
        { headers: {} },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('kiosk valida token quando configurado', async () => {
    process.env.KIOSK_PUBLIC_TOKEN = 'tok-123';
    await expect(
      controller.kioskCheckout(
        {
          companyId: 'company-demo',
          branchId: 'branch-demo',
          customer: { name: 'Cliente', phone: '1199999' },
          items: [{ productId: 'p1', quantity: 1 }],
          paymentMethod: 'PIX',
        },
        baseCtx,
        { headers: { 'x-idempotency-key': 'idem-1', 'x-kiosk-token': 'wrong' } },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('kiosk idempotency devolve mesma resposta em retry', async () => {
    const payload = {
      companyId: 'company-demo',
      branchId: 'branch-demo',
      customer: { name: 'Cliente', phone: '1199999' },
      items: [{ productId: 'p1', quantity: 1 }],
      paymentMethod: 'PIX',
    } as any;
    const req = { headers: { 'x-idempotency-key': 'idem-ok' }, ip: '127.0.0.1' };

    const first = await controller.kioskCheckout(payload, baseCtx, req);
    const second = await controller.kioskCheckout(payload, baseCtx, req);

    expect(first).toEqual(second);
    expect(checkoutService.runDeliveryCheckout).toHaveBeenCalledTimes(1);
  });

  it('kiosk rate limit bloqueia excesso', async () => {
    const payload = {
      companyId: 'company-demo',
      branchId: 'branch-demo',
      customer: { name: 'Cliente', phone: '1199999' },
      items: [{ productId: 'p1', quantity: 1 }],
      paymentMethod: 'PIX',
    } as any;

    for (let i = 0; i < 30; i += 1) {
      await controller.kioskCheckout(payload, baseCtx, {
        headers: { 'x-idempotency-key': `idem-${i}` },
        ip: '10.0.0.1',
      });
    }

    try {
      await controller.kioskCheckout(payload, baseCtx, {
        headers: { 'x-idempotency-key': 'idem-over' },
        ip: '10.0.0.1',
      });
      fail('expected rate limit error');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    }
  });

  it('waiter resolve comando aberto pela mesa', async () => {
    prisma.command.findFirst.mockResolvedValueOnce({ id: 'cmd-1', code: 'CMD-001' });

    await controller.waiterCheckout(
      {
        tableId: 'table-1',
        items: [{ productId: 'p1', quantity: 1 }],
        paymentMethod: 'CASH',
      },
      baseCtx,
    );

    expect(prisma.command.findFirst).toHaveBeenCalled();
    expect(checkoutService.runPdvCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ commandReference: 'CMD-001', saleType: 'TABLE' }),
      baseCtx,
    );
  });

  it('waiter bloqueia mesa sem comanda aberta', async () => {
    prisma.command.findFirst.mockResolvedValueOnce(null);

    await expect(
      controller.waiterCheckout(
        {
          tableId: 'table-404',
          items: [{ productId: 'p1', quantity: 1 }],
          paymentMethod: 'CASH',
        },
        baseCtx,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
