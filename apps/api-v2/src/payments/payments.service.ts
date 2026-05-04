import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { RequestContext } from '../common/request-context';
import { OrderPrismaRepository } from '../orders/order.prisma';
import { OrdersEventsService } from '../orders/orders-events.service';
import { PAYMENT_PROVIDER_TOKEN } from './providers/payment-provider.tokens';
import type { PaymentProvider } from './providers/payment-provider.interface';

@Injectable()
export class PaymentsService {
  private readonly processedEvents = new Set<string>();

  constructor(
    @Inject(PAYMENT_PROVIDER_TOKEN) private readonly provider: PaymentProvider,
    private readonly orderRepository: OrderPrismaRepository,
    private readonly ordersEvents: OrdersEventsService,
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

    if (this.processedEvents.has(eventId)) {
      return {
        provider,
        providerPaymentId: String(((payload as Record<string, unknown>)?.providerPaymentId) ?? ''),
        eventId,
        status: String(((payload as Record<string, unknown>)?.status) ?? 'PENDING'),
        processed: false,
        reason: 'DUPLICATE_EVENT',
      };
    }

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

    this.processedEvents.add(eventId);
    return result;
  }

  private normalizeStatus(status: string): 'APPROVED' | 'DECLINED' | 'EXPIRED' | 'PENDING' {
    const upper = String(status ?? '').toUpperCase();
    if (upper === 'APPROVED') return 'APPROVED';
    if (upper === 'DECLINED') return 'DECLINED';
    if (upper === 'EXPIRED') return 'EXPIRED';
    return 'PENDING';
  }
}
