import type { FiscalAccessKeyMetadata } from './fiscal-access-key';

export type FiscalDocumentLookupInput = {
  metadata: FiscalAccessKeyMetadata;
};

export type FiscalDocumentLookupItem = {
  lineNumber: number;
  fiscalCode?: string | null;
  ean?: string | null;
  description: string;
  quantity: number;
  unit?: string | null;
  unitPrice: number;
  totalAmount: number;
  batchNumber?: string | null;
  expirationDate?: Date | null;
};

export type FiscalDocumentLookupResult = {
  providerName: string;
  issuerCnpj: string;
  issuerName: string;
  emittedAt: Date;
  totalAmount: number;
  items: FiscalDocumentLookupItem[];
};

export interface FiscalDocumentLookupProvider {
  lookupByAccessKey(input: FiscalDocumentLookupInput): Promise<FiscalDocumentLookupResult>;
}

export class LocalMockFiscalDocumentLookupProvider implements FiscalDocumentLookupProvider {
  async lookupByAccessKey(input: FiscalDocumentLookupInput): Promise<FiscalDocumentLookupResult> {
    const { metadata } = input;
    const unitPriceA = 18.9;
    const unitPriceB = 2.75;
    const items: FiscalDocumentLookupItem[] = [
      {
        lineNumber: 1,
        fiscalCode: `MOCK-${metadata.number.slice(-4)}-1`,
        ean: null,
        description: 'QUEIJO MUSSARELA KG',
        quantity: 2,
        unit: 'kg',
        unitPrice: unitPriceA,
        totalAmount: Number((2 * unitPriceA).toFixed(2)),
        batchNumber: `L-${metadata.number.slice(-5)}`,
      },
      {
        lineNumber: 2,
        fiscalCode: `MOCK-${metadata.number.slice(-4)}-2`,
        ean: null,
        description: 'EMBALAGEM DELIVERY UN',
        quantity: 50,
        unit: 'un',
        unitPrice: unitPriceB,
        totalAmount: Number((50 * unitPriceB).toFixed(2)),
      },
    ];

    return {
      providerName: 'local-mock',
      issuerCnpj: metadata.issuerCnpj,
      issuerName: `Fornecedor fiscal ${metadata.issuerCnpj.slice(-4)}`,
      emittedAt: new Date(Date.UTC(metadata.year, metadata.month - 1, 1, 12, 0, 0)),
      totalAmount: Number(items.reduce((acc, item) => acc + item.totalAmount, 0).toFixed(2)),
      items,
    };
  }
}
