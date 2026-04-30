import { BadRequestException } from '@nestjs/common';
import { MercadoPagoPixProvider } from './mercado-pago-pix.provider';

describe('MercadoPagoPixProvider', () => {
  const originalEnv = process.env;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = {
      ...originalEnv,
      MERCADO_PAGO_ACCESS_TOKEN: 'token_test',
      MERCADO_PAGO_NOTIFICATION_URL: 'https://example.com/v2/payments/webhook/mercadopago',
      MERCADO_PAGO_API_BASE_URL: 'https://api.mercadopago.com',
      MERCADO_PAGO_TIMEOUT_MS: '10000',
    };
    (global as any).fetch = fetchMock;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('createPixPayment retorna qrCodeText', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 123,
        status: 'pending',
        date_of_expiration: '2026-05-01T10:00:00.000Z',
        point_of_interaction: {
          transaction_data: {
            qr_code: '000201PIXREAL',
            qr_code_base64: 'AAA',
          },
        },
      }),
    });

    const provider = new MercadoPagoPixProvider();
    const result = await provider.createPixPayment(
      { id: 'ord_1', orderNumber: 'V2-1', total: 99.9 },
      { companyId: 'c1', branchId: 'b1', userRole: 'user', requestId: 'r1' },
    );

    expect(result.provider).toBe('mercadopago');
    expect(result.providerPaymentId).toBe('123');
    expect(result.qrCodeText).toBe('000201PIXREAL');
    expect(result.status).toBe('PENDING');
  });

  it('status approved vira APPROVED', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 777, status: 'approved' }),
    });

    const provider = new MercadoPagoPixProvider();
    const status = await provider.getPaymentStatus('777', {
      companyId: 'c1',
      userRole: 'admin',
      requestId: 'r1',
    });

    expect(status.status).toBe('APPROVED');
  });

  it('status rejected vira DECLINED', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 888, status: 'rejected' }),
    });

    const provider = new MercadoPagoPixProvider();
    const status = await provider.getPaymentStatus('888', {
      companyId: 'c1',
      userRole: 'admin',
      requestId: 'r1',
    });

    expect(status.status).toBe('DECLINED');
  });

  it('status expired vira EXPIRED', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 999, status: 'expired' }),
    });

    const provider = new MercadoPagoPixProvider();
    const status = await provider.getPaymentStatus('999', {
      companyId: 'c1',
      userRole: 'admin',
      requestId: 'r1',
    });

    expect(status.status).toBe('EXPIRED');
  });

  it('webhook busca pagamento na API antes de atualizar', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 555, status: 'approved' }),
    });

    const provider = new MercadoPagoPixProvider();
    const result = await provider.handleWebhook({
      id: 'evt_1',
      type: 'payment',
      data: { id: '555' },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v1/payments/555'),
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result.status).toBe('APPROVED');
    expect(result.providerPaymentId).toBe('555');
  });

  it('env ausente gera erro claro', async () => {
    delete process.env.MERCADO_PAGO_ACCESS_TOKEN;
    const provider = new MercadoPagoPixProvider();

    await expect(
      provider.createPixPayment(
        { id: 'ord_x', total: 10 },
        { companyId: 'c1', userRole: 'user', requestId: 'r1' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
