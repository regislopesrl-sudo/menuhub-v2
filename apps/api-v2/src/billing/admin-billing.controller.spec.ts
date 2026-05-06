import { AdminBillingController } from './admin-billing.controller';

describe('AdminBillingController', () => {
  const service = {
    getCurrentBillingOverview: jest.fn(),
  };
  const controller = new AdminBillingController(service as never);

  it('usa companyId do contexto autenticado', async () => {
    service.getCurrentBillingOverview.mockResolvedValueOnce({ billing: { status: 'active' } });
    await controller.getCurrent({
      companyId: 'company_a',
      userRole: 'manager',
      requestId: 'req_1',
    });
    expect(service.getCurrentBillingOverview).toHaveBeenCalledWith('company_a');
  });
});
