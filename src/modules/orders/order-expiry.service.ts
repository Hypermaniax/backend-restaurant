import { Injectable } from '@nestjs/common';
import {
  OrderStatus,
  OrderStatusSource,
  PaymentStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderRepository } from './order.repository';

@Injectable()
export class OrderExpiryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrderRepository,
  ) {}

  async expireStaleOrders(now = new Date()): Promise<number> {
    const staleOrders = await this.orders.findStaleOrders(now);
    let expired = 0;

    for (const stale of staleOrders) {
      const changed = await this.prisma.$transaction(async (tx) => {
        const transitioned = await this.orders.transition(
          stale.outletId,
          stale.id,
          [stale.status],
          {
            status: OrderStatus.EXPIRED,
            paymentStatus: PaymentStatus.EXPIRED,
          },
          tx,
        );

        if (!transitioned) {
          return false;
        }

        await this.orders.expirePendingPayments(
          stale.id,
          PaymentStatus.EXPIRED,
          tx,
        );

        await this.orders.createStatusLog(
          {
            orderId: stale.id,
            fromStatus: stale.status,
            toStatus: OrderStatus.EXPIRED,
            source: OrderStatusSource.SYSTEM,
            note: 'Kedaluwarsa otomatis',
          },
          tx,
        );
        return true;
      });

      if (changed) {
        expired += 1;
      }
    }

    return expired;
  }
}
