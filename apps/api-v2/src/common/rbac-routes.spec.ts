import { IS_PUBLIC_KEY } from './public.decorator';
import { REQUIRED_PERMISSIONS_KEY } from './permissions.decorator';
import { TENANT_PERMISSIONS } from './rbac';
import { OrdersController } from '../orders/orders.controller';
import { PdvController } from '../pdv/pdv.controller';
import { KdsController } from '../kds/kds.controller';
import { SettingsController } from '../settings/settings.controller';
import { AdminUsersController } from '../admin-users/admin-users.controller';
import { AdminBillingController } from '../billing/admin-billing.controller';
import { BillingController } from '../billing/billing.controller';
import { ModulesController } from '../modules/modules.controller';
import { DeliveryController } from '../delivery/delivery.controller';
import { PaymentsController } from '../payments/payments.controller';
import { BillingWebhookController } from '../billing/billing.webhook.controller';

function methodPermissions(target: object, methodName: string): string[] {
  const method = (target as Record<string, unknown>)[methodName] as Function;
  return Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, method) ?? [];
}

describe('RBAC route permissions metadata', () => {
  it('orders exige permissions de leitura e manage', () => {
    expect(methodPermissions(OrdersController.prototype, 'list')).toEqual([
      TENANT_PERMISSIONS.ORDERS_READ,
      TENANT_PERMISSIONS.ORDERS_MANAGE,
    ]);
    expect(methodPermissions(OrdersController.prototype, 'getById')).toEqual([
      TENANT_PERMISSIONS.ORDERS_READ,
      TENANT_PERMISSIONS.ORDERS_MANAGE,
    ]);
    expect(methodPermissions(OrdersController.prototype, 'updateStatus')).toEqual([
      TENANT_PERMISSIONS.ORDERS_MANAGE,
    ]);
  });

  it('pdv exige pdv.operate no controller', () => {
    const classPermissions = Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, PdvController);
    expect(classPermissions).toEqual([TENANT_PERMISSIONS.PDV_OPERATE]);
  });

  it('kds exige kds.operate no controller', () => {
    const classPermissions = Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, KdsController);
    expect(classPermissions).toEqual([TENANT_PERMISSIONS.KDS_OPERATE]);
  });

  it('settings separa leitura e escrita', () => {
    expect(methodPermissions(SettingsController.prototype, 'getCompany')).toEqual([
      TENANT_PERMISSIONS.SETTINGS_READ,
      TENANT_PERMISSIONS.SETTINGS_WRITE,
    ]);
    expect(methodPermissions(SettingsController.prototype, 'patchCompany')).toEqual([
      TENANT_PERMISSIONS.SETTINGS_WRITE,
    ]);
  });

  it('admin-users separa leitura e escrita', () => {
    expect(methodPermissions(AdminUsersController.prototype, 'listUsers')).toEqual([
      TENANT_PERMISSIONS.ADMIN_USERS_READ,
      TENANT_PERMISSIONS.ADMIN_USERS_WRITE,
    ]);
    expect(methodPermissions(AdminUsersController.prototype, 'createUser')).toEqual([
      TENANT_PERMISSIONS.ADMIN_USERS_WRITE,
    ]);
  });

  it('billing tenant e admin exigem permissoes de billing', () => {
    expect(methodPermissions(AdminBillingController.prototype, 'getCurrent')).toEqual([
      TENANT_PERMISSIONS.BILLING_READ,
      TENANT_PERMISSIONS.BILLING_MANAGE,
    ]);
    expect(methodPermissions(BillingController.prototype, 'createMockInvoice')).toContain(
      TENANT_PERMISSIONS.BILLING_MANAGE,
    );
  });

  it('modules exige leitura/gestao conforme rota', () => {
    expect(methodPermissions(ModulesController.prototype, 'listCurrentCompanyModules')).toContain(
      TENANT_PERMISSIONS.MODULES_READ,
    );
    expect(methodPermissions(ModulesController.prototype, 'updateCurrentCompanyModule')).toContain(
      TENANT_PERMISSIONS.MODULES_MANAGE,
    );
  });

  it('delivery admin exige delivery.operate/settings.write', () => {
    expect(methodPermissions(DeliveryController.prototype, 'listFees')).toEqual([
      TENANT_PERMISSIONS.DELIVERY_OPERATE,
      TENANT_PERMISSIONS.SETTINGS_WRITE,
    ]);
    expect(methodPermissions(DeliveryController.prototype, 'updateFees')).toEqual([
      TENANT_PERMISSIONS.DELIVERY_OPERATE,
      TENANT_PERMISSIONS.SETTINGS_WRITE,
    ]);
  });

  it('payments status e webhook sao publicos', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, PaymentsController.prototype.paymentStatus)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, PaymentsController.prototype.webhook)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, BillingWebhookController.prototype.handleWebhook)).toBe(true);
  });
});
