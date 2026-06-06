import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RequestContext } from '../common/request-context';
import { DeliveryAreaRepository, NormalizedDeliveryArea } from './delivery-area.repository';
import { calculateDeliveryFee } from './delivery-fee-calculator';
import { isPointInsidePolygon } from './point-in-polygon';
import { DeliveryQuoteInput, DeliveryQuoteResponse } from './dto/delivery-quote.dto';
import { CepGeocodingService, GeocodedAddress, normalizeCep } from './cep-geocoding.service';
import { RouteDistanceService } from './route-distance.service';
import { BranchLocationService } from './branch-location.service';
import { DeliveryZonesService } from '../delivery-zones/delivery-zones.service';

@Injectable()
export class DeliveryQuoteService {
  constructor(
    private readonly deliveryAreaRepository: DeliveryAreaRepository,
    private readonly routeDistanceService: RouteDistanceService,
    private readonly branchLocationService: BranchLocationService,
    private readonly cepGeocodingService: CepGeocodingService,
    private readonly deliveryZonesService: DeliveryZonesService,
  ) {}

  async quoteByAddress(
    ctx: Pick<RequestContext, 'companyId' | 'branchId' | 'requestId'>,
    input: { cep: string; number: string; subtotal?: number } | { address: GeocodedAddress; subtotal?: number },
  ): Promise<DeliveryQuoteResponse> {
    let address: GeocodedAddress;
    if ('address' in input) {
      address = input.address;
    } else {
      const postalCode = normalizeCep(input.cep);
      try {
        address = await this.cepGeocodingService.geocodeByCep({ cep: postalCode, number: input.number });
      } catch (error) {
        const postalQuote = await this.quoteByPostalCodeOnly(ctx, {
          postalCode,
          subtotal: input.subtotal,
        });
        if (postalQuote) return postalQuote;
        throw error;
      }
    }

    const route = await this.resolveRouteDistance(ctx, address.lat, address.lng);

    return this.quoteByPoint(ctx, {
      lat: address.lat,
      lng: address.lng,
      subtotal: input.subtotal,
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      postalCode: address.cep,
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state,
    });
  }

  private async quoteByPostalCodeOnly(
    ctx: Pick<RequestContext, 'companyId' | 'branchId' | 'requestId'>,
    input: { postalCode: string; subtotal?: number },
  ): Promise<DeliveryQuoteResponse | null> {
    const zoneQuote = await this.deliveryZonesService.validateForCheckout(ctx, {
      postalCode: input.postalCode,
      orderSubtotal: input.subtotal,
      source: 'CHECKOUT',
      publicOnly: true,
    });

    if (!zoneQuote.configured) return null;

    return this.mapDynamicZoneQuote(ctx, randomUUID(), {}, zoneQuote, null, null, null);
  }

  async quoteByPoint(
    ctx: Pick<RequestContext, 'companyId' | 'branchId' | 'requestId'>,
    input: DeliveryQuoteInput,
  ): Promise<DeliveryQuoteResponse> {
    const quoteId = randomUUID();
    const distanceMeters =
      typeof input.distanceMeters === 'number' && Number.isFinite(input.distanceMeters)
        ? Math.round(input.distanceMeters)
        : null;

    const distanceKm = distanceMeters == null ? null : Number((distanceMeters / 1000).toFixed(3));

    const durationSeconds =
      typeof input.durationSeconds === 'number' && Number.isFinite(input.durationSeconds)
        ? Math.round(input.durationSeconds)
        : null;

    const zoneQuote = await this.deliveryZonesService.validateForCheckout(ctx, {
      postalCode: input.postalCode,
      neighborhood: input.neighborhood,
      city: input.city,
      state: input.state,
      latitude: input.lat,
      longitude: input.lng,
      orderSubtotal: input.subtotal,
      source: 'CHECKOUT',
      publicOnly: true,
    });

    if (zoneQuote.configured) {
      return this.mapDynamicZoneQuote(ctx, quoteId, input, zoneQuote, distanceMeters, distanceKm, durationSeconds);
    }

    const areas = await this.deliveryAreaRepository.findActiveAreas(ctx);
    const matched = areas
      .filter((area) =>
        area.polygons.some((polygon) => isPointInsidePolygon(input.lat, input.lng, polygon)),
      )
      .map((area) => ({
        area,
        fee: calculateDeliveryFee(area, input.distanceMeters),
      }));

    if (matched.length === 0) {
      return {
        available: false,
        quoteId,
        requestId: ctx.requestId,
        areaId: null,
        fee: 0,
        estimatedMinutes: 0,
        minimumOrder: null,
        areaName: null,
        reason: 'OUT_OF_DELIVERY_AREA',
        message: 'Endereco fora da area de entrega',
        distanceMeters,
        distanceKm,
        durationSeconds,
        address: {
          lat: input.lat,
          lng: input.lng,
        },
      };
    }

    const chosen = this.chooseBestArea(matched);
    const minimumOrder = chosen.area.minimumOrder;

    if (typeof minimumOrder === 'number' && Number.isFinite(minimumOrder)) {
      if ((input.subtotal ?? 0) < minimumOrder) {
        return {
          available: false,
          quoteId,
          requestId: ctx.requestId,
          fee: chosen.fee,
          areaId: chosen.area.id,
          estimatedMinutes: chosen.area.estimatedMinutes,
          minimumOrder,
          areaName: chosen.area.name,
          reason: 'BELOW_MINIMUM_ORDER',
          message: 'Pedido abaixo do minimo da area de entrega',
          distanceMeters,
          distanceKm,
          durationSeconds,
          address: {
            lat: input.lat,
            lng: input.lng,
          },
        };
      }
    }

    return {
      available: true,
      quoteId,
      requestId: ctx.requestId,
      fee: chosen.fee,
      areaId: chosen.area.id,
      estimatedMinutes: chosen.area.estimatedMinutes,
      minimumOrder,
      areaName: chosen.area.name,
      reason: null,
      message: null,
      distanceMeters,
      distanceKm,
      durationSeconds,
      address: {
        lat: typeof input.lat === 'number' ? input.lat : null,
        lng: typeof input.lng === 'number' ? input.lng : null,
      },
    };
  }

