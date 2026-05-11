import { BadRequestException } from '@nestjs/common';
import { decodeFiscalAccessKey, normalizeFiscalAccessKey } from './fiscal-access-key';

describe('fiscal access key helpers', () => {
  const key = '35260512345678000190650010000012341000012345';

  it('normaliza chave com mascara', () => {
    expect(normalizeFiscalAccessKey('3526 0512-3456.7800/0190 6500 1000 0012 3410 0001 2345')).toBe(key);
  });

  it('decodifica metadados basicos da chave', () => {
    expect(decodeFiscalAccessKey(key)).toEqual(expect.objectContaining({
      accessKey: key,
      stateCode: '35',
      year: 2026,
      month: 5,
      issuerCnpj: '12345678000190',
      model: '65',
      documentType: 'NFCE',
      series: '001',
      number: '000001234',
      emissionType: '1',
      numericCode: '00001234',
      checkDigit: '5',
    }));
  });

  it('bloqueia chave vazia, curta ou com modelo invalido', () => {
    expect(() => decodeFiscalAccessKey('')).toThrow(BadRequestException);
    expect(() => decodeFiscalAccessKey('123')).toThrow(BadRequestException);
    expect(() => decodeFiscalAccessKey('35260512345678000190660010000012341000012345')).toThrow(BadRequestException);
  });
});
