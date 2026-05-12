import { Injectable } from '@nestjs/common';
import type { RequestContext } from '../common/request-context';
import { OrdersEventsService } from '../orders/orders-events.service';
import { OrdersService } from '../orders/orders.service';
import { KDS_STATIONS, resolveKdsPrepTargetMinutes, resolveKdsStation, type KdsStationKey } from './kds-routing';

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
  station: KdsStationKey;
  routing: {
    source: 'product' | 'channel';
    itemStations: Array<{ station: KdsStationKey; label: string; count: number }>;
  };
  totals: {
    subtotal: number;
    discount: number;
    deliveryFee: number;
    total: number;
  };
  customer?: {
    name: string;
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
  station: KdsStationKey;
  printedAt: string;
  content: string;
}

export interface KdsStationDto {
  key: KdsStationKey;
  label: string;
  prepTargetMinutes: number;
  productStationKeys: readonly string[];
  routingDescription: string;
}

@Injectable()
export class KdsService {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly ordersEvents: OrdersEventsService,
  ) {}

  listStations(): KdsStationDto[] {
    return KDS_STATIONS.map((station) => ({ ...station }));
  }

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
        const routing = this.resolveRouting(detail);
        const station = routing.station;
        const elapsed = this.calcElapsedMinutes(detail.createdAt);
        const prepTargetMinutes = resolveKdsPrepTargetMinutes(station);
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
          routing: { source: routing.source, itemStations: routing.itemStations },
          totals: detail.totals,
          customer: this.sanitizeCustomer(detail.customer),
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
    const routing = this.resolveRouting(detail);
    const station = routing.station;
    const lines = [
      `COMANDA COZINHA - ${detail.orderNumber}`,
      `Canal: ${detail.channel ?? 'unknown'}`,
      `Status: ${detail.status}`,
      `Estacao: ${this.stationLabel(station)}`,
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

    const routing = this.resolveRouting(updated);
    const elapsed = this.calcElapsedMinutes(updated.createdAt);
    const prepTargetMinutes = resolveKdsPrepTargetMinutes(routing.station);

    return {
      id: updated.id,
      orderNumber: updated.orderNumber,
      channel: updated.channel ?? 'unknown',
      status: updated.status,
      createdAt: updated.createdAt,
      preparationStartedAt: updated.preparationStartedAt,
      readyAt: updated.readyAt,
      elapsedMinutes: elapsed,
      prepTargetMinutes,
      lateMinutes: Math.max(0, elapsed - prepTargetMinutes),
      priorityLevel: this.resolvePriority(elapsed, prepTargetMinutes),
      station: routing.station,
      routing: { source: routing.source, itemStations: routing.itemStations },
      totals: updated.totals,
      customer: this.sanitizeCustomer(updated.customer),
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

  private resolveRouting(detail: { channel?: string | null; items?: Array<{ station?: string | null }> }) {
    const station = resolveKdsStation({
      channel: detail.channel,
      itemStations: (detail.items ?? []).map((item) => item.station),
    });
    return {
      station,
      source: (detail.items ?? []).some((item) => item.station) ? 'product' as const : 'channel' as const,
      itemStations: this.countItemStations(detail.items ?? []),
    };
  }

  private countItemStations(items: Array<{ station?: string | null }>): Array<{ station: KdsStationKey; label: string; count: number }> {
    const counts = new Map<KdsStationKey, number>();
    for (const item of items) {
      if (!item.station) continue;
      const station = resolveKdsStation({ itemStations: [item.station] });
      counts.set(station, (counts.get(station) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([station, count]) => ({ station, label: this.stationLabel(station), count }));
  }

  private stationLabel(station: KdsStationKey): string {
    return KDS_STATIONS.find((item) => item.key === station)?.label ?? station;
  }

  private sanitizeCustomer(customer?: { name?: string | null } | null): { name: string } | undefined {
    const name = String(customer?.name ?? '').trim();
    return name ? { name } : undefined;
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
