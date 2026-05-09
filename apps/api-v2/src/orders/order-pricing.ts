export interface OrderItemPricingInput {
  quantity: number;
  unitPrice: number;
  addonPrices?: number[];
}

export function calculateOrderItemTotal(input: OrderItemPricingInput): number {
  const addonTotal = (input.addonPrices ?? []).reduce((sum, price) => sum + Number(price || 0), 0);
  const total = Number(input.quantity) * (Number(input.unitPrice) + addonTotal);
  return Number(total.toFixed(2));
}

