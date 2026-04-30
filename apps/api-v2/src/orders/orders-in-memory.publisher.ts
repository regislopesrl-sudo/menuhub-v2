import { Injectable } from '@nestjs/common';
import type { OrdersEventPublisher } from './orders-event-publisher';
import type { OrderEventPayload } from './orders-events.types';

@Injectable()
export class InMemoryOrdersEventPublisher implements OrdersEventPublisher {
  private readonly events: OrderEventPayload[] = [];

  async publish(event: OrderEventPayload): Promise<void> {
    this.events.push(event);
  }

  getEventsSnapshot(): OrderEventPayload[] {
    return [...this.events];
  }
}

