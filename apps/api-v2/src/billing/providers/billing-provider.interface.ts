import type { Invoice } from '@prisma/client';

export type BillingPaymentStatus = 'PENDING' | 'PAID' | 'FAILED';

export type BillingPaymentLinkResult = {
  provider: string;
  providerPaymentId: string;
  paymentUrl: string;
  status: BillingPaymentStatus;
};

export type BillingWebhookResult = {
  provider: string;
  eventId: string;
  providerPaymentId: string;
  status: BillingPaymentStatus;
  processed: boolean;
  reason?: string;
};

export interface BillingProvider {
  readonly providerName: string;
  createPaymentForInvoice(invoice: Invoice): Promise<BillingPaymentLinkResult>;
  getPaymentStatus(providerPaymentId: string): Promise<{ provider: string; providerPaymentId: string; status: BillingPaymentStatus }>;
  handleWebhook(payload: unknown, headers?: Record<string, string | string[] | undefined>): Promise<BillingWebhookResult>;
}
