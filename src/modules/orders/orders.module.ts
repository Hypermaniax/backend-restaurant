import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SecurityModule } from '../security/security.module';
import { SettingsModule } from '../settings/settings.module';
import { TablesModule } from '../tables/tables.module';
import { CashierDashboardController } from './cashier-dashboard.controller';
import { CashierOrdersController } from './cashier-orders.controller';
import { OrderExpiryScheduler } from './order-expiry.scheduler';
import { OrderRepository } from './order.repository';
import { OrdersService } from './orders.service';
import { PricingService } from './pricing.service';
import { PublicOrdersController } from './public-orders.controller';

@Module({
  imports: [SecurityModule, SettingsModule, AuditModule, TablesModule],
  controllers: [
    PublicOrdersController,
    CashierOrdersController,
    CashierDashboardController,
  ],
  providers: [
    OrderRepository,
    PricingService,
    OrdersService,
    OrderExpiryScheduler,
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
