import type { PdvCheckoutInput } from '@delivery-futuro/shared-types';
import type { RequestContext } from '../common/request-context';

export interface PdvCheckoutRequestBody {
  storeId: string;
  customerId?: string;
  customer?: {
    name: string;
    phone: string;
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
  startInPreparation?: boolean;
}

export function mapPdvRequestToCheckoutInput(
  body: PdvCheckoutRequestBody,
  ctx: RequestContext,
): PdvCheckoutInput {
  return {
    companyId: ctx.companyId,
    channel: 'pdv',
    storeId: body.storeId,
    customerId: body.customerId,
    customer: body.customer,
    items: body.items,
    couponCode: body.couponCode,
    paymentMethod: body.paymentMethod,
    startInPreparation: body.startInPreparation,
  };
}

