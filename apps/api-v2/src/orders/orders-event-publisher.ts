import type { OrderEventPayload } from './orders-events.types';

export interface OrdersEventPublisher {
  publish(event: OrderEventPayload): Promise<void>;
}

export const ORDERS_EVENT_PUBLISHER = 'ORDERS_EVENT_PUBLISHER';

