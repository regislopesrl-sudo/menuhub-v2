import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { RequestContext } from '../common/request-context';
import { OrderPrismaRepository } from '../orders/order.prisma';
import { OrdersEventsService } from '../orders/orders-events.service';
import { PAYMENT_PROVIDER_TOKEN } from './providers/payment-provider.tokens';
import type { PaymentProvider } from './providers/payment-provider.interface';
import { PrismaService } from '../database/prisma.service';
import { sanitizeAuditMetadata } from '../common/audit-log';

type PaymentSnapshotStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'EXPIRED' | 'REFUNDED';
type PaymentReconciliationDivergence =
  | 'reconciled'
  | 'pending'
  | 'missing_payment_snapshot'
  | 'status_mismatch';

interface PaymentSnapshot {
  provider?: string | null;
  providerPaymentId?: string | null;
  status?: string | null;
  method?: string | null;
  updatedAt?: string | null;
}

interface PaymentReconciliationQuery {
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PAYMENT_PROVIDER_TOKEN) private readonly provider: PaymentProvider,
    private readonly orderRepository: OrderPrismaRepository,
    private readonly ordersEvents: OrdersEventsService,
    private readonly prisma: PrismaService,
  ) {}

  createPixPayment(order: { id: string; orderNumber?: string; total: number }, ctx: RequestContext) {
    return this.provider.createPixPayment(order, ctx);
  }

  getPaymentStatus(paymentId: string, ctx: RequestContext) {
    return this.provider.getPaymentStatus(paymentId, ctx);
  }

  async getPaymentStatusByProviderPaymentId(providerPaymentId: string, ctx: RequestContext) {
    const normalized = String(providerPaymentId ?? '').trim();
    if (!normalized) {
      throw new BadRequestException('providerPaymentId e obrigatorio.');
    }

    const order = await this.orderRepository.findByProviderPaymentIdForCompany(normalized, ctx);
    if (!order) {
      throw new NotFoundException(
        `Pagamento '${normalized}' nao encontrado para a empresa atual.`,
      );
    }

    return {
      providerPaymentId: normalized,
      paymentStatus: order.paymentStatus,
      orderStatus: order.status,
      orderId: order.id,
      orderNumber: order.orderNumber,
    };
  }

  async getMockReconciliation(ctx: RequestContext, query: PaymentReconciliationQuery = {}) {
    const limit = this.resolveReconciliationLimit(query.limit);
    const createdFrom = this.parseOptionalDate(query.dateFrom, 'dateFrom');
    const createdTo = this.parseOptionalDate(query.dateTo, 'dateTo');

    const rows = await this.prisma.order.findMany({
      where: {
        companyId: ctx.companyId,
        ...(ctx.branchId ? { branchId: ctx.branchId } : {}),
        ...(createdFrom || createdTo
          ? {
              createdAt: {
                ...(createdFrom ? { gte: createdFrom } : {}),
                ...(createdTo ? { lte: createdTo } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        totalAmount: true,
        paidAmount: true,
        refundedAmount: true,
        internalNotes: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const items = rows.map((order) => {
      const payment = this.readPaymentSnapshot(order.internalNotes);
      const providerStatus = this.normalizeSnapshotStatus(payment?.status);
      const expectedSummaryStatus = providerStatus
        ? this.expectedSummaryStatus(providerStatus)
        : null;
      const divergence = this.resolveReconciliationDivergence(
        String(order.paymentStatus),
        providerStatus,
        Boolean(payment),
      );

      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderStatus: String(order.status),
        paymentStatus: String(order.paymentStatus),
        expectedPaymentStatus: expectedSummaryStatus,
        provider: payment?.provider ?? null,
        providerPaymentId: payment?.providerPaymentId ?? null,
        providerStatus,
        method: payment?.method ?? null,
        totalAmount: Number(order.totalAmount ?? 0),
        paidAmount: Number(order.paidAmount ?? 0),
        refundedAmount: Number(order.refundedAmount ?? 0),
        divergence,
        recommendedAction: this.recommendedReconciliationAction(divergence),
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt?.toISOString?.() ?? null,
      };
    });

    const summary = items.reduce(
      (acc, item) => {
        acc.totalOrders += 1;
        acc.totalAmount = Number((acc.totalAmount + item.totalAmount).toFixed(2));
        acc.paidAmount = Number((acc.paidAmount + item.paidAmount).toFixed(2));
        acc.refundedAmount = Number((acc.refundedAmount + item.refundedAmount).toFixed(2));
        if (item.divergence === 'reconciled') acc.reconciled += 1;
        if (item.divergence === 'pending') acc.pending += 1;
        if (item.divergence === 'missing_payment_snapshot') acc.missingPaymentSnapshot += 1;
        if (item.divergence === 'status_mismatch') acc.statusMismatch += 1;
        return acc;
      },
      {
        totalOrders: 0,
        reconciled: 0,
        pending: 0,
        missingPaymentSnapshot: 0,
        statusMismatch: 0,
        totalAmount: 0,
        paidAmount: 0,
        refundedAmount: 0,
      },
    );

    return {
      mode: 'mock',
      provider: this.provider.providerName,
      scope: {
        companyId: ctx.companyId,
        branchId: ctx.branchId ?? null,
      },
      filters: {
        dateFrom: createdFrom?.toISOString() ?? null,
        dateTo: createdTo?.toISOString() ?? null,
        limit,
      },
      summary,
      items,
    };
  }

  async handleWebhook(provider: string, payload: unknown) {
    if (provider !== this.provider.providerName) {
      throw new BadRequestException(`Provider de webhook invalido: ${provider}`);
    }

    const eventId = String(((payload as Record<string, unknown> | null)?.eventId) ?? '');
    if (!eventId) {
      throw new BadRequestException('Payload de webhook invalido: eventId obrigatorio.');
    }

    const claimed = await this.tryClaimWebhookEvent(provider, eventId, payload);
    if (!claimed.canProcess) {
      console.warn(
        `[PaymentsService] Webhook duplicado ja processado. provider=${provider} eventId=${eventId}`,
      );
      return {
        provider,
        providerPaymentId: String(((payload as Record<string, unknown>)?.providerPaymentId) ?? ''),
        eventId,
        status: String(((payload as Record<string, unknown>)?.status) ?? 'PENDING'),
        processed: false,
        reason: 'DUPLICATE_EVENT',
      };
    }

    try {
      const result = await this.provider.handleWebhook(payload);
      const normalizedStatus = this.normalizeStatus(result.status);
      if (normalizedStatus !== 'PENDING') {
        const candidates = await this.orderRepository.findByProviderPaymentIdCandidates(result.providerPaymentId);
        if (candidates.length > 1) {
          throw new BadRequestException(
            `Webhook ambiguo para providerPaymentId '${result.providerPaymentId}'.`,
          );
        }
        const order = await this.orderRepository.findByProviderPaymentId(result.providerPaymentId);
        if (!order) {
          throw new NotFoundException(
            `Pedido nao encontrado para providerPaymentId '${result.providerPaymentId}'.`,
          );
        }

        const updated = await this.orderRepository.applyWebhookPaymentUpdate({
          orderId: order.id,
          paymentStatus: normalizedStatus,
          provider: result.provider,
          providerPaymentId: result.providerPaymentId,
          eventId: result.eventId,
        });
        if (!updated) {
          throw new NotFoundException(`Pedido '${order.id}' nao encontrado para atualizacao de webhook.`);
        }

        if (updated.status !== order.status) {
          try {
            await this.ordersEvents.emitOrderStatusUpdated(
              {
                id: updated.id,
                orderNumber: updated.orderNumber,
                status: updated.status,
              },
              {
                companyId: updated.companyId,
                branchId: updated.branchId,
                userRole: 'master',
                requestId: `webhook:${result.eventId}`,
              },
            );
          } catch {
            // emitter non-blocking by design
          }
        }
      }

      await this.markWebhookEventProcessed(provider, eventId);
      console.info(
        `[PaymentsService] Webhook processado com sucesso. provider=${provider} eventId=${eventId}`,
      );
      return result;
    } catch (error) {
      await this.releaseUnprocessedWebhookEvent(provider, eventId);
      console.warn(
        `[PaymentsService] Webhook falhou e ficou elegivel para retry. provider=${provider} eventId=${eventId}`,
      );
      throw error;
    }
  }

  private async tryClaimWebhookEvent(
    provider: string,
    eventId: string,
    payload: unknown,
  ): Promise<{ canProcess: boolean }> {
    try {
      await this.prisma.billingWebhookEvent.create({
        data: {
          provider,
          eventId,
          eventType: 'payments.webhook',
          payloadJson: this.sanitizeWebhookPayload(payload),
        },
      });
      return { canProcess: true };
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === 'P2002') {
        const existing = await this.prisma.billingWebhookEvent.findUnique({
          where: {
            provider_eventId: {
              provider,
              eventId,
            },
          },
          select: { processedAt: true },
        });
        if (existing?.processedAt) {
          return { canProcess: false };
        }
        console.warn(
          `[PaymentsService] Webhook existente sem processedAt. Tentando reprocessar. provider=${provider} eventId=${eventId}`,
        );
        return { canProcess: true };
      }
      throw error;
    }
  }

  private async releaseUnprocessedWebhookEvent(provider: string, eventId: string) {
    await this.prisma.billingWebhookEvent.deleteMany({
      where: { provider, eventId, processedAt: null },
    });
  }

  private async markWebhookEventProcessed(provider: string, eventId: string) {
    await this.prisma.billingWebhookEvent.updateMany({
      where: { provider, eventId, processedAt: null },
      data: { processedAt: new Date() },
    });
  }

  private resolveReconciliationLimit(limitRaw?: number): number {
    const limit = Number(limitRaw ?? 50);
    if (!Number.isFinite(limit) || limit <= 0) {
      throw new BadRequestException('limit deve ser maior que zero.');
    }
    return Math.min(200, Math.trunc(limit));
  }

  private parseOptionalDate(value: string | undefined, fieldName: 'dateFrom' | 'dateTo'): Date | undefined {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${fieldName} invalido.`);
    }
    return date;
  }

  private readPaymentSnapshot(internalNotes: unknown): PaymentSnapshot | null {
    if (typeof internalNotes !== 'string' || !internalNotes.trim()) {
      return null;
    }
    try {
      const parsed = JSON.parse(internalNotes) as { payment?: PaymentSnapshot };
      return parsed.payment && typeof parsed.payment === 'object' ? parsed.payment : null;
    } catch {
      return null;
    }
  }

  private normalizeSnapshotStatus(status: unknown): PaymentSnapshotStatus | null {
    const upper = String(status ?? '').toUpperCase();
    if (upper === 'APPROVED' || upper === 'PAID' || upper === 'AUTHORIZED') return 'APPROVED';
    if (upper === 'DECLINED' || upper === 'FAILED' || upper === 'CANCELED') return 'DECLINED';
    if (upper === 'EXPIRED') return 'EXPIRED';
    if (upper === 'REFUNDED' || upper === 'PARTIALLY_REFUNDED') return 'REFUNDED';
    if (upper === 'PENDING' || upper === 'INITIATED') return 'PENDING';
    return null;
  }

  private expectedSummaryStatus(status: PaymentSnapshotStatus): 'PAID' | 'UNPAID' | 'PENDING' | 'REFUNDED' {
    if (status === 'APPROVED') return 'PAID';
    if (status === 'REFUNDED') return 'REFUNDED';
    if (status === 'PENDING') return 'PENDING';
    return 'UNPAID';
  }

  private resolveReconciliationDivergence(
    summaryStatus: string,
    providerStatus: PaymentSnapshotStatus | null,
    hasPaymentSnapshot: boolean,
  ): PaymentReconciliationDivergence {
    if (!hasPaymentSnapshot) return 'missing_payment_snapshot';
    if (!providerStatus || providerStatus === 'PENDING' || summaryStatus === 'PENDING') return 'pending';
    const expected = this.expectedSummaryStatus(providerStatus);
    return summaryStatus === expected ? 'reconciled' : 'status_mismatch';
  }

  private recommendedReconciliationAction(divergence: PaymentReconciliationDivergence): string {
    if (divergence === 'reconciled') return 'none';
    if (divergence === 'pending') return 'await_webhook_or_retry';
    if (divergence === 'missing_payment_snapshot') return 'review_checkout_payment_snapshot';
    return 'review_payment_status_and_reprocess_webhook';
  }

  private normalizeStatus(status: string): 'APPROVED' | 'DECLINED' | 'EXPIRED' | 'PENDING' {
    const upper = String(status ?? '').toUpperCase();
    if (upper === 'APPROVED') return 'APPROVED';
    if (upper === 'DECLINED') return 'DECLINED';
    if (upper === 'EXPIRED') return 'EXPIRED';
    return 'PENDING';
  }

  private sanitizeWebhookPayload(payload: unknown): object {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return {};
    }
    return sanitizeAuditMetadata(payload as Record<string, unknown>) ?? {};
  }
}
