import { BadRequestException, Injectable } from '@nestjs/common';
import type { Invoice } from '@prisma/client';
import type { BillingPaymentLinkResult, BillingProvider, BillingWebhookResult } from './billing-provider.interface';

@Injectable()
export class MercadoPagoBillingProvider implements BillingProvider {
  readonly providerName = 'mercado_pago';

  private ensureConfigured() {
    const token = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
    if (!token) {
      throw new BadRequestException('Mercado Pago billing provider not configured');
    }
  }

  async createPaymentForInvoice(_invoice: Invoice): Promise<BillingPaymentLinkResult> {
    this.ensureConfigured();
    throw new BadRequestException('Mercado Pago billing provider not configured');
  }

  async getPaymentStatus(providerPaymentId: string) {
    this.ensureConfigured();
    return {
      provider: this.providerName,
      providerPaymentId,
      status: 'PENDING' as const,
    };
  }

  async handleWebhook(
    _payload: unknown,
    headers?: Record<string, string | string[] | undefined>,
  ): Promise<BillingWebhookResult> {
    this.ensureConfigured();
    const expected = process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim();
    if (expected) {
      const incoming = headers?.['x-webhook-secret'];
      const received = Array.isArray(incoming) ? incoming[0] : incoming;
      if (!received || received !== expected) {
        throw new BadRequestException('Mercado Pago billing provider not configured');
      }
    }
    throw new BadRequestException('Mercado Pago billing provider not configured');
  }
}
