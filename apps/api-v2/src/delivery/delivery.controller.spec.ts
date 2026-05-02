import { DeliveryController } from './delivery.controller';

describe('DeliveryController quote endpoint', () => {
  const ctx = {
    companyId: 'company-1',
    branchId: 'branch-1',
    userRole: 'admin' as const,
    requestId: 'req-123',
    channel: 'delivery' as const,
  };

  function buildController() {
    const deliveryService = {
      calculateFee: jest.fn(),
      listFees: jest.fn(),
      updateFees: jest.fn(),
    } as any;

    const cepGeocodingService = {
      geocodeByCep: jest.fn().mockResolvedValue({
        cep: '01001000',
        street: 'Praca da Se',
        neighborhood: 'Se',
        city: 'Sao Paulo',
        state: 'SP',
        lat: -23.55,
        lng: -46.63,
      }),
    } as any;

    const deliveryQuoteService = {
      quoteByAddress: jest.fn().mockResolvedValue({
        available: true,
        quoteId: 'q-1',
        requestId: 'req-123',
        fee: 8,
        estimatedMinutes: 45,
        minimumOrder: null,
        areaName: 'Centro',
        reason: null,
        message: null,
        distanceMeters: 2500,
        distanceKm: 2.5,
        durationSeconds: 360,
        address: { lat: -23.55, lng: -46.63 },
      }),
    } as any;

    return {
      controller: new DeliveryController(deliveryService, cepGeocodingService, deliveryQuoteService),
      cepGeocodingService,
      deliveryQuoteService,
    };
  }

  it('quote chama quoteByAddress e repassa subtotal', async () => {
    const { controller, deliveryQuoteService } = buildController();

    await controller.quote({ cep: '01001000', number: '123', subtotal: 50 }, ctx);

    expect(deliveryQuoteService.quoteByAddress).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ subtotal: 50 }),
    );
  });

  it('CEP fora da area retorna available=false', async () => {
    const { controller, deliveryQuoteService } = buildController();
    deliveryQuoteService.quoteByAddress.mockResolvedValueOnce({
      available: false,
      quoteId: 'q-2',
      requestId: 'req-123',
      fee: 0,
      estimatedMinutes: 0,
      minimumOrder: null,
      areaName: null,
      reason: 'OUT_OF_DELIVERY_AREA',
      message: 'Endereco fora da area de entrega',
      distanceMeters: 0,
      distanceKm: 0,
      durationSeconds: 0,
      address: { lat: -23.55, lng: -46.63 },
    });

    const result = await controller.quote({ cep: '01001000', number: '123', subtotal: 50 }, ctx);

    expect(result.available).toBe(false);
    expect(result.reason).toBe('OUT_OF_DELIVERY_AREA');
  });

  it('retorna address com lat/lng do geocoding', async () => {
    const { controller, cepGeocodingService } = buildController();

    const result = await controller.quote({ cep: '01001000', number: '123' }, ctx);

    expect(cepGeocodingService.geocodeByCep).toHaveBeenCalledWith({ cep: '01001000', number: '123' });
    expect(result.address.lat).toBe(-23.55);
    expect(result.address.lng).toBe(-46.63);
  });
});
