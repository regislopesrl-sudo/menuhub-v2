import type {
  DeliveryCheckoutInput,
  OrderChannel,
  MenuValidationItemInput,
  MenuValidationResult,
  PaymentRequest,
  PaymentResult,
} from '@delivery-futuro/shared-types';

export interface MenuPort {
  validateItems(input: {
    companyId: string;
    storeId: string;
    channel: DeliveryCheckoutInput['channel'] | OrderChannel;
    items: MenuValidationItemInput[];
  }): Promise<MenuValidationResult>;
}

export interface PaymentPort {
  authorizePayment(input: PaymentRequest): Promise<PaymentResult>;
}
