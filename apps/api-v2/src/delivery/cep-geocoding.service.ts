import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

export type GeocodedAddress = {
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
};

export type GeocodeByCepInput = {
  cep: string;
  number?: string;
};

export interface CepGeocodingProvider {
  geocodeByCep(input: GeocodeByCepInput): Promise<GeocodedAddress | null>;
}

@Injectable()
class InMemoryCepGeocodingProvider implements CepGeocodingProvider {
  private readonly fixtures: Record<string, GeocodedAddress> = {
    '01001000': {
      cep: '01001000',
      street: 'Praca da Se',
      neighborhood: 'Se',
      city: 'Sao Paulo',
      state: 'SP',
      lat: -23.55052,
      lng: -46.633308,
    },
    '20040002': {
      cep: '20040002',
      street: 'Rua da Quitanda',
      neighborhood: 'Centro',
      city: 'Rio de Janeiro',
      state: 'RJ',
      lat: -22.9035,
      lng: -43.1754,
    },
  };

  async geocodeByCep(input: GeocodeByCepInput): Promise<GeocodedAddress | null> {
    const base = this.fixtures[input.cep];
    if (!base) {
      return null;
    }

    const numberOffset = Number((input.number ?? '').replace(/\D/g, '')) || 0;
    if (!numberOffset) {
      return base;
    }

    const latOffset = Math.min(numberOffset, 9999) * 0.000001;
    const lngOffset = Math.min(numberOffset, 9999) * 0.000001;

    return {
      ...base,
      lat: Number((base.lat + latOffset).toFixed(6)),
      lng: Number((base.lng + lngOffset).toFixed(6)),
    };
  }
}

@Injectable()
export class CepGeocodingService {
  constructor(private readonly provider: InMemoryCepGeocodingProvider = new InMemoryCepGeocodingProvider()) {}

  // Future provider adapters: ViaCep + Nominatim, Google, Mapbox.
  async geocodeByCep(input: GeocodeByCepInput): Promise<GeocodedAddress> {
    const normalizedCep = normalizeCep(input.cep);

    const found = await this.provider.geocodeByCep({
      cep: normalizedCep,
      number: normalizeNumber(input.number),
    });

    if (!found) {
      throw new NotFoundException('CEP nao encontrado para geocoding.');
    }

    return found;
  }
}

export function normalizeCep(raw: string): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length !== 8) {
    throw new BadRequestException('CEP invalido. Informe um CEP com 8 digitos.');
  }
  return digits;
}

function normalizeNumber(raw?: string): string | undefined {
  const value = String(raw ?? '').trim();
  return value.length > 0 ? value : undefined;
}
