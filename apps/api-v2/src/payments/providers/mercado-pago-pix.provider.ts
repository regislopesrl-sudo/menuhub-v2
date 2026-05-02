import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { PaymentStatus, WebhookResult } from '@delivery-futuro/shared-types';
import type { RequestContext } from '../../common/request-context';
import type { PaymentProvider, PixPaymentIntent } from './payment-provider.interface';

interface MercadoPagoPaymentResponse {
  id: string | number;
  status?: string;
  date_of_expiration?: string | null;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
    };
  };
}

@Injectable()
export class MercadoPagoPixProvider implements PaymentProvider {
  readonly providerName = 'mercadopago';

  async createPixPayment(
    order: { id: string; orderNumber?: string; total: number },
    ctx: RequestContext,
  ): Promise<PixPaymentIntent> {
    const token = this.getRequiredEnv('MERCADO_PAGO_ACCESS_TOKEN');
    const notificationUrl = this.getRequiredEnv('MERCADO_PAGO_NOTIFICATION_URL');
    const payload = {
      transaction_amount: Number(order.total),
      description: order.orderNumber ? `Pedido ${order.orderNumber}` : `Pedido ${order.id}`,
      payment_method_id: 'pix',
      payer: {
        email: `checkout+${order.id}@deliveryfuturo.local`,
      },
      external_reference: order.id,
      notification_url: notificationUrl,
      metadata: {
        companyId: ctx.companyId,
        branchId: ctx.branchId ?? null,
        requestId: ctx.requestId,
      },
    };

    const response = await this.httpRequest<MercadoPagoPaymentResponse>({
      method: 'POST',
      path: '/v1/payments',
      token,
      body: payload,
      extraHeaders: {
        'X-Idempotency-Key': randomUUID(),
      },
    });

    const providerPaymentId = String(response.id ?? '');
    if (!providerPaymentId) {
      throw new InternalServerErrorException('Mercado Pago nao retornou id de pagamento PIX.');
    }

    const qrCodeText = response.point_of_interaction?.transaction_data?.qr_code ?? '';
    if (!qrCodeText) {
      throw new InternalServerErrorException('Mercado Pago nao retornou qr_code para pagamento PIX.');
    }

    const qrCodeBase64 = response.point_of_interaction?.transaction_data?.qr_code_base64 ?? '';
    const qrCode = qrCodeBase64 ? `data:image/png;base64,${qrCodeBase64}` : '';
    const expiresAt =
      response.date_of_expiration ?? new Date(Date.now() + 15 * 60 * 1000).toISOString();

    return {
      id: `mp_pix_${providerPaymentId}`,
      provider: this.providerName,
      providerPaymentId,
      method: 'PIX',
      status: this.mapMercadoPagoStatus(response.status),
      qrCode,
      qrCodeText,
      expiresAt,
    };
  }

  async getPaymentStatus(paymentId: string, _ctx: RequestContext): Promise<{ id: string; status: PaymentStatus }> {
    if (!paymentId?.trim()) {
      throw new BadRequestException('paymentId/providerPaymentId do Mercado Pago e obrigatorio.');
    }
    const payment = await this.fetchPaymentById(paymentId.trim());
    return {
      id: String(payment.id),
      status: this.mapMercadoPagoStatus(payment.status),
    };
  }

  async handleWebhook(payload: unknown): Promise<WebhookResult> {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Payload de webhook Mercado Pago invalido.');
    }
    const obj = payload as Record<string, unknown>;
    const paymentIdRaw = this.readPaymentIdFromWebhook(obj);
    if (!paymentIdRaw) {
      throw new BadRequestException(
        'Webhook Mercado Pago invalido: id do pagamento ausente (data.id).',
      );
    }

    const payment = await this.fetchPaymentById(paymentIdRaw);
    const eventId =
      String(obj.id ?? '') ||
      `${String(obj.type ?? 'payment')}:${paymentIdRaw}:${String(obj.action ?? 'updated')}`;

    return {
      provider: this.providerName,
      providerPaymentId: String(payment.id),
      eventId,
      status: this.mapMercadoPagoStatus(payment.status),
      processed: true,
    };
  }

  private readPaymentIdFromWebhook(payload: Record<string, unknown>): string | null {
    const direct = payload.providerPaymentId ?? payload.paymentId;
    if (typeof direct === 'string' && direct.trim()) {
      return direct.trim();
    }
    if (typeof direct === 'number') {
      return String(direct);
    }

    const data = payload.data as Record<string, unknown> | undefined;
    const nested = data?.id;
    if (typeof nested === 'string' && nested.trim()) {
      return nested.trim();
    }
    if (typeof nested === 'number') {
      return String(nested);
    }

    if (typeof payload.id === 'string' && /^\d+$/.test(payload.id)) {
      return payload.id;
    }
    if (typeof payload.id === 'number') {
      return String(payload.id);
    }

    return null;
  }

  private async fetchPaymentById(paymentId: string): Promise<MercadoPagoPaymentResponse> {
    const token = this.getRequiredEnv('MERCADO_PAGO_ACCESS_TOKEN');
    return this.httpRequest<MercadoPagoPaymentResponse>({
      method: 'GET',
      path: `/v1/payments/${encodeURIComponent(paymentId)}`,
      token,
    });
  }

  private async httpRequest<T>(input: {
    method: 'GET' | 'POST';
    path: string;
    token: string;
    body?: unknown;
    extraHeaders?: Record<string, string>;
  }): Promise<T> {
    const baseUrl = process.env.MERCADO_PAGO_API_BASE_URL?.trim() || 'https://api.mercadopago.com';
    const timeoutMs = Number(process.env.MERCADO_PAGO_TIMEOUT_MS ?? '10000') || 10000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}${input.path}`, {
        method: input.method,
        headers: {
          Authorization: `Bearer ${input.token}`,
          'Content-Type': 'application/json',
          ...(input.extraHeaders ?? {}),
        },
        body: input.body ? JSON.stringify(input.body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new BadRequestException(
          `Mercado Pago ${input.method} ${input.path} falhou (${response.status}): ${body}`,
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Falha ao comunicar com Mercado Pago: ${(error as Error)?.message ?? 'erro desconhecido'}`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private mapMercadoPagoStatus(statusRaw?: string): Extract<
    PaymentStatus,
    'PENDING' | 'APPROVED' | 'DECLINED' | 'EXPIRED'
  > {
    const status = String(statusRaw ?? '').toLowerCase();
    if (status === 'approved') return 'APPROVED';
    if (status === 'rejected' || status === 'cancelled') return 'DECLINED';
    if (status === 'expired') return 'EXPIRED';
    return 'PENDING';
  }

  private getRequiredEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
      throw new BadRequestException(`Env obrigatoria ausente para Mercado Pago: ${name}`);
    }
    return value;
  }
}
