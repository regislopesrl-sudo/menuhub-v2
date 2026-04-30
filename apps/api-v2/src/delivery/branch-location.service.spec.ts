import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BranchLocationService } from './branch-location.service';

describe('BranchLocationService', () => {
  function makeService(options?: {
    branchById?: any;
    branchFallback?: any;
    geocoded?: any;
  }) {
    const prisma = {
      branch: {
        findFirst: jest
          .fn()
          .mockImplementation(async (args: any) => {
            if (args.where?.id) {
              return options?.branchById ?? null;
            }
            return options?.branchFallback ?? null;
          }),
      },
    } as any;

    const geocoding = {
      geocodeByCep: jest.fn().mockResolvedValue(
        options?.geocoded ?? {
          cep: '01001000',
          street: 'Praca da Se',
          neighborhood: 'Se',
          city: 'Sao Paulo',
          state: 'SP',
          lat: -23.55,
          lng: -46.63,
        },
      ),
    } as any;

    return {
      service: new BranchLocationService(prisma, geocoding),
      prisma,
      geocoding,
    };
  }

  it('usa lat/lng da filial', async () => {
    const { service } = makeService({
      branchById: {
        id: 'b1',
        companyId: 'c1',
        latitude: -23.5,
        longitude: -46.6,
        zipCode: '01001000',
        number: '100',
      },
    });

    const origin = await service.getBranchOrigin({ companyId: 'c1', branchId: 'b1' });

    expect(origin).toEqual({ branchId: 'b1', latitude: -23.5, longitude: -46.6 });
  });

  it('bloqueia branch de outra empresa', async () => {
    const { service } = makeService({ branchById: null });

    await expect(service.getBranchOrigin({ companyId: 'c1', branchId: 'other' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('fallback por companyId quando branchId ausente', async () => {
    const { service } = makeService({
      branchFallback: {
        id: 'b-default',
        companyId: 'c1',
        latitude: -22,
        longitude: -43,
        zipCode: '20040002',
        number: '50',
      },
    });

    const origin = await service.getBranchOrigin({ companyId: 'c1' });

    expect(origin.branchId).toBe('b-default');
    expect(origin.latitude).toBe(-22);
  });

  it('geocodifica endereco da filial se nao tiver lat/lng', async () => {
    const { service, geocoding } = makeService({
      branchById: {
        id: 'b1',
        companyId: 'c1',
        latitude: null,
        longitude: null,
        zipCode: '01001000',
        number: '321',
      },
      geocoded: {
        cep: '01001000',
        street: 'Praca da Se',
        neighborhood: 'Se',
        city: 'Sao Paulo',
        state: 'SP',
        lat: -23.551,
        lng: -46.632,
      },
    });

    const origin = await service.getBranchOrigin({ companyId: 'c1', branchId: 'b1' });

    expect(geocoding.geocodeByCep).toHaveBeenCalledWith({ cep: '01001000', number: '321' });
    expect(origin.latitude).toBe(-23.551);
  });

  it('erro claro quando filial nao tem localizacao', async () => {
    const { service } = makeService({
      branchById: {
        id: 'b1',
        companyId: 'c1',
        latitude: null,
        longitude: null,
        zipCode: null,
        number: null,
      },
    });

    const promise = service.getBranchOrigin({ companyId: 'c1', branchId: 'b1' });
    await expect(promise).rejects.toBeInstanceOf(BadRequestException);
    await expect(promise).rejects.toThrow('Filial sem localizacao valida');
  });
});
