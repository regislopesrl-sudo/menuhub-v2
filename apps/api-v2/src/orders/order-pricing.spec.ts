import { calculateOrderItemTotal } from './order-pricing';

describe('order-pricing', () => {
  it('soma unitario e adicionais por quantidade', () => {
    const total = calculateOrderItemTotal({
      quantity: 2,
      unitPrice: 30,
      addonPrices: [4, 1],
    });

    expect(total).toBe(70);
  });

  it('arredonda total para 2 casas', () => {
    const total = calculateOrderItemTotal({
      quantity: 3,
      unitPrice: 10.105,
      addonPrices: [0.335],
    });

    expect(total).toBe(31.32);
  });

  it('funciona sem adicionais', () => {
    const total = calculateOrderItemTotal({
      quantity: 1,
      unitPrice: 8,
    });

    expect(total).toBe(8);
  });
});

