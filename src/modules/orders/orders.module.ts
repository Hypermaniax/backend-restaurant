import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EmailModule } from '../email/email.module';
import { SecurityModule } from '../security/security.module';
import { SettingsModule } from '../settings/settings.module';
import { TablesModule } from '../tables/tables.module';
import { CashierDashboardController } from './cashier-dashboard.controller';
import { CashierOrdersController } from './cashier-orders.controller';
import { CashierOrderCreationService } from './cashier-order-creation.service';
import { OrderQuoteService } from './order-quote.service';
import { OrderExpiryScheduler } from './order-expiry.scheduler';
import { OrderExpiryService } from './order-expiry.service';
import { OrderPaymentStateService } from './order-payment-state.service';
import { OrderQueryService } from './order-query.service';
import { OrderReceiptPdfService } from './order-receipt-pdf.service';
import { OrderReceiptService } from './order-receipt.service';
import { OrderRepository } from './order.repository';
import { PublicOrderCreationService } from './public-order-creation.service';
import { OrderFulfillmentService } from './order-fulfillment.service';
import { OrderLifecycleService } from './order-lifecycle.service';
import { PricingService } from './pricing.service';
import { PublicOrdersController } from './public-orders.controller';

@Module({
  imports: [
    SecurityModule,
    SettingsModule,
    AuditModule,
    TablesModule,
    EmailModule,
  ],
  controllers: [
    PublicOrdersController,
    CashierOrdersController,
    CashierDashboardController,
  ],
  providers: [
    OrderRepository,
    PricingService,
    OrderQuoteService,
    PublicOrderCreationService,
    CashierOrderCreationService,
    OrderLifecycleService,
    OrderFulfillmentService,
    OrderQueryService,
    OrderPaymentStateService,
    OrderExpiryService,
    OrderExpiryScheduler,
    OrderReceiptPdfService,
    OrderReceiptService,
  ],
  exports: [
    OrderQuoteService,
    PublicOrderCreationService,
    CashierOrderCreationService,
    OrderLifecycleService,
    OrderFulfillmentService,
    OrderQueryService,
    OrderPaymentStateService,
    OrderExpiryService,
    OrderReceiptService,
  ],
})
export class OrdersModule {}
