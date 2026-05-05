import { BillingWebhookController } from './billing.webhook.controller';

describe('BillingWebhookController', () => {
  it('encaminha payload para service', async () => {
    const service = {
      handleWebhook: jest.fn().mockResolvedValue({ processed: true }),
    };
    const controller = new BillingWebhookController(service as never);

    await controller.handleWebhook('mock', { eventId: 'evt_1' }, {});
    expect(service.handleWebhook).toHaveBeenCalledWith('mock', { eventId: 'evt_1' }, {});
  });
});
