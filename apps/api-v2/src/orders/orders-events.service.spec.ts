import { OrdersEventsService } from './orders-events.service';
import type { OrdersEventPublisher } from './orders-event-publisher';

describe('OrdersEventsService', () => {
  it('payload gerado corretamente e publisher recebe evento', async () => {
    const publish = jest.fn().mockResolvedValue(undefined);
    const publisher: OrdersEventPublisher = { publish };
    const service = new OrdersEventsService(publisher);

    await service.emitOrderCreated(
      { id: 'order_1', orderNumber: 'V2-1', status: 'CONFIRMED' },
      {
        companyId: 'company_a',
        branchId: 'branch_a',
        requestId: 'req_1',
        userRole: 'admin',
        channel: 'delivery',
      },
    );

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'order.created',
        companyId: 'company_a',
        branchId: 'branch_a',
        orderId: 'order_1',
        orderNumber: 'V2-1',
        status: 'CONFIRMED',
        requestId: 'req_1',
      }),
    );
  });
});

