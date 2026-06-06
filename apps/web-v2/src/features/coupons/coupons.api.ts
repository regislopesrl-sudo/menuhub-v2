import { apiFetch } from '@/lib/api-fetch';

export type CouponDiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_DELIVERY';

export type Coupon = {
  id: string;
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  minimumOrderAmount: number | null;
  maxUses: number | null;
  perCustomerLimit: number | null;
  startsAt: string | null;
  endsAt: string | null;
  firstOrderOnly: boolean;
  isActive: boolean;
  createdAt: string;
};

export function listCoupons() {
  return apiFetch<{ items: Coupon[]; total: number }>('/v2/coupons', { method: 'GET' });
}

export function createCoupon(input: Partial<Coupon>) {
  return apiFetch<Coupon>('/v2/coupons', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateCoupon(id: string, input: Partial<Coupon>) {
  return apiFetch<Coupon>(`/v2/coupons/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function validateCoupon(input: { code: string; orderTotal: number; customerId?: string; appliedCouponCodes?: string[] }) {
  return apiFetch<{
    valid: boolean;
    coupon: Coupon;
    orderTotal: number;
    discountAmount: number;
    totalAfterDiscount: number;
    backendRecalculated: boolean;
  }>('/v2/coupons/validate', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
