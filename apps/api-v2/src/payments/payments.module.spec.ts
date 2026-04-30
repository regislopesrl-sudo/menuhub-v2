import { resolvePaymentProviderFromEnv } from './payments.module';

describe('PaymentsModule provider selection', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it('PAYMENT_PROVIDER=mock mantem provider antigo', () => {
    process.env = { ...originalEnv, PAYMENT_PROVIDER: 'mock' };
    expect(resolvePaymentProviderFromEnv()).toBe('mock');
  });

  it('PAYMENT_PROVIDER=mercadopago seleciona provider real', () => {
    process.env = { ...originalEnv, PAYMENT_PROVIDER: 'mercadopago' };
    expect(resolvePaymentProviderFromEnv()).toBe('mercadopago');
  });
});
