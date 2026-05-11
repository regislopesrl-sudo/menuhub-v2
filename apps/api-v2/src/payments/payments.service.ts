import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { RequestContext } from '../common/request-context';
import { OrderPrismaRepository } from '../orders/order.prisma';
import { OrdersEventsService } from '../orders/orders-events.service';
import { PAYMENT_PROVIDER_TOKEN } from './providers/payment-provider.tokens';
import type { PaymentProvider } from './providers/payment-provider.interface';
import { PrismaService } from '../database/prisma.service';
import { sanitizeAuditMetadata } from '../common/audit-log';

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
