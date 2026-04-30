import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RequestContext } from '../common/request-context';
import { normalizeGeoJsonPolygon, NormalizedGeoJsonPolygon } from './point-in-polygon';

export type NormalizedDeliveryFeeRule = {
  minDistanceKm: number;
  maxDistanceKm: number;
  fee: number;
  priority: number;
};

export type NormalizedDeliveryArea = {
  id: string;
  name: string;
  priority: number;
  estimatedMinutes: number;
  pricingMode: 'FIXED' | 'PER_KM' | string;
  deliveryFee: number;
  baseFee: number | null;
  pricePerKm: number | null;
  minimumOrder: number | null;
  polygons: NormalizedGeoJsonPolygon[];
  feeRules: NormalizedDeliveryFeeRule[];
};

@Injectable()
export class DeliveryAreaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveAreas(ctx: Pick<RequestContext, 'companyId' | 'branchId'>): Promise<NormalizedDeliveryArea[]> {
    const rows = await this.prisma.deliveryArea.findMany({
      where: {
        isActive: true,
        branch: { companyId: ctx.companyId },
        ...(ctx.branchId ? { branchId: ctx.branchId } : {}),
      },
      include: {
        polygons: {
          select: { geoJson: true },
        },
        feeRules: {
          select: {
            minDistanceKm: true,
            maxDistanceKm: true,
            fee: true,
            priority: true,
          },
        },
      },
    });

    return rows.map((row) => {
      const polygonInputs: unknown[] = [];
      if (row.polygonGeoJson != null) {
        polygonInputs.push(row.polygonGeoJson);
      }
      for (const poly of row.polygons) {
        polygonInputs.push(poly.geoJson);
      }

      const polygons = polygonInputs.map((polygonInput, index) => {
        try {
          return normalizeGeoJsonPolygon(polygonInput);
        } catch {
          throw new Error(`DeliveryArea ${row.id} has invalid polygon at index ${index}.`);
        }
      });

      return {
        id: row.id,
        name: row.name,
        priority: toNumber(row.priority, 0),
        estimatedMinutes: toNumber(row.estimatedMinutes, 0),
        pricingMode: row.pricingMode,
        deliveryFee: toNumber(row.deliveryFee, 0),
        baseFee: row.baseFee == null ? null : toNumber(row.baseFee, 0),
        pricePerKm: row.pricePerKm == null ? null : toNumber(row.pricePerKm, 0),
        minimumOrder: null,
        polygons,
        feeRules: row.feeRules.map((rule) => ({
          minDistanceKm: toNumber(rule.minDistanceKm, 0),
          maxDistanceKm: toNumber(rule.maxDistanceKm, Number.POSITIVE_INFINITY),
          fee: toNumber(rule.fee, 0),
          priority: toNumber(rule.priority, 0),
        })),
      };
    });
  }
}

function toNumber(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}
