import { Injectable, OnModuleInit } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server } from 'socket.io';
import { OrdersEventsService } from './orders-events.service';
import type { OrderEventPayload } from './orders-events.types';

type SocketLike = {
  handshake?: {
    headers?: Record<string, string | string[] | undefined>;
    auth?: Record<string, unknown>;
    query?: Record<string, unknown>;
  };
  join: (room: string) => void;
};

@Injectable()
@WebSocketGateway({
  namespace: '/v2/orders',
  cors: {
    origin: '*',
  },
})
export class OrdersGateway implements OnModuleInit {
  @WebSocketServer()
  server?: Server;

  constructor(private readonly ordersEvents: OrdersEventsService) {}

  onModuleInit() {
    this.ordersEvents.subscribe((event) => this.forwardEvent(event));
  }

  handleConnection(client: SocketLike) {
    const handshake = client.handshake ?? {};
    const headers = handshake.headers ?? {};
    const auth = handshake.auth ?? {};
    const query = handshake.query ?? {};
    const companyId = this.resolveValue(headers, auth, query, ['x-company-id', 'companyId']);
    const branchId = this.resolveValue(headers, auth, query, ['x-branch-id', 'branchId']);
    this.resolveValue(headers, auth, query, ['x-user-role', 'userRole']);

    if (companyId) {
      client.join(OrdersGateway.companyRoom(companyId));
    } else {
      return;
    }
    if (branchId) {
      client.join(OrdersGateway.branchRoom(branchId));
    }
  }

  forwardEvent(event: OrderEventPayload): void {
    if (!this.server) {
      return;
    }

    try {
      this.server.to(OrdersGateway.companyRoom(event.companyId)).emit(event.type, event);
      if (event.branchId) {
        this.server.to(OrdersGateway.branchRoom(event.branchId)).emit(event.type, event);
      }
    } catch {
      // socket emission non-blocking by design
    }
  }

  static companyRoom(companyId: string): string {
    return `company:${companyId}`;
  }

  static branchRoom(branchId: string): string {
    return `branch:${branchId}`;
  }

  private readHeader(
    headers: Record<string, string | string[] | undefined>,
    key: string,
  ): string | undefined {
    const value = headers[key];
    if (typeof value === 'string') {
      const normalized = value.trim();
      return normalized.length > 0 ? normalized : undefined;
    }
    if (Array.isArray(value)) {
      const normalized = value[0]?.trim();
      return normalized && normalized.length > 0 ? normalized : undefined;
    }
    return undefined;
  }

  private readValue(source: Record<string, unknown>, key: string): string | undefined {
    const value = source[key];
    if (typeof value === 'string') {
      const normalized = value.trim();
      return normalized.length > 0 ? normalized : undefined;
    }
    if (Array.isArray(value) && typeof value[0] === 'string') {
      const normalized = value[0].trim();
      return normalized.length > 0 ? normalized : undefined;
    }
    return undefined;
  }

  private resolveValue(
    headers: Record<string, string | string[] | undefined>,
    auth: Record<string, unknown>,
    query: Record<string, unknown>,
    keys: string[],
  ): string | undefined {
    for (const key of keys) {
      const fromHeaders = this.readHeader(headers, key);
      if (fromHeaders) {
        return fromHeaders;
      }
    }
    for (const key of keys) {
      const fromAuth = this.readValue(auth, key);
      if (fromAuth) {
        return fromAuth;
      }
    }
    for (const key of keys) {
      const fromQuery = this.readValue(query, key);
      if (fromQuery) {
        return fromQuery;
      }
    }
    return undefined;
  }
}
