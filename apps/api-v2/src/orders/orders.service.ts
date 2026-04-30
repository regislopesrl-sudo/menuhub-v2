import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import type { RequestContext } from '../common/request-context';
import { OrderPrismaRepository, type FindManyOrdersFilters } from './order.prisma';
import { OrdersEventsService } from './orders-events.service';

export interface OrderReadDto {
  id: string;
  orderNumber: string;
  status: string;
  totals: {
    subtotal: number;
    discount: number;
    deliveryFee: number;
    total: number;
  };
  deliveryFee: number;
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
    productId?: string | null;
    name: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    selectedOptions?: Array<{
      optionId?: string | null;
      name: string;
      price: number;
      quantity: number;
    }>;
  }>;
  paymentSummary?: {
    status: string;
    paidAmount: number;
    refundedAmount: number;
  };
  createdAt: string;
}

export interface OrderListItemDto {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  paymentStatus: string;
  createdAt: string;
}

export interface OrderListResponseDto {
  data: OrderListItemDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly orderRepository: OrderPrismaRepository,
    private readonly ordersEvents: OrdersEventsService,
  ) {}

  async getById(id: string, ctx: RequestContext): Promise<OrderReadDto> {
    const order = await this.orderRepository.findById(id, ctx);
    if (!order) {
      throw new NotFoundException(`Pedido '${id}' nao encontrado para a empresa atual.`);
    }

    return this.toOrderReadDto(order);
  }

  async updateStatus(
    id: string,
    status: string,
    ctx: RequestContext,
  ): Promise<OrderReadDto> {
    if (!Object.values(OrderStatus).includes(status as OrderStatus)) {
      throw new BadRequestException(`Status inválido: '${status}'.`);
    }

    const order = await this.orderRepository.updateStatus(id, status, ctx);
    if (!order) {
      throw new NotFoundException(`Pedido '${id}' nao encontrado para a empresa atual.`);
    }

    try {
      await this.ordersEvents.emitOrderStatusUpdated(
        {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
        },
        ctx,
      );
    } catch {
      // emitter non-blocking by design
    }

    return this.toOrderReadDto(order);
  }

  private toOrderReadDto(order: any): OrderReadDto {
    const snapshot = this.readCheckoutSnapshot(order.internalNotes);
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totals: {
        subtotal: Number(order.subtotal),
        discount: Number(order.discountAmount),
        deliveryFee: Number(order.deliveryFee),
        total: Number(order.totalAmount),
      },
      deliveryFee: Number(order.deliveryFee),
      customer: snapshot?.customer,
      deliveryAddress: snapshot?.deliveryAddress,
      items: order.items.map((item: any) => ({
        id: item.id,
        productId: item.productId,
        name: item.productNameSnapshot,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        totalPrice: Number(item.totalPrice),
        selectedOptions: (item.addons ?? []).map((addon: any) => ({
          optionId: addon.addonItemId,
          name: addon.nameSnapshot,
          price: Number(addon.priceSnapshot),
          quantity: Number(addon.quantity),
        })),
      })),
      paymentSummary: {
        status: order.paymentStatus,
        paidAmount: Number(order.paidAmount),
        refundedAmount: Number(order.refundedAmount),
      },
      createdAt: order.createdAt.toISOString(),
    };
  }

  private readCheckoutSnapshot(internalNotes: unknown):
    | {
        customer?: { name: string; phone: string };
        deliveryAddress?: {
          street: string;
          number: string;
          neighborhood: string;
          city?: string;
          reference?: string;
        };
      }
    | undefined {
    if (typeof internalNotes !== 'string' || !internalNotes.trim()) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(internalNotes) as {
        checkoutSnapshot?: {
          customer?: { name: string; phone: string };
          deliveryAddress?: {
            street: string;
            number: string;
            neighborhood: string;
            city?: string;
            reference?: string;
          };
        };
      };
      return parsed.checkoutSnapshot;
    } catch {
      return undefined;
    }
  }

  async list(
    ctx: RequestContext,
    query: {
      status?: string;
      page?: number;
      limit?: number;
      createdFrom?: string;
      createdTo?: string;
    },
  ): Promise<OrderListResponseDto> {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20) || 20));
    const createdFrom = query.createdFrom ? new Date(query.createdFrom) : undefined;
    const createdTo = query.createdTo ? new Date(query.createdTo) : undefined;

    const filters: FindManyOrdersFilters = {
      status: query.status,
      page,
      limit,
      createdFrom,
      createdTo,
    };

    const result = await this.orderRepository.findMany(ctx, filters);
    const data: OrderListItemDto[] = result.rows.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      total: Number(order.totalAmount),
      paymentStatus: order.paymentStatus,
      createdAt: order.createdAt.toISOString(),
    }));

    const totalPages = Math.max(1, Math.ceil(result.total / limit));
    return {
      data,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages,
      },
    };
  }
}