  private async resolveRouteDistance(
    ctx: Pick<RequestContext, 'companyId' | 'branchId'>,
    destLat: number,
    destLng: number,
  ) {
    const origin = await this.branchLocationService.getBranchOrigin(ctx);

    return this.routeDistanceService.getDistance(
      origin.latitude,
      origin.longitude,
      destLat,
      destLng,
    );
  }

  private chooseBestArea(
    matched: Array<{ area: NormalizedDeliveryArea; fee: number }>,
  ): { area: NormalizedDeliveryArea; fee: number } {
    const sorted = [...matched].sort((a, b) => {
      if (b.area.priority !== a.area.priority) {
        return b.area.priority - a.area.priority;
      }

      if (a.fee !== b.fee) {
        return a.fee - b.fee;
      }

      return a.area.estimatedMinutes - b.area.estimatedMinutes;
    });

    return sorted[0];
  }

  private mapDynamicZoneQuote(
    ctx: Pick<RequestContext, 'requestId'>,
    quoteId: string,
    input: { lat?: number | null; lng?: number | null },
    zoneQuote: Awaited<ReturnType<DeliveryZonesService['validateForCheckout']>>,
    distanceMeters: number | null,
    distanceKm: number | null,
    durationSeconds: number | null,
  ): DeliveryQuoteResponse {
    const estimatedMinutes =
      zoneQuote.estimatedMinutesMax ?? zoneQuote.estimatedMinutesMin ?? (durationSeconds ? Math.ceil(durationSeconds / 60) : 0);

    return {
      available: zoneQuote.deliverable,
      quoteId,
      requestId: ctx.requestId,
      areaId: null,
      deliveryZoneId: zoneQuote.zoneId,
      fee: zoneQuote.deliveryFee,
      estimatedMinutes,
      estimatedMinutesMin: zoneQuote.estimatedMinutesMin,
      estimatedMinutesMax: zoneQuote.estimatedMinutesMax,
      minimumOrder: zoneQuote.minimumOrderAmount,
      courierFee: zoneQuote.courierFee,
      missingAmount: zoneQuote.missingAmount,
      dynamicPricingApplied: zoneQuote.dynamicPricingApplied,
      dynamicPricingRuleName: zoneQuote.dynamicPricingRuleName,
      requiresManualNegotiation: zoneQuote.requiresManualNegotiation,
      areaName: zoneQuote.zoneName,
      reason: this.mapDynamicReason(zoneQuote.reason),
      message: zoneQuote.message,
      distanceMeters,
      distanceKm: zoneQuote.distanceKm ?? distanceKm,
      durationSeconds,
      address: {
        lat: typeof input.lat === 'number' ? input.lat : null,
        lng: typeof input.lng === 'number' ? input.lng : null,
      },
    };
  }

  private mapDynamicReason(reason: Awaited<ReturnType<DeliveryZonesService['validateForCheckout']>>['reason']): DeliveryQuoteResponse['reason'] {
    if (reason === 'OUT_OF_COVERAGE') return 'OUT_OF_DELIVERY_AREA';
    if (reason === 'MINIMUM_ORDER_NOT_REACHED') return 'BELOW_MINIMUM_ORDER';
    return reason;
  }
}
