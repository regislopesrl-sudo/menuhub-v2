export type FutureIntegrationKey =
  | 'payment'
  | 'pix'
  | 'whatsapp'
  | 'marketplace'
  | 'printer'
  | 'scale'
  | 'erp'
  | 'accounting'
  | 'fraud';

export type FutureIntegrationCapability = {
  key: FutureIntegrationKey;
  provider: string;
  mode: 'mock' | 'interface';
  enabled: boolean;
  realIntegration: false;
  description: string;
};

export interface PaymentProvider {
  charge(input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface PixProvider {
  createCharge(input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface MarketplaceProvider {
  pullOrders(input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface PrinterProvider {
  print(input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface ScaleProvider {
  readWeight(input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface ErpProvider {
  exportPayload(input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface AccountingExportProvider {
  exportEntries(input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface FraudProvider {
  score(input: Record<string, unknown>): Promise<Record<string, unknown>>;
}
