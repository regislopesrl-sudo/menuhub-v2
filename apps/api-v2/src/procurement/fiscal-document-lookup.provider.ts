import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
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

export type HttpFiscalDocumentLookupProviderOptions = {
  endpoint?: string;
  token?: string;
  timeoutMs?: number;
};

export class HttpFiscalDocumentLookupProvider implements FiscalDocumentLookupProvider {
  constructor(private readonly options: HttpFiscalDocumentLookupProviderOptions) {}

  async lookupByAccessKey(input: FiscalDocumentLookupInput): Promise<FiscalDocumentLookupResult> {
    const endpoint = String(this.options.endpoint ?? '').trim();
    if (!endpoint) {
      throw new BadRequestException('Provider fiscal real nao configurado. Configure FISCAL_LOOKUP_HTTP_URL.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 20000);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          ...(this.options.token ? { authorization: `Bearer ${this.options.token}` } : {}),
        },
        body: JSON.stringify({
          accessKey: input.metadata.accessKey,
          documentType: input.metadata.documentType,
          stateCode: input.metadata.stateCode,
          issuerCnpj: input.metadata.issuerCnpj,
          series: input.metadata.series,
          number: input.metadata.number,
        }),
      });

      if (!response.ok) {
        throw new BadRequestException(`Provider fiscal retornou HTTP ${response.status}.`);
      }

      const payload = await response.json();
      return this.normalizeResponse(payload, input.metadata);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new ServiceUnavailableException(error instanceof Error ? error.message : 'Falha ao consultar provider fiscal real.');
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizeResponse(payload: any, metadata: FiscalAccessKeyMetadata): FiscalDocumentLookupResult {
    const data = payload?.document ?? payload;
    const items = Array.isArray(data?.items) ? data.items : [];
    if (items.length === 0) {
      throw new BadRequestException('Provider fiscal nao retornou itens do cupom.');
    }

    const normalizedItems = items.map((item: any, index: number) => {
      const quantity = Number(item.quantity ?? item.qtd ?? 0);
      const totalAmount = Number(item.totalAmount ?? item.total ?? 0);
      const unitPrice = Number(item.unitPrice ?? item.price ?? (quantity > 0 ? totalAmount / quantity : 0));
      const description = String(item.description ?? item.name ?? '').trim();
      if (!description || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new BadRequestException('Provider fiscal retornou item invalido.');
      }
      return {
        lineNumber: Number(item.lineNumber ?? item.nItem ?? index + 1),
        fiscalCode: this.clean(item.fiscalCode ?? item.cProd),
        ean: this.clean(item.ean ?? item.cEAN),
        description,
        quantity,
        unit: this.clean(item.unit ?? item.uCom),
        unitPrice,
        totalAmount: Number((Number.isFinite(totalAmount) && totalAmount > 0 ? totalAmount : quantity * unitPrice).toFixed(2)),
        batchNumber: this.clean(item.batchNumber),
        expirationDate: item.expirationDate ? new Date(item.expirationDate) : null,
      };
    });

    const totalAmount = Number(data?.totalAmount ?? data?.total ?? normalizedItems.reduce((acc: number, item: FiscalDocumentLookupItem) => acc + item.totalAmount, 0));
    const emittedAt = data?.emittedAt ? new Date(data.emittedAt) : new Date(Date.UTC(metadata.year, metadata.month - 1, 1, 12, 0, 0));
    if (Number.isNaN(emittedAt.getTime())) throw new BadRequestException('Provider fiscal retornou data de emissao invalida.');

    return {
      providerName: String(data?.providerName ?? payload?.providerName ?? 'external-http'),
      issuerCnpj: this.clean(data?.issuerCnpj) ?? metadata.issuerCnpj,
      issuerName: String(data?.issuerName ?? data?.supplierName ?? `Fornecedor fiscal ${metadata.issuerCnpj.slice(-4)}`),
      emittedAt,
      totalAmount: Number(totalAmount.toFixed(2)),
      items: normalizedItems,
    };
  }

  private clean(value: unknown) {
    const text = String(value ?? '').trim();
    return text.length > 0 ? text : null;
  }
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
