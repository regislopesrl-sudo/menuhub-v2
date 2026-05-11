import { BadRequestException } from '@nestjs/common';

export type FiscalAccessKeyMetadata = {
  accessKey: string;
  stateCode: string;
  year: number;
  month: number;
  issuerCnpj: string;
  model: '55' | '65';
  documentType: 'NFE' | 'NFCE';
  series: string;
  number: string;
  emissionType: string;
  numericCode: string;
  checkDigit: string;
};

const VALID_STATE_CODES = new Set([
  '11', '12', '13', '14', '15', '16', '17', '21', '22', '23', '24', '25', '26', '27',
  '28', '29', '31', '32', '33', '35', '41', '42', '43', '50', '51', '52', '53',
]);

export function normalizeFiscalAccessKey(value: unknown) {
  return String(value ?? '').replace(/\D/g, '');
}

export function decodeFiscalAccessKey(value: unknown): FiscalAccessKeyMetadata {
  const accessKey = normalizeFiscalAccessKey(value);
  if (!accessKey) throw new BadRequestException('Chave de acesso obrigatoria.');
  if (!/^\d{44}$/.test(accessKey)) {
    throw new BadRequestException('Chave de acesso deve conter 44 digitos numericos.');
  }

  const stateCode = accessKey.slice(0, 2);
  const yearMonth = accessKey.slice(2, 6);
  const issuerCnpj = accessKey.slice(6, 20);
  const model = accessKey.slice(20, 22) as '55' | '65';
  const series = accessKey.slice(22, 25);
  const number = accessKey.slice(25, 34);
  const emissionType = accessKey.slice(34, 35);
  const numericCode = accessKey.slice(35, 43);
  const checkDigit = accessKey.slice(43, 44);

  const month = Number(yearMonth.slice(2, 4));
  if (!VALID_STATE_CODES.has(stateCode)) throw new BadRequestException('Codigo UF da chave fiscal invalido.');
  if (month < 1 || month > 12) throw new BadRequestException('Mes da chave fiscal invalido.');
  if (!['55', '65'].includes(model)) throw new BadRequestException('Modelo fiscal suportado deve ser 55 ou 65.');

  return {
    accessKey,
    stateCode,
    year: 2000 + Number(yearMonth.slice(0, 2)),
    month,
    issuerCnpj,
    model,
    documentType: model === '65' ? 'NFCE' : 'NFE',
    series,
    number,
    emissionType,
    numericCode,
    checkDigit,
  };
}
