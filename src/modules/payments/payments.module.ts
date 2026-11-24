import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OrdersModule } from '../orders/orders.module';
import { SecurityModule } from '../security/security.module';
import { CashierPaymentsController } from './cashier-payments.controller';
import { PaymentRepository } from './payment.repository';
import { PaymentsService } from './payments.service';
import { XenditEventProcessorService } from './xendit-event-processor.service';
import { XenditWebhookService } from './xendit-webhook.service';
import { PublicPaymentsController } from './public-payments.controller';
import { XenditWebhookController } from './xendit-webhook.controller';
import {
  PAYMENT_GATEWAY,
  XenditPaymentProvider,
} from './xendit-payment.provider';

@Module({
  imports: [SecurityModule, OrdersModule, AuditModule],
  controllers: [
    PublicPaymentsController,
    CashierPaymentsController,
    XenditWebhookController,
  ],
  providers: [
    PaymentRepository,
    PaymentsService,
    XenditEventProcessorService,
    XenditWebhookService,
    XenditPaymentProvider,
    {
      provide: PAYMENT_GATEWAY,
      useExisting: XenditPaymentProvider,
    },
  ],
  exports: [PaymentsService, XenditEventProcessorService, XenditWebhookService],
})
export class PaymentsModule {}
