import type { RequestContext } from '../../common/request-context';
import type { PaymentStatus, WebhookResult } from '@delivery-futuro/shared-types';

export interface PixPaymentIntent {
  id: string;
  provider: string;
  providerPaymentId: string;
  method: 'PIX';
  status: Extract<PaymentStatus, 'PENDING' | 'APPROVED' | 'DECLINED' | 'EXPIRED'>;
  qrCode: string;
  qrCodeText: string;
  expiresAt: string;
}

export interface PaymentProvider {
  readonly providerName: string;
  createPixPayment(
    order: { id: string; orderNumber?: string; total: number },
    ctx: RequestContext,
  ): Promise<PixPaymentIntent>;
  getPaymentStatus(paymentId: string, ctx: RequestContext): Promise<{ id: string; status: PaymentStatus }>;
  handleWebhook(payload: unknown): Promise<WebhookResult>;
}
