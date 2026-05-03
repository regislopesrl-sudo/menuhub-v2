import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { OnlineCardPaymentInput } from '@delivery-futuro/shared-types';
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

  createOnlineCardPayment(
    order: { id: string; orderNumber?: string; total: number },
    ctx: RequestContext,
    input?: OnlineCardPaymentInput,
  ) {
    if (!this.provider.createOnlineCardPayment) {
      throw new BadRequestException('Provider atual nao suporta cartao online. Use mock em HML/local ou conecte adquirente real.');
    }
    if (resolvePaymentCardModeFromEnv(this.provider.providerName) === 'mercadopago') {
      if (!input?.cardToken?.trim()) {
        throw new BadRequestException('Cartao online tokenizado exige cardToken no modo Mercado Pago.');
      }
      if (!input.paymentMethodId?.trim()) {
        throw new BadRequestException('Cartao online tokenizado exige paymentMethodId no modo Mercado Pago.');
      }
      if (!input.payerEmail?.trim()) {
        throw new BadRequestException('Cartao online tokenizado exige payerEmail no modo Mercado Pago.');
      }
      return this.provider.createOnlineCardPayment(order, ctx, input);
    }

    return this.provider.createOnlineCardPayment(order, ctx, {
      cardToken: input?.cardToken?.trim() || `mock_card_token_${order.id}`,
      paymentMethodId: input?.paymentMethodId?.trim() || 'mock_visa',
      installments: input?.installments && input.installments > 0 ? input.installments : 1,
      payerEmail: input?.payerEmail?.trim() || `checkout+${order.id}@deliveryfuturo.local`,
      issuerId: input?.issuerId?.trim() || undefined,
      identificationType: input?.identificationType?.trim() || undefined,
      identificationNumber: input?.identificationNumber?.trim() || undefined,
    });
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

  async handleWebhook(
    provider: string,
    payload: unknown,
    options?: {
      signature?: string;
      requestId?: string;
      dataId?: string;
    },
  ) {
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

    const result = await this.provider.handleWebhook(payload, options);
    const normalizedStatus = this.normalizeStatus(result.status);
    if (normalizedStatus !== 'PENDING') {
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

  private normalizeStatus(status: string): 'APPROVED' | 'DECLINED' | 'EXPIRED' | 'PENDING' | 'REFUNDED' {
    const upper = String(status ?? '').toUpperCase();
    if (upper === 'APPROVED') return 'APPROVED';
    if (upper === 'DECLINED') return 'DECLINED';
    if (upper === 'EXPIRED') return 'EXPIRED';
    if (upper === 'REFUNDED') return 'REFUNDED';
    return 'PENDING';
  }
}

export function resolvePaymentCardModeFromEnv(providerName?: string): 'mock' | 'mercadopago' {
  const explicit = (process.env.PAYMENT_CARD_MODE ?? '').trim().toLowerCase();
  if (explicit === 'mercadopago') return 'mercadopago';
  if (explicit === 'mock') return 'mock';
  return providerName === 'mercadopago' ? 'mercadopago' : 'mock';
}


