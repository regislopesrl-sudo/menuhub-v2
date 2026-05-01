import { Injectable } from '@nestjs/common';
import type { CheckoutResult } from '@delivery-futuro/order-core';
import type { RequestContext } from '../common/request-context';
import { PrismaService } from '../database/prisma.service';
import type { DeliveryQuoteResponse } from '../delivery/dto/delivery-quote.dto';
import type { PixPaymentIntent } from '../payments/providers/payment-provider.interface';

export interface FindManyOrdersFilters {
  status?: string;
  page: number;
  limit: number;
  createdFrom?: Date;
  createdTo?: Date;
}

@Injectable()
export class OrderPrismaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createOrder(
    result: CheckoutResult,
    ctx: RequestContext,
    deliveryQuote?: DeliveryQuoteResponse,
    options?: { pdvSessionId?: string },
  ) {
    const branchId = await this.resolveBranchId(ctx);
    const paymentReason = result.payment.reason ? String(result.payment.reason) : undefined;
    const customerSnapshot = result.order.customer
      ? {
          customer: {
            name: result.order.customer.name,
            phone: result.order.customer.phone,
          },
          deliveryAddress: result.order.deliveryAddress,
        }
      : undefined;

    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.order.create({
          data: {
            companyId: ctx.companyId,
            branchId,
            orderNumber: this.buildOrderNumber(),
            orderType: result.order.channel === 'pdv' ? 'COUNTER' : 'DELIVERY',
            channel: result.order.channel === 'pdv' ? 'PDV' : 'WEB',
            status: this.mapOrderStatus(result.order.status),
            paymentStatus: result.payment.status === 'APPROVED' ? 'PAID' : 'UNPAID',
            subtotal: result.order.totals.subtotal,
            discountAmount: result.order.totals.discount,
            deliveryFee: result.order.totals.deliveryFee,
            totalAmount: result.order.totals.total,
            deliveryAreaId: deliveryQuote?.areaId ?? null,
            deliveryDistanceMeters: deliveryQuote?.distanceMeters ?? 0,
            deliveryDurationSec: deliveryQuote?.durationSeconds ?? 0,
            notes: `V2 checkout requestId=${ctx.requestId}`,
            internalNotes: JSON.stringify({
              payment: {
                status: result.payment.status,
                method: result.payment.method,
                reason: paymentReason,
              },
              pdv: options?.pdvSessionId
                ? {
                    sessionId: options.pdvSessionId,
                  }
                : undefined,
              checkoutSnapshot: customerSnapshot,
              deliveryQuote,
            }),
            items: {
              create: result.order.items.map((item) => ({
                productId: item.productId,
                productNameSnapshot: item.name,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: Number(
                  (
                    item.quantity *
                    (item.unitPrice +
                      (item.selectedOptions ?? []).reduce((sum, option) => sum + option.price, 0))
                  ).toFixed(2),
                ),
                addons: {
                  create: (item.selectedOptions ?? []).map((option) => ({
                    addonItemId: option.optionId,
                    nameSnapshot: option.name,
                    priceSnapshot: option.price,
                    quantity: 1,
                  })),
                },
              })),
            },
          },
          include: {
            items: {
              include: {
                addons: true,
              },
            },
          },
        });
      } catch (error) {
        if (this.isOrderNumberCollision(error)) {
          lastError = error;
          continue;
        }
        throw error;
      }
    }

    throw new Error('Nao foi possivel gerar orderNumber unico apos 3 tentativas para V2 checkout.');
  }

  async findById(id: string, ctx: RequestContext) {
    return this.prisma.order.findFirst({
      where: {
        id,
        companyId: ctx.companyId,
        ...(ctx.branchId ? { branchId: ctx.branchId } : {}),
      },
      include: {
        items: {
          include: {
            addons: true,
          },
        },
      },
    });
  }

  async attachPaymentIntent(orderId: string, intent: PixPaymentIntent, ctx: RequestContext) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        companyId: ctx.companyId,
        ...(ctx.branchId ? { branchId: ctx.branchId } : {}),
      },
      select: {
        id: true,
        internalNotes: true,
      },
    });

    if (!order) {
      return null;
    }

    const snapshot = this.parseInternalNotes(order.internalNotes);
    snapshot.payment = {
      ...((snapshot.payment as Record<string, unknown> | undefined) ?? {}),
      provider: intent.provider,
      providerPaymentId: intent.providerPaymentId,
      status: intent.status,
      method: intent.method,
      expiresAt: intent.expiresAt,
    };

    return this.prisma.order.update({
      where: { id: order.id },
      data: {
        internalNotes: JSON.stringify(snapshot),
      },
      select: { id: true },
    });
  }

  async findByProviderPaymentId(providerPaymentId: string) {
    return this.prisma.order.findFirst({
      where: {
        internalNotes: {
          contains: `"providerPaymentId":"${providerPaymentId}"`,
        },
      },
      include: {
        items: {
          include: {
            addons: true,
          },
        },
      },
    });
  }

  async findByProviderPaymentIdForCompany(providerPaymentId: string, ctx: RequestContext) {
    return this.prisma.order.findFirst({
      where: {
        companyId: ctx.companyId,
        ...(ctx.branchId ? { branchId: ctx.branchId } : {}),
        internalNotes: {
          contains: `"providerPaymentId":"${providerPaymentId}"`,
        },
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
      },
    });
  }

  async applyWebhookPaymentUpdate(input: {
    orderId: string;
    paymentStatus: 'APPROVED' | 'DECLINED' | 'EXPIRED' | 'PENDING';
    provider: string;
    providerPaymentId: string;
    eventId: string;
  }) {
    const order = await this.prisma.order.findUnique({
      where: { id: input.orderId },
      select: {
        id: true,
        status: true,
        internalNotes: true,
      },
    });
    if (!order) {
      return null;
    }

    const snapshot = this.parseInternalNotes(order.internalNotes);
    snapshot.payment = {
      ...((snapshot.payment as Record<string, unknown> | undefined) ?? {}),
      provider: input.provider,
      providerPaymentId: input.providerPaymentId,
      status: input.paymentStatus,
      lastWebhookEventId: input.eventId,
      updatedAt: new Date().toISOString(),
    };

    let mappedOrderStatus = order.status;
    let mappedPaymentSummaryStatus: 'PAID' | 'UNPAID' | 'PENDING' = 'PENDING';
    if (input.paymentStatus === 'APPROVED') {
      mappedOrderStatus = 'CONFIRMED';
      mappedPaymentSummaryStatus = 'PAID';
    } else if (input.paymentStatus === 'DECLINED') {
      mappedOrderStatus = 'PENDING_CONFIRMATION';
      mappedPaymentSummaryStatus = 'UNPAID';
    } else if (input.paymentStatus === 'EXPIRED') {
      mappedPaymentSummaryStatus = 'UNPAID';
    } else {
      mappedPaymentSummaryStatus = 'PENDING';
    }

    return this.prisma.order.update({
      where: { id: order.id },
      data: {
        status: mappedOrderStatus,
        paymentStatus: mappedPaymentSummaryStatus,
        internalNotes: JSON.stringify(snapshot),
      },
      include: {
        items: {
          include: {
            addons: true,
          },
        },
      },
    });
  }

  async findMany(ctx: RequestContext, filters: FindManyOrdersFilters) {
    const where = {
      companyId: ctx.companyId,
      ...(ctx.branchId ? { branchId: ctx.branchId } : {}),
      ...(filters.status ? { status: filters.status as any } : {}),
      ...(filters.createdFrom || filters.createdTo
        ? {
            createdAt: {
              ...(filters.createdFrom ? { gte: filters.createdFrom } : {}),
              ...(filters.createdTo ? { lte: filters.createdTo } : {}),
            },
          }
        : {}),
    };

    const skip = (filters.page - 1) * filters.limit;
    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: filters.limit,
      }),
    ]);

    return { total, rows };
  }

  async findPdvOrdersForSession(input: {
    companyId: string;
    branchId: string;
    sessionId: string;
    openedAt: Date;
    closedAt?: Date | null;
  }) {
    return this.prisma.order.findMany({
      where: {
        companyId: input.companyId,
        branchId: input.branchId,
        channel: 'PDV',
        createdAt: {
          gte: input.openedAt,
          ...(input.closedAt ? { lte: input.closedAt } : {}),
        },
        internalNotes: {
          contains: `"sessionId":"${input.sessionId}"`,
        },
      },
      select: {
        id: true,
        totalAmount: true,
        internalNotes: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateStatus(id: string, status: string, ctx: RequestContext) {
    const existing = await this.prisma.order.findFirst({
      where: {
        id,
        companyId: ctx.companyId,
        ...(ctx.branchId ? { branchId: ctx.branchId } : {}),
      },
      select: { id: true },
    });

    if (!existing) {
      return null;
    }

    return this.prisma.order.update({
      where: { id: existing.id },
      data: { status: status as any },
      include: {
        items: {
          include: {
            addons: true,
          },
        },
      },
    });
  }

  private mapOrderStatus(status: string):
    | 'PENDING_CONFIRMATION'
    | 'CONFIRMED'
    | 'IN_PREPARATION'
    | 'READY'
    | 'DELIVERED'
    | 'CANCELED' {
    switch (status) {
      case 'CONFIRMED':
        return 'CONFIRMED';
      case 'PREPARING':
        return 'IN_PREPARATION';
      case 'READY':
        return 'READY';
      case 'DELIVERED':
        return 'DELIVERED';
      case 'CANCELLED':
        return 'CANCELED';
      case 'PAYMENT_FAILED':
      case 'CREATED':
      case 'PENDING_PAYMENT':
      default:
        return 'PENDING_CONFIRMATION';
    }
  }

  private buildOrderNumber(): string {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    const shortId = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `V2-${y}${m}${d}-${shortId}`;
  }

  private async resolveBranchId(ctx: RequestContext): Promise<string> {
    if (ctx.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: {
          id: ctx.branchId,
          companyId: ctx.companyId,
        },
        select: { id: true },
      });
      if (!branch) {
        throw new Error(`Branch '${ctx.branchId}' nao pertence a company '${ctx.companyId}'.`);
      }
      return branch.id;
    }

    const fallback = await this.prisma.branch.findFirst({
      where: {
        companyId: ctx.companyId,
      },
      select: { id: true },
    });
    if (!fallback) {
      throw new Error(`Nenhuma branch encontrada para company '${ctx.companyId}'.`);
    }
    return fallback.id;
  }

  private isOrderNumberCollision(error: unknown): boolean {
    const maybe = error as { code?: string; meta?: { target?: unknown } };
    if (maybe?.code !== 'P2002') {
      return false;
    }
    const target = maybe.meta?.target;
    if (Array.isArray(target)) {
      return target.includes('order_number') || target.includes('branch_id');
    }
    return true;
  }

  private parseInternalNotes(internalNotes: string | null): Record<string, unknown> {
    if (!internalNotes?.trim()) {
      return {};
    }
    try {
      const parsed = JSON.parse(internalNotes);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  }
}
