import type { RequestContext } from '../../common/request-context';
import type {
  OnlineCardPaymentInput,
  PaymentStatus,
  WebhookResult,
} from '@delivery-futuro/shared-types';

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

export interface OnlineCardPaymentIntent {
  id: string;
  provider: string;
  providerPaymentId: string;
  method: 'CREDIT_CARD';
  status: Extract<PaymentStatus, 'PENDING' | 'APPROVED' | 'DECLINED'>;
  cardBrand?: string;
  maskedCard?: string;
  message?: string;
}

export type PaymentIntent = PixPaymentIntent | OnlineCardPaymentIntent;

export interface PaymentProvider {
  readonly providerName: string;
  createPixPayment(
    order: { id: string; orderNumber?: string; total: number },
    ctx: RequestContext,
  ): Promise<PixPaymentIntent>;
  createOnlineCardPayment?(
    order: { id: string; orderNumber?: string; total: number },
    ctx: RequestContext,
    input: OnlineCardPaymentInput,
  ): Promise<OnlineCardPaymentIntent>;
  getPaymentStatus(paymentId: string, ctx: RequestContext): Promise<{ id: string; status: PaymentStatus }>;
  handleWebhook(
    payload: unknown,
    options?: {
      signature?: string;
      requestId?: string;
      dataId?: string;
    },
  ): Promise<WebhookResult>;
}


