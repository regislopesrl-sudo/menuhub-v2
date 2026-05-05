import { Injectable } from '@nestjs/common';
import type { Invoice } from '@prisma/client';
import type { BillingProvider, BillingWebhookResult } from './billing-provider.interface';

@Injectable()
export class MockBillingProvider implements BillingProvider {
  readonly providerName = 'mock';

  async createPaymentForInvoice(invoice: Invoice) {
    return {
      provider: this.providerName,
      providerPaymentId: `mock_${invoice.id}_${Date.now()}`,
      paymentUrl: `/developer/companies/${invoice.companyId}/billing?mockPayment=${invoice.id}`,
      status: 'PENDING' as const,
    };
  }

  async getPaymentStatus(providerPaymentId: string) {
    return {
      provider: this.providerName,
      providerPaymentId,
      status: 'PENDING' as const,
    };
  }

  async handleWebhook(payload: unknown): Promise<BillingWebhookResult> {
    const body = (payload ?? {}) as Record<string, unknown>;
    return {
      provider: this.providerName,
      eventId: String(body.eventId ?? ''),
      providerPaymentId: String(body.providerPaymentId ?? ''),
      status: String(body.status ?? 'PENDING').toUpperCase() === 'PAID' ? 'PAID' : 'PENDING',
      processed: true,
    };
  }
}
