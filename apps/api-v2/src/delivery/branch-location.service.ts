import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RequestContext } from '../common/request-context';
import { CepGeocodingService } from './cep-geocoding.service';

export type BranchOrigin = {
  branchId: string;
  latitude: number;
  longitude: number;
};

@Injectable()
export class BranchLocationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cepGeocodingService: CepGeocodingService,
  ) {}

  async getBranchOrigin(
    ctx: Pick<RequestContext, 'companyId' | 'branchId'>,
  ): Promise<BranchOrigin> {
    const branch = await this.findBranch(ctx);

    const latitude = toFiniteNumber(branch.latitude);
    const longitude = toFiniteNumber(branch.longitude);

    if (latitude != null && longitude != null) {
      return {
        branchId: branch.id,
        latitude,
        longitude,
      };
    }

    const zipCode = String(branch.zipCode ?? '').replace(/\D/g, '');
    if (zipCode.length !== 8) {
      throw new BadRequestException('Filial sem localizacao valida: CEP da filial ausente ou invalido.');
    }

    const geocoded = await this.cepGeocodingService.geocodeByCep({
      cep: zipCode,
      number: branch.number ?? undefined,
    });

    return {
      branchId: branch.id,
      latitude: geocoded.lat,
      longitude: geocoded.lng,
    };
  }

  private async findBranch(ctx: Pick<RequestContext, 'companyId' | 'branchId'>) {
    if (ctx.branchId) {
      const byId = await this.prisma.branch.findFirst({
        where: {
          id: ctx.branchId,
          companyId: ctx.companyId,
          isActive: true,
        },
        select: {
          id: true,
          companyId: true,
          latitude: true,
          longitude: true,
          zipCode: true,
          number: true,
        },
      });

      if (!byId) {
        throw new NotFoundException('Filial nao encontrada para a empresa atual.');
      }

      return byId;
    }

    const fallback = await this.prisma.branch.findFirst({
      where: {
        companyId: ctx.companyId,
        isActive: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
        companyId: true,
        latitude: true,
        longitude: true,
        zipCode: true,
        number: true,
      },
    });

    if (!fallback) {
      throw new NotFoundException('Nenhuma filial ativa encontrada para a empresa atual.');
    }

    return fallback;
  }
}

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
