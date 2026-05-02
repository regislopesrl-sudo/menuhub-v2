import { Inject, Injectable } from '@nestjs/common';
import type { RequestContext } from '../common/request-context';
import { ORDERS_EVENT_PUBLISHER, type OrdersEventPublisher } from './orders-event-publisher';
import type { OrderEventPayload } from './orders-events.types';

type OrderEventListener = (event: OrderEventPayload) => void;

@Injectable()
export class OrdersEventsService {
  private readonly listeners = new Set<OrderEventListener>();

  constructor(
    @Inject(ORDERS_EVENT_PUBLISHER)
    private readonly publisher: OrdersEventPublisher,
  ) {}

  async emitOrderCreated(order: { id: string; orderNumber: string; status: string }, ctx: RequestContext): Promise<void> {
    await this.emit({
      type: 'order.created',
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      timestamp: new Date().toISOString(),
      requestId: ctx.requestId,
    });
  }

  async emitOrderStatusUpdated(
    order: { id: string; orderNumber: string; status: string },
    ctx: RequestContext,
  ): Promise<void> {
    await this.emit({
      type: 'order.status_updated',
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      timestamp: new Date().toISOString(),
      requestId: ctx.requestId,
    });
  }

  subscribe(listener: OrderEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  protected async emit(event: OrderEventPayload): Promise<void> {
    await this.publisher.publish(event);
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // listener non-blocking by design
      }
    }
  }
}
