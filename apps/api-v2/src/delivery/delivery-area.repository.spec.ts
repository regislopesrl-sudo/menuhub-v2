import { DeliveryAreaRepository } from './delivery-area.repository';

describe('DeliveryAreaRepository', () => {
  function buildRepository(rows: any[]) {
    const findMany = jest.fn().mockResolvedValue(rows);
    const prisma = {
      deliveryArea: { findMany },
    } as any;

    return {
      repo: new DeliveryAreaRepository(prisma),
      findMany,
    };
  }

  it('ignora área inativa no filtro da consulta', async () => {
    const { repo, findMany } = buildRepository([]);

    await repo.findActiveAreas({ companyId: 'c1', branchId: 'b1' });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          branchId: 'b1',
          branch: { companyId: 'c1' },
        }),
      }),
    );
  });

  it('aceita polygonGeoJson direto', async () => {
    const { repo } = buildRepository([
      {
        id: 'area-1',
        name: 'Centro',
        priority: 10,
        estimatedMinutes: 30,
        pricingMode: 'FIXED',
        deliveryFee: 8,
        baseFee: null,
        pricePerKm: null,
        polygonGeoJson: {
          type: 'Polygon',
          coordinates: [[[-46, -23], [-46, -22], [-45, -22], [-45, -23], [-46, -23]]],
        },
        polygons: [],
        feeRules: [],
      },
    ]);

    const areas = await repo.findActiveAreas({ companyId: 'c1', branchId: 'b1' });

    expect(areas).toHaveLength(1);
    expect(areas[0].polygons).toHaveLength(1);
  });

  it('aceita polygons da tabela DeliveryAreaPolygon', async () => {
    const { repo } = buildRepository([
      {
        id: 'area-1',
        name: 'Centro',
        priority: 10,
        estimatedMinutes: 30,
        pricingMode: 'FIXED',
        deliveryFee: 8,
        baseFee: null,
        pricePerKm: null,
        polygonGeoJson: null,
        polygons: [
          {
            geoJson: {
              type: 'Polygon',
              coordinates: [[[-46, -23], [-46, -22], [-45, -22], [-45, -23], [-46, -23]]],
            },
          },
        ],
        feeRules: [],
      },
    ]);

    const areas = await repo.findActiveAreas({ companyId: 'c1', branchId: 'b1' });

    expect(areas).toHaveLength(1);
    expect(areas[0].polygons).toHaveLength(1);
  });

  it('rejeita Polygon inválido', async () => {
    const { repo } = buildRepository([
      {
        id: 'area-1',
        name: 'Centro',
        priority: 10,
        estimatedMinutes: 30,
        pricingMode: 'FIXED',
        deliveryFee: 8,
        baseFee: null,
        pricePerKm: null,
        polygonGeoJson: {
          type: 'LineString',
          coordinates: [[-46, -23], [-45, -22]],
        },
        polygons: [],
        feeRules: [],
      },
    ]);

    await expect(repo.findActiveAreas({ companyId: 'c1', branchId: 'b1' })).rejects.toThrow(
      'invalid polygon',
    );
  });
});
