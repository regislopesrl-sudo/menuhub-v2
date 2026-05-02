import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CepGeocodingService, normalizeCep } from './cep-geocoding.service';

describe('CepGeocodingService', () => {
  it('CEP invalido retorna erro claro', async () => {
    const service = new CepGeocodingService();

    await expect(service.geocodeByCep({ cep: '123' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.geocodeByCep({ cep: '123' })).rejects.toThrow(
      'CEP invalido. Informe um CEP com 8 digitos.',
    );
  });

  it('CEP conhecido retorna endereco com lat/lng', async () => {
    const service = new CepGeocodingService();

    const address = await service.geocodeByCep({ cep: '01001-000', number: '123' });

    expect(address.cep).toBe('01001000');
    expect(address.street).toBeTruthy();
    expect(typeof address.lat).toBe('number');
    expect(typeof address.lng).toBe('number');
  });

  it('CEP nao encontrado retorna erro claro', async () => {
    const service = new CepGeocodingService();

    await expect(service.geocodeByCep({ cep: '99999999' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.geocodeByCep({ cep: '99999999' })).rejects.toThrow(
      'CEP nao encontrado para geocoding.',
    );
  });

  it('normaliza CEP com mascara', () => {
    expect(normalizeCep('01001-000')).toBe('01001000');
  });
});
