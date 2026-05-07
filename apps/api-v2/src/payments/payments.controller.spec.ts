import { IS_PUBLIC_KEY } from '../common/public.decorator';
import { PaymentsController } from './payments.controller';

describe('PaymentsController', () => {
  it('encaminha webhook para service', async () => {
    const service = {
      handleWebhook: jest.fn().mockResolvedValue({ processed: true }),
      getPaymentStatusByProviderPaymentId: jest.fn(),
    };
    const controller = new PaymentsController(service as never);

    await controller.webhook('mock', { id: 'evt_1' });
    expect(service.handleWebhook).toHaveBeenCalledWith('mock', { id: 'evt_1' });
  });

  it('webhook e publico', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, PaymentsController.prototype.webhook)).toBe(true);
  });

  it('payment status e publico para polling de checkout', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, PaymentsController.prototype.paymentStatus)).toBe(true);
  });
});
