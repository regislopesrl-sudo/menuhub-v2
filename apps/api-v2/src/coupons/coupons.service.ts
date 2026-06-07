import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CouponDiscountType } from '@prisma/client';
import type { RequestContext } from '../common/request-context';
import { PrismaService } from '../database/prisma.service';

type CouponInput = {
  code?: string;
  discountType?: CouponDiscountType;
  discountValue?: number;
  minimumOrderAmount?: number | null;
  maxUses?: number | null;
  perCustomerLimit?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  firstOrderOnly?: boolean;
  isActive?: boolean;
};

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ctx: RequestContext) {
    const items = await this.prisma.coupon.findMany({
      where: { companyId: ctx.companyId },
      orderBy: { createdAt: 'desc' },
    });
    return { items: items.map((coupon) => this.mapCoupon(coupon)), total: items.length };
  }

  async create(ctx: RequestContext, body: CouponInput) {
    const code = this.normalizeCode(body.code);
    const discountType = body.discountType ?? CouponDiscountType.FIXED_AMOUNT;
    const discountValue = this.positiveMoney(body.discountValue, 'Valor do desconto');
    this.assertDiscount(discountType, discountValue);
    const existing = await this.prisma.coupon.findFirst({ where: { companyId: ctx.companyId, code }, select: { id: true } });
    if (existing) {
      throw new BadRequestException('Ja existe cupom com este codigo.');
    }
    const coupon = await this.prisma.coupon.create({
      data: {
        companyId: ctx.companyId,
        code,
        discountType,
        discountValue: discountValue as any,
        minimumOrderAmount: this.optionalMoney(body.minimumOrderAmount) as any,
        maxUses: this.optionalInt(body.maxUses),
        perCustomerLimit: this.optionalInt(body.perCustomerLimit),
        startsAt: this.optionalDate(body.startsAt),
        endsAt: this.optionalDate(body.endsAt),
        firstOrderOnly: Boolean(body.firstOrderOnly),
        isActive: body.isActive ?? true,
      },
    });
    return this.mapCoupon(coupon);
  }

  async update(ctx: RequestContext, couponId: string, body: CouponInput) {
    const current = await this.prisma.coupon.findFirst({ where: { id: couponId, companyId: ctx.companyId } });
    if (!current) throw new NotFoundException('Cupom nao encontrado.');

    const discountType = body.discountType ?? current.discountType;
    const discountValue =
      body.discountValue !== undefined ? this.positiveMoney(body.discountValue, 'Valor do desconto') : Number(current.discountValue);
    this.assertDiscount(discountType, discountValue);

    const nextCode = body.code !== undefined ? this.normalizeCode(body.code) : undefined;
    if (nextCode) {
      const existing = await this.prisma.coupon.findFirst({
        where: { companyId: ctx.companyId, code: nextCode, id: { not: couponId } },
        select: { id: true },
      });
      if (existing) {
        throw new BadRequestException('Ja existe cupom com este codigo para esta empresa.');
      }
    }

    const coupon = await this.prisma.coupon.update({
      where: { id: couponId },
      data: {
        ...(nextCode ? { code: nextCode } : {}),
        ...(body.discountType !== undefined ? { discountType } : {}),
        ...(body.discountValue !== undefined ? { discountValue: discountValue as any } : {}),
        ...(body.minimumOrderAmount !== undefined ? { minimumOrderAmount: this.optionalMoney(body.minimumOrderAmount) as any } : {}),
        ...(body.maxUses !== undefined ? { maxUses: this.optionalInt(body.maxUses) } : {}),
        ...(body.perCustomerLimit !== undefined ? { perCustomerLimit: this.optionalInt(body.perCustomerLimit) } : {}),
        ...(body.startsAt !== undefined ? { startsAt: this.optionalDate(body.startsAt) } : {}),
        ...(body.endsAt !== undefined ? { endsAt: this.optionalDate(body.endsAt) } : {}),
        ...(body.firstOrderOnly !== undefined ? { firstOrderOnly: Boolean(body.firstOrderOnly) } : {}),
        ...(body.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {}),
      },
    });
    return this.mapCoupon(coupon);
  }

  async validate(
    ctx: RequestContext,
    body: {
      code?: string;
      orderTotal?: number;
      customerId?: string;
      appliedCouponCodes?: string[];
    },
  ) {
    const code = this.normalizeCode(body.code);
    const orderTotal = this.nonNegativeMoney(body.orderTotal, 'Total do pedido');
    const duplicate = (body.appliedCouponCodes ?? []).map((item) => this.normalizeCode(item)).filter((item) => item === code);
    if (duplicate.length > 0) {
      throw new BadRequestException('Cupom nao pode ser aplicado duas vezes no mesmo pedido.');
    }

    const coupon = await this.prisma.coupon.findFirst({ where: { companyId: ctx.companyId, code } });
    if (!coupon || !coupon.isActive) {
      throw new BadRequestException('Cupom invalido ou inativo.');
    }

    const now = new Date();
    if (coupon.startsAt && coupon.startsAt > now) throw new BadRequestException('Cupom ainda nao iniciou.');
    if (coupon.endsAt && coupon.endsAt < now) throw new BadRequestException('Cupom expirado.');
    const minimumOrderAmount = Number(coupon.minimumOrderAmount ?? 0);
    if (minimumOrderAmount > 0 && orderTotal < minimumOrderAmount) {
      throw new BadRequestException('Pedido abaixo do valor minimo do cupom.');
    }

    if (coupon.firstOrderOnly && body.customerId) {
      const previousOrders = await this.prisma.order.count({
        where: { companyId: ctx.companyId, customerId: body.customerId },
      });
      if (previousOrders > 0) {
        throw new BadRequestException('Cupom permitido apenas para primeira compra.');
      }
    }

    const discount = this.calculateDiscount(coupon.discountType, Number(coupon.discountValue), orderTotal);
    return {
      valid: true,
      coupon: this.mapCoupon(coupon),
      orderTotal,
      discountAmount: discount,
      totalAfterDiscount: Number(Math.max(0, orderTotal - discount).toFixed(2)),
      backendRecalculated: true,
    };
  }

  private calculateDiscount(type: CouponDiscountType, value: number, total: number): number {
    if (type === CouponDiscountType.FREE_DELIVERY) return 0;
    const raw = type === CouponDiscountType.PERCENTAGE ? (total * value) / 100 : value;
    return Number(Math.min(total, Math.max(0, raw)).toFixed(2));
  }

  private mapCoupon(coupon: {
    id: string;
    code: string;
    discountType: CouponDiscountType;
    discountValue: unknown;
    minimumOrderAmount: unknown;
    maxUses: number | null;
    perCustomerLimit: number | null;
    startsAt: Date | null;
    endsAt: Date | null;
    firstOrderOnly: boolean;
    isActive: boolean;
    createdAt: Date;
  }) {
    return {
      ...coupon,
      discountValue: this.money(coupon.discountValue),
      minimumOrderAmount: coupon.minimumOrderAmount === null ? null : this.money(coupon.minimumOrderAmount),
    };
  }

  private assertDiscount(type: CouponDiscountType, value: number) {
    if (type === CouponDiscountType.PERCENTAGE && value > 100) {
      throw new BadRequestException('Desconto percentual nao pode passar de 100%.');
    }
  }

  private normalizeCode(value: unknown): string {
    const code = String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
    if (!code || code.length < 3 || code.length > 40) {
      throw new BadRequestException('Codigo do cupom invalido.');
    }
    return code;
  }

  private optionalDate(value: unknown): Date | null {
    if (value === null || value === undefined || value === '') return null;
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Data do cupom invalida.');
    return date;
  }

  private positiveMoney(value: unknown, label: string): number {
    const parsed = this.nonNegativeMoney(value, label);
    if (parsed <= 0) throw new BadRequestException(`${label} deve ser maior que zero.`);
    return parsed;
  }

  private nonNegativeMoney(value: unknown, label: string): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) throw new BadRequestException(`${label} invalido.`);
    return Number(parsed.toFixed(2));
  }

  private optionalMoney(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    return this.nonNegativeMoney(value, 'Valor');
  }

  private optionalInt(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) throw new BadRequestException('Limite invalido.');
    return parsed;
  }

  private money(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
  }
}
