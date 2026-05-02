import { NormalizedDeliveryArea } from './delivery-area.repository';

export function calculateDeliveryFee(
  area: Pick<NormalizedDeliveryArea, 'pricingMode' | 'baseFee' | 'pricePerKm' | 'deliveryFee' | 'feeRules'>,
  distanceMeters?: number,
): number {
  if (area.pricingMode === 'PER_KM' && typeof distanceMeters === 'number' && Number.isFinite(distanceMeters)) {
    const distanceKm = distanceMeters / 1000;
    const baseFee = area.baseFee ?? 0;
    const pricePerKm = area.pricePerKm ?? 0;
    return roundMoney(baseFee + distanceKm * pricePerKm);
  }

  if (typeof distanceMeters === 'number' && Number.isFinite(distanceMeters) && area.feeRules.length > 0) {
    const distanceKm = distanceMeters / 1000;
    const sortedRules = [...area.feeRules].sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      if (distanceKm >= rule.minDistanceKm && distanceKm < rule.maxDistanceKm) {
        return roundMoney(rule.fee);
      }
    }
  }

  return roundMoney(area.deliveryFee);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
