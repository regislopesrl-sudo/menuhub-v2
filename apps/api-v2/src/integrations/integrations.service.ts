import { Injectable } from '@nestjs/common';
import type { FutureIntegrationCapability } from './integration-providers';

const CAPABILITIES: FutureIntegrationCapability[] = [
  {
    key: 'payment',
    provider: 'local-card-mock',
    mode: 'mock',
    enabled: true,
    realIntegration: false,
    description: 'Interface preparada para cartao real sem gateway externo ativo.',
  },
  {
    key: 'pix',
    provider: 'local-pix-mock',
    mode: 'mock',
    enabled: true,
    realIntegration: false,
    description: 'Interface preparada para PIX real sem PSP ativo.',
  },
  {
    key: 'whatsapp',
    provider: 'local-whatsapp-future',
    mode: 'interface',
    enabled: false,
    realIntegration: false,
    description: 'Contrato futuro para WhatsApp, sem envio real.',
  },
  {
    key: 'marketplace',
    provider: 'local-marketplace-future',
    mode: 'interface',
    enabled: false,
    realIntegration: false,
    description: 'Contrato futuro para marketplace, sem iFood ou agregador real.',
  },
  {
    key: 'printer',
    provider: 'local-printer-future',
    mode: 'interface',
    enabled: false,
    realIntegration: false,
    description: 'Contrato futuro para impressora, sem hardware real.',
  },
  {
    key: 'scale',
    provider: 'local-scale-future',
    mode: 'interface',
    enabled: false,
    realIntegration: false,
    description: 'Contrato futuro para balanca, sem hardware real.',
  },
  {
    key: 'erp',
    provider: 'local-erp-future',
    mode: 'interface',
    enabled: false,
    realIntegration: false,
    description: 'Contrato futuro para ERP, sem API externa.',
  },
  {
    key: 'accounting',
    provider: 'local-accounting-future',
    mode: 'interface',
    enabled: false,
    realIntegration: false,
    description: 'Contrato futuro para contabilidade, sem exportador real.',
  },
  {
    key: 'fraud',
    provider: 'local-fraud-future',
    mode: 'interface',
    enabled: false,
    realIntegration: false,
    description: 'Contrato futuro para antifraude, sem motor externo.',
  },
];

@Injectable()
export class IntegrationsService {
  listCapabilities() {
    return {
      generatedAt: new Date().toISOString(),
      mode: 'local-mock-only',
      realExternalProvidersEnabled: false,
      capabilities: CAPABILITIES,
    };
  }
}
