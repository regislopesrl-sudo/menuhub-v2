import { Injectable } from '@nestjs/common';
import type { RequestContext } from '../common/request-context';
import { OrdersEventsService } from '../orders/orders-events.service';
import { OrdersService } from '../orders/orders.service';

const KDS_STATUSES = ['CONFIRMED', 'IN_PREPARATION', 'READY'] as const;

export interface KdsOrderCardDto {
  id: string;
  orderNumber: string;
  channel: string;
  status: string;
  createdAt: string;
  preparationStartedAt?: string;
  readyAt?: string;
  elapsedMinutes: number;
  totals: {
    subtotal: number;
    discount: number;
    deliveryFee: number;
    total: number;
  };
  customer?: {
    name: string;
    phone: string;
  };
  deliveryAddress?: {
    street: string;
    number: string;
    neighborhood: string;
    city?: string;
    reference?: string;
  };
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    selectedOptions?: Array<{
      optionId?: string | null;
      name: string;
      price: number;
      quantity: number;
    }>;
  }>;
}

@Injectable()
export class KdsService {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly ordersEvents: OrdersEventsService,
  ) {}

  async listOrders(ctx: RequestContext): Promise<{
    data: KdsOrderCardDto[];
    columns: {
      new: KdsOrderCardDto[];
      preparing: KdsOrderCardDto[];
      ready: KdsOrderCardDto[];
    };
  }> {
    const rows = await Promise.all(
      KDS_STATUSES.map((status) =>
        this.ordersService.list(ctx, {
          status,
          page: 1,
          limit: 100,
        }),
      ),
    );

    const ids = rows.flatMap((r) => r.data.map((item) => item.id));
    const uniqueIds = Array.from(new Set(ids));
    const details = await Promise.all(uniqueIds.map((id) => this.ordersService.getById(id, ctx)));

    const data = details
      .map<KdsOrderCardDto>((detail) => ({
        id: detail.id,
        orderNumber: detail.orderNumber,
        channel: detail.channel ?? 'unknown',
        status: detail.status,
        createdAt: detail.createdAt,
        preparationStartedAt: detail.preparationStartedAt,
        readyAt: detail.readyAt,
        elapsedMinutes: this.calcElapsedMinutes(detail.createdAt),
        totals: detail.totals,
        customer: detail.customer,
        deliveryAddress: detail.deliveryAddress,
        items: detail.items.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          selectedOptions: item.selectedOptions,
        })),
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    return {
      data,
      columns: {
        new: data.filter((order) => order.status === 'CONFIRMED'),
        preparing: data.filter((order) => order.status === 'IN_PREPARATION'),
        ready: data.filter((order) => order.status === 'READY'),
      },
    };
  }

  async startOrder(id: string, ctx: RequestContext): Promise<KdsOrderCardDto> {
    return this.updateKdsOrderStatus(id, 'IN_PREPARATION', ctx);
  }

  async markReady(id: string, ctx: RequestContext): Promise<KdsOrderCardDto> {
    return this.updateKdsOrderStatus(id, 'READY', ctx);
  }

  async bumpOrder(id: string, ctx: RequestContext): Promise<KdsOrderCardDto> {
    return this.updateKdsOrderStatus(id, 'FINALIZED', ctx);
  }

  private async updateKdsOrderStatus(
    id: string,
    status: string,
    ctx: RequestContext,
  ): Promise<KdsOrderCardDto> {
    const updated = await this.ordersService.updateStatus(id, status, ctx, { emitEvent: false });

    try {
      await this.ordersEvents.emitOrderStatusUpdated(
        {
          id: updated.id,
          orderNumber: updated.orderNumber,
          status: updated.status,
        },
        ctx,
      );
    } catch {
      // non-blocking by design
    }

    return {
      id: updated.id,
      orderNumber: updated.orderNumber,
      channel: updated.channel ?? 'unknown',
      status: updated.status,
      createdAt: updated.createdAt,
      preparationStartedAt: updated.preparationStartedAt,
      readyAt: updated.readyAt,
      elapsedMinutes: this.calcElapsedMinutes(updated.createdAt),
      totals: updated.totals,
      customer: updated.customer,
      deliveryAddress: updated.deliveryAddress,
      items: updated.items.map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        selectedOptions: item.selectedOptions,
      })),
    };
  }

  private calcElapsedMinutes(createdAt: string): number {
    const diffMs = Date.now() - new Date(createdAt).getTime();
    return Math.max(0, Math.floor(diffMs / 60000));
  }
}
