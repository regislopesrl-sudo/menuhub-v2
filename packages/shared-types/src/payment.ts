export type PaymentMethod = 'PIX' | 'CREDIT_CARD' | 'CASH';
export type PaymentStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'EXPIRED' | 'REFUNDED';

export interface OnlineCardPaymentInput {
  cardToken: string;
  paymentMethodId: string;
  installments: number;
  issuerId?: string;
  payerEmail: string;
  identificationType?: string;
  identificationNumber?: string;
}

export interface PaymentRequest {
  orderId: string;
  amount: number;
  method: PaymentMethod | string;
}

export interface PaymentResult {
  id?: string;
  provider?: string;
  providerPaymentId?: string;
  method?: PaymentMethod;
  status: PaymentStatus;
  transactionId?: string;
  reason?: string;
  qrCode?: string;
  qrCodeText?: string;
  expiresAt?: string;
  cardBrand?: string;
  maskedCard?: string;
}

export interface WebhookResult {
  provider: string;
  providerPaymentId: string;
  eventId: string;
  status: PaymentStatus;
  processed: boolean;
  reason?: string;
}
