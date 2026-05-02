import { DeliveryQuoteService } from './delivery-quote.service';
import { NormalizedDeliveryArea } from './delivery-area.repository';

describe('DeliveryQuoteService', () => {
  const ctx = {
    companyId: 'company-1',
    branchId: 'branch-1',
    requestId: 'req-1',
  };

  function area(input: Partial<NormalizedDeliveryArea> & Pick<NormalizedDeliveryArea, 'id'>): NormalizedDeliveryArea {
    return {
      id: input.id,
      name: input.name ?? input.id,
      priority: input.priority ?? 0,
      estimatedMinutes: input.estimatedMinutes ?? 30,
      pricingMode: input.pricingMode ?? 'FIXED',
      deliveryFee: input.deliveryFee ?? 10,
      baseFee: input.baseFee ?? null,
      pricePerKm: input.pricePerKm ?? null,
      minimumOrder: input.minimumOrder ?? null,
      polygons: input.polygons ?? [
        {
          type: 'Polygon',
          coordinates: [[[-1, -1], [-1, 1], [1, 1], [1, -1], [-1, -1]]],
        },
      ],
      feeRules: input.feeRules ?? [],
    };
  }

  function buildService(areas: NormalizedDeliveryArea[]) {
    const repo = {
      findActiveAreas: jest.fn().mockResolvedValue(areas),
    } as any;

    const routeDistance = {
      getDistance: jest.fn().mockResolvedValue({ distanceMeters: 2500, durationSeconds: 360 }),
    } as any;

    const branchLocation = {
      getBranchOrigin: jest.fn().mockResolvedValue({
        branchId: 'branch-1',
        latitude: -23.55,
        longitude: -46.63,
      }),
    } as any;

    return {
      service: new DeliveryQuoteService(
        repo,
        routeDistance,
        branchLocation,
        { geocodeByCep: jest.fn() } as any,
      ),
      routeDistance,
      branchLocation,
    };
  }

  it('ponto fora retorna OUT_OF_DELIVERY_AREA', async () => {
    const { service } = buildService([area({ id: 'a1' })]);

    const result = await service.quoteByPoint(ctx, { lat: 10, lng: 10 });

    expect(result.available).toBe(false);
    expect(result.reason).toBe('OUT_OF_DELIVERY_AREA');
  });

  it('multiplas areas escolhe prioridade maior', async () => {
    const { service } = buildService([
      area({ id: 'low', priority: 1, deliveryFee: 5 }),
      area({ id: 'high', priority: 10, deliveryFee: 20 }),
    ]);

    const result = await service.quoteByPoint(ctx, { lat: 0, lng: 0 });

    expect(result.available).toBe(true);
    expect(result.areaName).toBe('high');
  });

  it('empate escolhe menor taxa', async () => {
    const { service } = buildService([
      area({ id: 'expensive', priority: 5, deliveryFee: 12 }),
      area({ id: 'cheap', priority: 5, deliveryFee: 8 }),
    ]);

    const result = await service.quoteByPoint(ctx, { lat: 0, lng: 0 });

    expect(result.areaName).toBe('cheap');
    expect(result.fee).toBe(8);
  });

  it('quoteByAddress usa origem real da filial para calcular rota', async () => {
    const { service, routeDistance, branchLocation } = buildService([area({ id: 'a1', deliveryFee: 9 })]);

    const result = await service.quoteByAddress(ctx, {
      address: {
        cep: '01001000',
        street: 'x',
        neighborhood: 'x',
        city: 'x',
        state: 'SP',
        lat: -23.56,
        lng: -46.62,
      },
      subtotal: 50,
    });

    expect(branchLocation.getBranchOrigin).toHaveBeenCalledWith({
      companyId: 'company-1',
      branchId: 'branch-1',
      requestId: 'req-1',
    });
    expect(routeDistance.getDistance).toHaveBeenCalledWith(-23.55, -46.63, -23.56, -46.62);
    expect(result.distanceMeters).toBe(2500);
  });

  it('fallback deliveryFee funciona', async () => {
    const { service } = buildService([
      area({ id: 'fixed', pricingMode: 'FIXED', deliveryFee: 9, feeRules: [] }),
    ]);

    const result = await service.quoteByPoint(ctx, { lat: 0, lng: 0 });

    expect(result.fee).toBe(9);
  });
});
