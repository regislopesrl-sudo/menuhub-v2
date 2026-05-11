import type { DeliveryCheckoutInput } from '@delivery-futuro/shared-types';
import type { RequestContext } from '../common/request-context';

export type KioskCheckoutRequestBody = {
  companyId?: string;
  branchId?: string;
  customerId?: string;
  customer: {
    name: string;
    phone: string;
  };
  deliveryAddress?: {
    cep?: string;
    street?: string;
    number?: string;
    neighborhood?: string;
    city?: string;
    reference?: string;
  };
  items: DeliveryCheckoutInput['items'];
  couponCode?: string;
  paymentMethod: string;
};

export function mapKioskRequestToCheckoutInput(
  body: KioskCheckoutRequestBody,
  ctx: RequestContext,
): DeliveryCheckoutInput {
  const companyId = body.companyId ?? ctx.companyId;
  const storeId = body.branchId ?? ctx.branchId;

  if (!companyId) {
    throw new Error('companyId obrigatorio para checkout kiosk.');
  }
  if (!storeId) {
    throw new Error('branchId/storeId obrigatorio para checkout kiosk.');
  }

  const address = body.deliveryAddress ?? {
    street: 'Retirada no totem',
    number: '-',
    neighborhood: '-',
  };

  return {
    companyId,
    storeId,
    channel: 'kiosk' as DeliveryCheckoutInput['channel'],
    fulfillmentType: 'TAKEOUT',
    customerId: body.customerId,
    customer: body.customer,
    deliveryAddress: {
      cep: address.cep,
      street: address.street ?? 'Retirada no totem',
      number: address.number ?? '-',
      neighborhood: address.neighborhood ?? '-',
      city: address.city,
      reference: address.reference,
    },
    items: body.items,
    couponCode: body.couponCode,
    paymentMethod: body.paymentMethod,
  };
}

