import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { RequestContext } from '../../common/request-context';
import type { OnlineCardPaymentInput, PaymentStatus, WebhookResult } from '@delivery-futuro/shared-types';
import type { OnlineCardPaymentIntent, PaymentProvider, PixPaymentIntent } from './payment-provider.interface';

@Injectable()
export class MockPixPaymentProvider implements PaymentProvider {
  readonly providerName = 'mock';

  private readonly payments = new Map<string, { status: PaymentStatus; expiresAt?: string }>();

  async createPixPayment(
    order: { id: string; orderNumber?: string; total: number },
    _ctx: RequestContext,
  ): Promise<PixPaymentIntent> {
    const paymentId = `pix_${randomUUID()}`;
    const providerPaymentId = `mock_pix_${randomUUID()}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const qrCodeText = `000201PIXMOCK${order.id}${Math.round(order.total * 100)}`;
    const qrCode = `data:image/png;base64,${Buffer.from(`PIX:${qrCodeText}`).toString('base64')}`;

    this.payments.set(paymentId, { status: 'PENDING', expiresAt });

    return {
      id: paymentId,
      provider: this.providerName,
      providerPaymentId,
      method: 'PIX',
      status: 'PENDING',
      qrCode,
      qrCodeText,
      expiresAt,
    };
  }

  async createOnlineCardPayment(
    order: { id: string; orderNumber?: string; total: number },
    _ctx: RequestContext,
    input: OnlineCardPaymentInput,
  ): Promise<OnlineCardPaymentIntent> {
    const paymentId = `card_${randomUUID()}`;
    const providerPaymentId = `mock_card_${randomUUID()}`;
    const status: Extract<PaymentStatus, 'PENDING' | 'APPROVED' | 'DECLINED'> = 'APPROVED';
    this.payments.set(paymentId, { status });

    return {
      id: paymentId,
      provider: this.providerName,
      providerPaymentId,
      method: 'CREDIT_CARD',
      status,
      cardBrand: input.paymentMethodId?.toUpperCase() || 'MOCK',
      maskedCard: '**** **** **** 4242',
      message: order.orderNumber
        ? `Cartao online mock aprovado para pedido ${order.orderNumber}`
        : 'Cartao online mock aprovado',
    };
  }
  async getPaymentStatus(paymentId: string): Promise<{ id: string; status: PaymentStatus }> {
    const payment = this.payments.get(paymentId);
    if (!payment) {
      throw new BadRequestException('Pagamento PIX mock nao encontrado.');
    }

    return {
      id: paymentId,
      status: payment.status,
    };
  }

  async handleWebhook(payload: unknown): Promise<WebhookResult> {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Payload de webhook invalido.');
    }

    const eventId = String((payload as Record<string, unknown>).eventId ?? randomUUID());
    const providerPaymentId = String((payload as Record<string, unknown>).providerPaymentId ?? '');
    const status = String((payload as Record<string, unknown>).status ?? '').toUpperCase() as PaymentStatus;

    if (!providerPaymentId) {
      throw new BadRequestException('Webhook PIX mock sem providerPaymentId.');
    }

    if (!['PENDING', 'APPROVED', 'DECLINED', 'EXPIRED', 'REFUNDED'].includes(status)) {
      throw new BadRequestException('Webhook PIX mock com status invalido.');
    }

    return {
      provider: this.providerName,
      providerPaymentId,
      eventId,
      status,
      processed: true,
    };
  }
}

