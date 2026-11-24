import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderExpiryService } from './order-expiry.service';

@Injectable()
export class OrderExpiryScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderExpiryScheduler.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly expiry: OrderExpiryService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('NODE_ENV') === 'test') {
      return;
    }

    this.timer = setInterval(() => {
      void this.expiry.expireStaleOrders().catch((error: unknown) => {
        this.logger.error('Gagal mengekspirasi order', error);
      });
    }, 60_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }
}
