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
  prepTargetMinutes: number;
  lateMinutes: number;
  priorityLevel: 'normal' | 'attention' | 'urgent';
  station: 'hot_kitchen' | 'cold_kitchen' | 'assembly' | 'expedition';
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

export interface KdsPrintTicketDto {
  orderId: string;
  orderNumber: string;
  station: 'hot_kitchen' | 'cold_kitchen' | 'assembly' | 'expedition';
  printedAt: string;
  content: string;
}

@Injectable()
export class KdsService {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly ordersEvents: OrdersEventsService,
  ) {}

  async listOrders(
    ctx: RequestContext,
    filters?: { station?: string; channel?: string },
  ): Promise<{
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
      .map<KdsOrderCardDto>((detail) => {
        const station = this.resolveStation(detail.channel ?? 'unknown');
        const elapsed = this.calcElapsedMinutes(detail.createdAt);
        const prepTargetMinutes = this.resolvePrepTargetMinutes(station);
        return {
          id: detail.id,
          orderNumber: detail.orderNumber,
          channel: detail.channel ?? 'unknown',
          status: detail.status,
          createdAt: detail.createdAt,
          preparationStartedAt: detail.preparationStartedAt,
          readyAt: detail.readyAt,
          elapsedMinutes: elapsed,
          prepTargetMinutes,
          lateMinutes: Math.max(0, elapsed - prepTargetMinutes),
          priorityLevel: this.resolvePriority(elapsed, prepTargetMinutes),
          station,
          totals: detail.totals,
          customer: detail.customer,
          deliveryAddress: detail.deliveryAddress,
          items: detail.items.map((item) => ({
            id: item.id,
            name: item.name,
            quantity: item.quantity,
            selectedOptions: item.selectedOptions,
          })),
        };
      })
      .filter((order) => {
        if (filters?.channel && order.channel.toLowerCase() !== filters.channel.toLowerCase()) return false;
        if (filters?.station && order.station.toLowerCase() !== filters.station.toLowerCase()) return false;
        return true;
      })
      .sort((a, b) => {
        if (b.lateMinutes !== a.lateMinutes) return b.lateMinutes - a.lateMinutes;
        return a.createdAt.localeCompare(b.createdAt);
      });

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

  async printKitchenTicket(id: string, ctx: RequestContext): Promise<KdsPrintTicketDto> {
    const detail = await this.ordersService.getById(id, ctx);
    const station = this.resolveStation(detail.channel ?? 'unknown');
    const lines = [
      `COMANDA COZINHA - ${detail.orderNumber}`,
      `Canal: ${detail.channel ?? 'unknown'}`,
      `Status: ${detail.status}`,
      `Estacao: ${station}`,
      '--- Itens ---',
      ...detail.items.map((item) => {
        const opts = item.selectedOptions?.length
          ? ` (+ ${item.selectedOptions.map((opt) => opt.name).join(', ')})`
          : '';
        return `${item.quantity}x ${item.name}${opts}`;
      }),
    ];

    return {
      orderId: detail.id,
      orderNumber: detail.orderNumber,
      station,
      printedAt: new Date().toISOString(),
      content: lines.join('\n'),
    };
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
      prepTargetMinutes: this.resolvePrepTargetMinutes(this.resolveStation(updated.channel ?? 'unknown')),
      lateMinutes: Math.max(
        0,
        this.calcElapsedMinutes(updated.createdAt) -
          this.resolvePrepTargetMinutes(this.resolveStation(updated.channel ?? 'unknown')),
      ),
      priorityLevel: this.resolvePriority(
        this.calcElapsedMinutes(updated.createdAt),
        this.resolvePrepTargetMinutes(this.resolveStation(updated.channel ?? 'unknown')),
      ),
      station: this.resolveStation(updated.channel ?? 'unknown'),
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

  private resolveStation(channel: string): 'hot_kitchen' | 'cold_kitchen' | 'assembly' | 'expedition' {
    const normalized = String(channel).toUpperCase();
    if (normalized === 'PDV' || normalized === 'KIOSK' || normalized === 'WAITER_APP') return 'hot_kitchen';
    if (normalized === 'WEB' || normalized === 'WHATSAPP') return 'assembly';
    return 'expedition';
  }

  private resolvePrepTargetMinutes(station: 'hot_kitchen' | 'cold_kitchen' | 'assembly' | 'expedition'): number {
    if (station === 'hot_kitchen') return 20;
    if (station === 'cold_kitchen') return 12;
    if (station === 'assembly') return 10;
    return 8;
  }

  private resolvePriority(
    elapsedMinutes: number,
    prepTargetMinutes: number,
  ): 'normal' | 'attention' | 'urgent' {
    if (elapsedMinutes > prepTargetMinutes + 5) return 'urgent';
    if (elapsedMinutes >= prepTargetMinutes) return 'attention';
    return 'normal';
  }
}
