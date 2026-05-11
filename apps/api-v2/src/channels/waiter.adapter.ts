import type { PdvCheckoutInput } from '@delivery-futuro/shared-types';
import type { RequestContext } from '../common/request-context';

export type WaiterCheckoutRequestBody = {
  customerId?: string;
  customer?: {
    name?: string;
    phone?: string;
  };
  items: PdvCheckoutInput['items'];
  couponCode?: string;
  paymentMethod: string;
  tableId?: string;
  commandReference?: string;
};

export function mapWaiterRequestToCheckoutInput(
  body: WaiterCheckoutRequestBody,
  ctx: RequestContext,
): PdvCheckoutInput & { commandReference: string } {
  if (!ctx.companyId) {
    throw new Error('companyId obrigatorio para checkout waiter.');
  }
  if (!ctx.branchId) {
    throw new Error('branchId obrigatorio para checkout waiter.');
  }
  const tableRef = String(body.tableId ?? '').trim();
  const commandRef = String(body.commandReference ?? '').trim();
  if (!tableRef && !commandRef) {
    throw new Error('tableId ou commandReference obrigatorio para checkout waiter.');
  }

  return {
    companyId: ctx.companyId,
    storeId: ctx.branchId,
    channel: 'waiter_app' as PdvCheckoutInput['channel'],
    customerId: body.customerId,
    customer:
      body.customer && (body.customer.name || body.customer.phone)
        ? {
            name: body.customer.name ?? 'Cliente salao',
            phone: body.customer.phone ?? 'N/A',
          }
        : undefined,
    items: body.items,
    couponCode: body.couponCode,
    paymentMethod: body.paymentMethod,
    commandReference: commandRef || tableRef,
  };
}

