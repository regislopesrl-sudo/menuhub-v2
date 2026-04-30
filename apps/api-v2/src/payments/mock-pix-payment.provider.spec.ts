import { BadRequestException } from '@nestjs/common';
import { MockPixPaymentProvider } from './providers/mock-pix-payment.provider';

describe('MockPixPaymentProvider', () => {
  it('mock provider cria status PENDING', async () => {
    const provider = new MockPixPaymentProvider();
    const intent = await provider.createPixPayment({ id: 'ord_1', total: 50 }, { companyId: 'c1', userRole: 'user', requestId: 'r1' } as any);

    expect(intent.status).toBe('PENDING');
    expect(intent.qrCodeText).toContain('PIXMOCK');
    expect(intent.expiresAt).toBeTruthy();
  });

  it('payload invalido bloqueia webhook', async () => {
    const provider = new MockPixPaymentProvider();
    await expect(provider.handleWebhook(null)).rejects.toBeInstanceOf(BadRequestException);
  });
});
