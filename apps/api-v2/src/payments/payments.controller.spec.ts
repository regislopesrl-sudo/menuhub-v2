import { IS_PUBLIC_KEY } from '../common/public.decorator';
import { REQUIRED_PERMISSIONS_KEY } from '../common/permissions.decorator';
import { TENANT_PERMISSIONS } from '../common/rbac';
import { MODULE_ACCESS_KEY } from '../modules/module-access.decorator';
import { PaymentsController } from './payments.controller';

describe('PaymentsController', () => {
  it('encaminha webhook para service', async () => {
    const service = {
      handleWebhook: jest.fn().mockResolvedValue({ processed: true }),
      getPaymentStatusByProviderPaymentId: jest.fn(),
      getMockReconciliation: jest.fn(),
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

  it('conciliacao mock exige modulo payments e permissoes financeiras', () => {
    expect(Reflect.getMetadata(MODULE_ACCESS_KEY, PaymentsController.prototype.mockReconciliation)).toBe('payments');
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, PaymentsController.prototype.mockReconciliation)).toEqual([
      TENANT_PERMISSIONS.FINANCE_READ,
      TENANT_PERMISSIONS.FINANCE_MANAGE,
    ]);
  });

  it('encaminha filtros de conciliacao mock para service', async () => {
    const service = {
      handleWebhook: jest.fn(),
      getPaymentStatusByProviderPaymentId: jest.fn(),
      getMockReconciliation: jest.fn().mockResolvedValue({ items: [] }),
    };
    const controller = new PaymentsController(service as never);
    const ctx = { companyId: 'c1', branchId: 'b1', userRole: 'owner', requestId: 'req_1' } as any;

    await controller.mockReconciliation(ctx, '2026-05-01', '2026-05-02', '25');

    expect(service.getMockReconciliation).toHaveBeenCalledWith(ctx, {
      dateFrom: '2026-05-01',
      dateTo: '2026-05-02',
      limit: 25,
    });
  });
});
