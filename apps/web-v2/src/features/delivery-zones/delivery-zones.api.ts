import { apiFetch } from '@/lib/api-fetch';

export type DeliveryZoneType = 'POSTAL_CODE' | 'POLYGON' | 'NEIGHBORHOOD' | 'RADIUS' | 'MANUAL';

export type DeliveryZone = {
  id: string;
  companyId: string;
  branchId: string;
  name: string;
  type: DeliveryZoneType;
  status: string;
  priority: number;
  deliveryFee: number;
  minimumOrderAmount: number | null;
  estimatedMinutesMin: number | null;
  estimatedMinutesMax: number | null;
  baseLatitude: number | null;
  baseLongitude: number | null;
  radiusKm: number | null;
  feePerKm: number | null;
  maxDistanceKm: number | null;
  courierFee: number | null;
  courierFeeType: string | null;
  isBlockedArea: boolean;
  blockedReason: string | null;
  requiresManualNegotiation: boolean;
  negotiationChannel: string | null;
  negotiationMessage: string | null;
  visibleOnDeliverySite: boolean;
  neighborhoods: DeliveryZoneNeighborhood[];
  postalCodeRanges: DeliveryZonePostalCodeRange[];
  polygonPoints: DeliveryZonePolygonPoint[];
  schedules: DeliveryZoneSchedule[];
  dynamicPricingRules: DeliveryZoneDynamicPricingRule[];
  createdAt: string;
  updatedAt: string;
};

export type DeliveryZoneNeighborhood = {
  id: string;
  neighborhood: string;
  alias: string | null;
  city: string | null;
  state: string | null;
  deliveryFeeOverride: number | null;
  courierFeeOverride: number | null;
  status: string;
  visibleOnDeliverySite: boolean;
};

export type DeliveryZonePostalCodeRange = {
  id: string;
  postalCodeStart: string;
  postalCodeEnd: string;
  deliveryFeeOverride: number | null;
  courierFeeOverride: number | null;
  status: string;
  visibleOnDeliverySite: boolean;
};

export type DeliveryZonePolygonPoint = {
  id: string;
  sortOrder: number;
  latitude: number;
  longitude: number;
};

export type DeliveryZoneSchedule = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  mode: string;
  status: string;
};

export type DeliveryZoneDynamicPricingRule = {
  id: string;
  name: string;
  status: string;
  dayOfWeek: number | null;
  startTime: string | null;
  endTime: string | null;
  adjustmentType: string;
  adjustmentAmount: number;
  priority: number;
};

export type DeliveryZoneValidation = {
  configured: boolean;
  deliverable: boolean;
  requiresManualNegotiation: boolean;
  reason: string | null;
  zoneId: string | null;
  zoneName: string | null;
  deliveryFee: number;
  courierFee: number | null;
  minimumOrderAmount: number | null;
  estimatedMinutesMin: number | null;
  estimatedMinutesMax: number | null;
  distanceKm: number | null;
  missingAmount: number | null;
  dynamicPricingApplied: boolean;
  dynamicPricingRuleName: string | null;
  message: string | null;
};

export function listDeliveryZones() {
  return apiFetch<{ items: DeliveryZone[]; total: number }>('/v2/delivery-zones', { method: 'GET' });
}

export function createDeliveryZone(input: Partial<DeliveryZone>) {
  return apiFetch<DeliveryZone>('/v2/delivery-zones', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateDeliveryZone(id: string, input: Partial<DeliveryZone>) {
  return apiFetch<DeliveryZone>(`/v2/delivery-zones/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function archiveDeliveryZone(id: string) {
  return apiFetch<DeliveryZone>(`/v2/delivery-zones/${id}/archive`, { method: 'POST' });
}

export function duplicateDeliveryZone(id: string) {
  return apiFetch<DeliveryZone>(`/v2/delivery-zones/${id}/duplicate`, { method: 'POST' });
}

export function addZoneNeighborhood(id: string, input: Record<string, unknown>) {
  return apiFetch<DeliveryZoneNeighborhood>(`/v2/delivery-zones/${id}/neighborhoods`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function addZonePostalCodeRange(id: string, input: Record<string, unknown>) {
  return apiFetch<DeliveryZonePostalCodeRange>(`/v2/delivery-zones/${id}/postal-code-ranges`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function addZonePolygonPoints(id: string, input: { points: Array<{ latitude: number; longitude: number }> }) {
  return apiFetch<DeliveryZone>(`/v2/delivery-zones/${id}/polygon-points`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function addZoneSchedule(id: string, input: Record<string, unknown>) {
  return apiFetch<DeliveryZoneSchedule>(`/v2/delivery-zones/${id}/schedules`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function createDynamicPricingRule(id: string, input: Partial<DeliveryZoneDynamicPricingRule>) {
  return apiFetch<DeliveryZoneDynamicPricingRule>(`/v2/delivery-zones/${id}/dynamic-pricing`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function validateDeliveryAddress(input: Record<string, unknown>) {
  return apiFetch<DeliveryZoneValidation>('/v2/delivery-zones/validate-address', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
