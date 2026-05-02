import type { DeliveryCheckoutInput } from '@delivery-futuro/shared-types';
import type { RequestContext } from '../common/request-context';

export interface DeliveryCheckoutRequestBody {
  storeId: string;
  customerId?: string;
  customer: {
    name: string;
    phone: string;
  };
  deliveryAddress: {
    cep?: string;
    street: string;
    number: string;
    neighborhood: string;
    city?: string;
    reference?: string;
  };
  items: Array<{
    productId: string;
    quantity: number;
    selectedOptions?: Array<{
      groupId: string;
      optionId: string;
      name: string;
      price: number;
    }>;
  }>;
  couponCode?: string;
  paymentMethod: string;
}

export function mapDeliveryRequestToCheckoutInput(
  body: DeliveryCheckoutRequestBody,
  ctx: RequestContext,
): DeliveryCheckoutInput {
  return {
    companyId: ctx.companyId,
    channel: 'delivery',
    storeId: body.storeId,
    customerId: body.customerId,
    customer: body.customer,
    deliveryAddress: body.deliveryAddress,
    items: body.items,
    couponCode: body.couponCode,
    paymentMethod: body.paymentMethod,
  };
}
