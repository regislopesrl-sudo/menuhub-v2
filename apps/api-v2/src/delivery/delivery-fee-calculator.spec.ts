import { calculateDeliveryFee } from './delivery-fee-calculator';

describe('calculateDeliveryFee', () => {
  it('PER_KM calcula corretamente', () => {
    const fee = calculateDeliveryFee(
      {
        pricingMode: 'PER_KM',
        baseFee: 3,
        pricePerKm: 2,
        deliveryFee: 99,
        feeRules: [],
      },
      2500,
    );

    expect(fee).toBe(8);
  });

  it('distancia 0 usa apenas baseFee', () => {
    const fee = calculateDeliveryFee(
      {
        pricingMode: 'PER_KM',
        baseFee: 5,
        pricePerKm: 3,
        deliveryFee: 99,
        feeRules: [],
      },
      0,
    );

    expect(fee).toBe(5);
  });

  it('arredonda valores decimais corretamente', () => {
    const fee = calculateDeliveryFee(
      {
        pricingMode: 'PER_KM',
        baseFee: 1.11,
        pricePerKm: 2.22,
        deliveryFee: 99,
        feeRules: [],
      },
      1234,
    );

    expect(fee).toBe(3.85);
  });

  it('DeliveryFeeRule por faixa ainda funciona', () => {
    const fee = calculateDeliveryFee(
      {
        pricingMode: 'FIXED',
        baseFee: null,
        pricePerKm: null,
        deliveryFee: 20,
        feeRules: [
          { minDistanceKm: 0, maxDistanceKm: 2, fee: 7, priority: 1 },
          { minDistanceKm: 2, maxDistanceKm: 5, fee: 11, priority: 1 },
        ],
      },
      3000,
    );

    expect(fee).toBe(11);
  });

  it('fallback deliveryFee ainda funciona', () => {
    const fee = calculateDeliveryFee(
      {
        pricingMode: 'FIXED',
        baseFee: null,
        pricePerKm: null,
        deliveryFee: 9,
        feeRules: [],
      },
      undefined,
    );

    expect(fee).toBe(9);
  });
});
