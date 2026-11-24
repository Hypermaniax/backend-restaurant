import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  CounterType,
  OrderStatus,
  OrderStatusSource,
  PaymentStatus,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../security/types/auth-user';
import { recordQueueAssigned } from './order.audit';
import { toAuditOrder } from './order.mapper';
import { OrderRepository } from './order.repository';
import type { PaymentOrderView } from './order.types';
import { resolveStatusSource } from './order.utils';

@Injectable()
export class OrderPaymentStateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrderRepository,
    private readonly audit: AuditService,
  ) {}

  async startOnlinePayment(
    order: PaymentOrderView,
    actor?: AuthUser,
  ): Promise<void> {
    if (
      order.status !== OrderStatus.PENDING_PAYMENT &&
      order.status !== OrderStatus.AWAITING_CASH
    ) {
      throw new BadRequestException(
        'Order tidak bisa dibayar online pada status ini',
      );
    }
    if (order.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Order sudah kedaluwarsa');
    }

    await this.prisma.$transaction(async (tx) => {
      const transitioned = await this.orders.transition(
        order.outletId,
        order.id,
        [OrderStatus.PENDING_PAYMENT, OrderStatus.AWAITING_CASH],
        {
          status: OrderStatus.PENDING_PAYMENT,
          paymentStatus: PaymentStatus.PENDING,
        },
        tx,
      );

      if (!transitioned) {
        throw new ConflictException('Status order sudah berubah');
      }

      if (order.status !== OrderStatus.PENDING_PAYMENT) {
        await this.orders.createStatusLog(
          {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: OrderStatus.PENDING_PAYMENT,
            actorUserId: actor?.userId,
            source: actor
              ? resolveStatusSource(actor.role)
              : OrderStatusSource.CUSTOMER,
            note: 'Menunggu pembayaran QRIS',
          },
          tx,
        );
      }
    });
  }

  async markPaidByQris(
    outletId: string,
    orderId: string,
    paidAt: Date,
    tx: Prisma.TransactionClient,
  ): Promise<number | null> {
    const current = await this.orders.findById(outletId, orderId, tx);
    if (
      !current ||
      (current.status !== OrderStatus.PENDING_PAYMENT &&
        current.status !== OrderStatus.AWAITING_CASH)
    ) {
      return null;
    }

    const queueNumber = await this.orders.nextCounter(
      outletId,
      current.businessDate,
      CounterType.QUEUE,
      tx,
    );
    const transitioned = await this.orders.transition(
      outletId,
      orderId,
      [OrderStatus.PENDING_PAYMENT, OrderStatus.AWAITING_CASH],
      {
        status: OrderStatus.PAID,
        paymentStatus: PaymentStatus.PAID,
        paidAt,
        queueNumber,
        queueAssignedAt: paidAt,
      },
      tx,
    );

    if (!transitioned) {
      return null;
    }

    await this.orders.createStatusLog(
      {
        orderId,
        fromStatus: current.status,
        toStatus: OrderStatus.PAID,
        source: OrderStatusSource.SYSTEM,
        note: 'Pembayaran QRIS terverifikasi',
      },
      tx,
    );

    await this.audit.record(
      {
        outletId,
        action: 'ORDER_PAID',
        entityType: 'order',
        entityId: orderId,
        before: toAuditOrder(current),
        after: {
          ...toAuditOrder(current),
          status: OrderStatus.PAID,
          paymentStatus: PaymentStatus.PAID,
          queueNumber,
        },
      },
      tx,
    );

    await recordQueueAssigned(
      this.audit,
      outletId,
      orderId,
      queueNumber,
      undefined,
      tx,
    );

    return queueNumber;
  }

  async setPaymentStatusFromProvider(
    outletId: string,
    orderId: string,
    status: PaymentStatus,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const current = await this.orders.findById(outletId, orderId, tx);
    if (
      !current ||
      current.paymentStatus === PaymentStatus.PAID ||
      current.status === OrderStatus.PAID ||
      current.status === OrderStatus.CANCELLED ||
      current.status === OrderStatus.EXPIRED
    ) {
      return false;
    }

    return this.orders.transition(
      outletId,
      orderId,
      [OrderStatus.PENDING_PAYMENT, OrderStatus.AWAITING_CASH],
      { paymentStatus: status },
      tx,
    );
  }
}
