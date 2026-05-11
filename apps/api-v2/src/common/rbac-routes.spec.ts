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
import { AdminMenuController, AdminMenuUtilityController } from '../admin-menu/admin-menu.controller';
import { ChannelsController } from '../channels/channels.controller';
import { DeveloperController } from '../developer/developer.controller';
import { OnboardingController } from '../onboarding/onboarding.controller';
import { BranchesController } from '../branches/branches.controller';
import { PLATFORM_PERMISSIONS } from './rbac';
import { RecipesController } from '../recipes/recipes.controller';
import { StockController } from '../stock/stock.controller';
import { MODULE_ACCESS_KEY } from '../modules/module-access.decorator';

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

  it('admin-menu exige catalog.read/manage para leitura e catalog.manage para escrita', () => {
    expect(methodPermissions(AdminMenuController.prototype, 'list')).toEqual([
      TENANT_PERMISSIONS.CATALOG_READ,
      TENANT_PERMISSIONS.CATALOG_MANAGE,
    ]);
    expect(methodPermissions(AdminMenuController.prototype, 'get')).toEqual([
      TENANT_PERMISSIONS.CATALOG_READ,
      TENANT_PERMISSIONS.CATALOG_MANAGE,
    ]);
    expect(methodPermissions(AdminMenuController.prototype, 'create')).toEqual([
      TENANT_PERMISSIONS.CATALOG_MANAGE,
    ]);
    expect(methodPermissions(AdminMenuController.prototype, 'update')).toEqual([
      TENANT_PERMISSIONS.CATALOG_MANAGE,
    ]);
    expect(methodPermissions(AdminMenuController.prototype, 'updateAvailability')).toEqual([
      TENANT_PERMISSIONS.CATALOG_MANAGE,
    ]);
    expect(methodPermissions(AdminMenuController.prototype, 'duplicate')).toEqual([
      TENANT_PERMISSIONS.CATALOG_MANAGE,
    ]);
    expect(methodPermissions(AdminMenuUtilityController.prototype, 'listCategories')).toEqual([
      TENANT_PERMISSIONS.CATALOG_READ,
      TENANT_PERMISSIONS.CATALOG_MANAGE,
    ]);
    expect(methodPermissions(AdminMenuUtilityController.prototype, 'createCategory')).toEqual([
      TENANT_PERMISSIONS.CATALOG_MANAGE,
    ]);
    expect(methodPermissions(AdminMenuUtilityController.prototype, 'updateCategory')).toEqual([
      TENANT_PERMISSIONS.CATALOG_MANAGE,
    ]);
    expect(methodPermissions(AdminMenuUtilityController.prototype, 'deleteCategory')).toEqual([
      TENANT_PERMISSIONS.CATALOG_MANAGE,
    ]);
  });

  it('channels pdv checkout exige pdv.operate', () => {
    expect(methodPermissions(ChannelsController.prototype, 'pdvCheckout')).toEqual([
      TENANT_PERMISSIONS.PDV_OPERATE,
    ]);
  });

  it('channels waiter checkout exige waiter.operate', () => {
    expect(methodPermissions(ChannelsController.prototype, 'waiterCheckout')).toEqual([
      TENANT_PERMISSIONS.WAITER_OPERATE,
    ]);
  });

  it('channels kiosk checkout e publico', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, ChannelsController.prototype.kioskCheckout)).toBe(true);
  });

  it('stock usa modulo stock e permissions de inventario', () => {
    expect(Reflect.getMetadata(MODULE_ACCESS_KEY, StockController)).toBe('stock');
    expect(methodPermissions(StockController.prototype, 'listItems')).toEqual([
      TENANT_PERMISSIONS.INVENTORY_READ,
      TENANT_PERMISSIONS.INVENTORY_MANAGE,
    ]);
    expect(methodPermissions(StockController.prototype, 'createItem')).toEqual([
      TENANT_PERMISSIONS.INVENTORY_MANAGE,
    ]);
    expect(methodPermissions(StockController.prototype, 'manualEntry')).toEqual([
      TENANT_PERMISSIONS.INVENTORY_MANAGE,
    ]);
    expect(methodPermissions(StockController.prototype, 'manualExit')).toEqual([
      TENANT_PERMISSIONS.INVENTORY_MANAGE,
    ]);
    expect(methodPermissions(StockController.prototype, 'applyInventoryCount')).toEqual([
      TENANT_PERMISSIONS.INVENTORY_MANAGE,
    ]);
    expect(methodPermissions(StockController.prototype, 'listBreakageAlerts')).toEqual([
      TENANT_PERMISSIONS.INVENTORY_READ,
      TENANT_PERMISSIONS.INVENTORY_MANAGE,
    ]);
  });
  it('recipes usa modulo stock e permissoes premium de ficha/producao/custo', () => {
    expect(Reflect.getMetadata(MODULE_ACCESS_KEY, RecipesController)).toBe('stock');
    expect(methodPermissions(RecipesController.prototype, 'listRecipes')).toEqual([
      TENANT_PERMISSIONS.RECIPE_READ,
      TENANT_PERMISSIONS.RECIPE_MANAGE,
    ]);
    expect(methodPermissions(RecipesController.prototype, 'createRecipe')).toEqual([
      TENANT_PERMISSIONS.RECIPE_MANAGE,
    ]);
    expect(methodPermissions(RecipesController.prototype, 'getRecipeCostBreakdown')).toEqual([
      TENANT_PERMISSIONS.COST_READ,
      TENANT_PERMISSIONS.RECIPE_READ,
      TENANT_PERMISSIONS.RECIPE_MANAGE,
    ]);
    expect(methodPermissions(RecipesController.prototype, 'listProductionOrders')).toEqual([
      TENANT_PERMISSIONS.PRODUCTION_READ,
      TENANT_PERMISSIONS.PRODUCTION_MANAGE,
    ]);
    expect(methodPermissions(RecipesController.prototype, 'createProductionOrder')).toEqual([
      TENANT_PERMISSIONS.PRODUCTION_MANAGE,
    ]);
    expect(methodPermissions(RecipesController.prototype, 'applyRecipeSubstitution')).toEqual([
      TENANT_PERMISSIONS.RECIPE_MANAGE,
    ]);
  });

  it('developer exige permissoes de plataforma explicitas', () => {
    expect(methodPermissions(DeveloperController.prototype, 'listPlans')).toEqual([
      PLATFORM_PERMISSIONS.PLANS_MANAGE,
    ]);
    expect(methodPermissions(DeveloperController.prototype, 'listCompanies')).toEqual([
      PLATFORM_PERMISSIONS.COMPANIES_READ,
    ]);
    expect(methodPermissions(DeveloperController.prototype, 'updateCompanyModule')).toEqual([
      PLATFORM_PERMISSIONS.MODULES_MANAGE,
      PLATFORM_PERMISSIONS.COMPANIES_UPDATE,
    ]);
  });

  it('branches admin exige settings permissions', () => {
    expect(methodPermissions(BranchesController.prototype, 'list')).toEqual([
      TENANT_PERMISSIONS.SETTINGS_READ,
      TENANT_PERMISSIONS.SETTINGS_WRITE,
    ]);
    expect(methodPermissions(BranchesController.prototype, 'create')).toEqual([
      TENANT_PERMISSIONS.SETTINGS_WRITE,
    ]);
    expect(methodPermissions(BranchesController.prototype, 'update')).toEqual([
      TENANT_PERMISSIONS.SETTINGS_WRITE,
    ]);
  });

  it('onboarding exige leitura/escrita de settings', () => {
    expect(methodPermissions(OnboardingController.prototype, 'getStatus')).toEqual([
      TENANT_PERMISSIONS.SETTINGS_READ,
      TENANT_PERMISSIONS.SETTINGS_WRITE,
    ]);
    expect(methodPermissions(OnboardingController.prototype, 'getNextStep')).toEqual([
      TENANT_PERMISSIONS.SETTINGS_READ,
      TENANT_PERMISSIONS.SETTINGS_WRITE,
    ]);
    expect(methodPermissions(OnboardingController.prototype, 'patchStep')).toEqual([
      TENANT_PERMISSIONS.SETTINGS_WRITE,
    ]);
    expect(methodPermissions(OnboardingController.prototype, 'reset')).toEqual([
      TENANT_PERMISSIONS.SETTINGS_WRITE,
    ]);
  });
});

