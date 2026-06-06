import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ChannelsModule } from './channels/channels.module';
import { ModulesModule } from './modules/modules.module';
import { OrdersModule } from './orders/orders.module';
import { MenuModule } from './menu/menu.module';
import { DeliveryModule } from './delivery/delivery.module';
import { PaymentsModule } from './payments/payments.module';
import { KdsModule } from './kds/kds.module';
import { PdvModule } from './pdv/pdv.module';
import { DeveloperModule } from './developer/developer.module';
import { AdminMenuModule } from './admin-menu/admin-menu.module';
import { AdminUsersModule } from './admin-users/admin-users.module';
import { SettingsModule } from './settings/settings.module';
import { BillingModule } from './billing/billing.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { BranchesModule } from './branches/branches.module';
import { RecipesModule } from './recipes/recipes.module';
import { StockModule } from './stock/stock.module';
import { ProcurementModule } from './procurement/procurement.module';
import { TablesModule } from './tables/tables.module';
import { FinanceModule } from './finance/finance.module';
import { ReportsModule } from './reports/reports.module';
import { NotificationsModule } from './notifications/notifications.module';
import { LogisticsModule } from './logistics/logistics.module';
import { CrmModule } from './crm/crm.module';
import { PromotionsModule } from './promotions/promotions.module';
import { CouponsModule } from './coupons/coupons.module';
import { JobsModule } from './jobs/jobs.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { LocalPlatformModule } from './local/local-platform.module';
import { HealthController } from './health.controller';
import { AuthModuleV2 } from './auth/auth.module';
import { AuthGuardV2 } from './common/auth.guard';
import { PermissionGuardV2 } from './common/permission.guard';
import { LocalRateLimitGuard } from './common/local-rate-limit.guard';
import { RequireAdminGuard } from './common/require-admin.guard';
import { RequireDeveloperGuard } from './common/require-developer.guard';
import { PrismaService } from './database/prisma.service';

@Module({
  imports: [
    AuthModuleV2,
    ModulesModule,
    ChannelsModule,
    OrdersModule,
    MenuModule,
    DeliveryModule,
    PaymentsModule,
    KdsModule,
    PdvModule,
    DeveloperModule,
    AdminMenuModule,
    AdminUsersModule,
    SettingsModule,
    BillingModule,
    OnboardingModule,
    BranchesModule,
    RecipesModule,
    StockModule,
    ProcurementModule,
    TablesModule,
    FinanceModule,
    ReportsModule,
    NotificationsModule,
    LogisticsModule,
    CrmModule,
    PromotionsModule,
    CouponsModule,
    JobsModule,
    IntegrationsModule,
    LocalPlatformModule,
  ],
  controllers: [HealthController],
  providers: [
    PrismaService,
    { provide: APP_GUARD, useClass: AuthGuardV2 },
    { provide: APP_GUARD, useClass: LocalRateLimitGuard },
    { provide: APP_GUARD, useClass: PermissionGuardV2 },
    RequireAdminGuard,
    RequireDeveloperGuard,
  ],
})
export class AppModule {}
