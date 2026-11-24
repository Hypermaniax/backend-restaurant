import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { OrdersModule } from '../orders/orders.module';
import { SecurityModule } from '../security/security.module';
import { KdsController } from './kds.controller';
import { PublicDisplayController } from './public-display.controller';

@Module({
  imports: [
    SecurityModule,
    OrdersModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
  ],
  controllers: [KdsController, PublicDisplayController],
})
export class KdsModule {}
