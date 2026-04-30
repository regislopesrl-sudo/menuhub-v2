import { Injectable } from '@nestjs/common';
import type { PaymentPort } from '@delivery-futuro/order-core';

@Injectable()
export class PaymentPortMock implements PaymentPort {
  async authorizePayment(input: Parameters<PaymentPort['authorizePayment']>[0]) {
    if (input.method.toUpperCase() === 'DENY') {
      return {
        status: 'DECLINED' as const,
        reason: 'Pagamento recusado pelo mock',
      };
    }

    if (input.method.toUpperCase() === 'PIX') {
      return {
        status: 'PENDING' as const,
        transactionId: `txn_${input.orderId}`,
      };
    }

    return {
      status: 'APPROVED' as const,
      transactionId: `txn_${input.orderId}`,
    };
  }
}
