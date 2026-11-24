import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CounterType,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RealtimeService } from '../realtime/realtime.service';
import { TableSessionService } from '../tables/table-session.service';
import { OrderReceiptService } from './order-receipt.service';
import type { AuthUser } from '../security/types/auth-user';
import type { CancelOrderDto, ConfirmOrderPaymentDto } from './dto/order.dto';
import { recordQueueAssigned } from './order.audit';
import { toAuditOrder, toView } from './order.mapper';
import { OrderRepository, type OrderRecord } from './order.repository';
import { toDisplayQueueItem, toKdsOrderView } from './order.presenter';
import type { OrderView } from './order.types';
import { createPaymentReference, resolveStatusSource } from './order.utils';

@Injectable()
export class OrderLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrderRepository,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly sessions: TableSessionService,
    private readonly receipts: OrderReceiptService,
  ) {}

  async confirmPayment(
    outletId: string,
    orderId: string,
    actor: AuthUser,
    dto: ConfirmOrderPaymentDto,
  ): Promise<OrderView> {
    const current = await this.requireOrder(outletId, orderId);
    if (
      current.status !== OrderStatus.AWAITING_CASH &&
      current.status !== OrderStatus.PENDING_PAYMENT
    ) {
      throw new BadRequestException(
        'Hanya order yang belum dibayar yang bisa dikonfirmasi',
      );
    }

    const now = new Date();
    const statusSource = resolveStatusSource(actor.role);
    const order = await this.prisma.$transaction(async (tx) => {
      const queueNumber = await this.orders.nextCounter(
        outletId,
        current.businessDate,
        CounterType.QUEUE,
        tx,
      );
      const transitioned = await this.orders.transition(
        outletId,
        current.id,
        [OrderStatus.AWAITING_CASH, OrderStatus.PENDING_PAYMENT],
        {
          status: OrderStatus.PAID,
          paymentStatus: PaymentStatus.PAID,
          paidAt: now,
          queueNumber,
          queueAssignedAt: now,
        },
        tx,
      );

      if (!transitioned) {
        throw new ConflictException('Status order sudah berubah');
      }

      await this.orders.expirePendingPayments(
        current.id,
        PaymentStatus.EXPIRED,
        tx,
      );

      await this.orders.createPayment(
        {
          orderId: current.id,
          provider: PaymentProvider.CASHIER,
          method: dto.paymentMethod,
          status: PaymentStatus.PAID,
          amount: current.total,
          referenceId: createPaymentReference(),
          paidAt: now,
        },
        tx,
      );

      await this.orders.createStatusLog(
        {
          orderId: current.id,
          fromStatus: current.status,
          toStatus: OrderStatus.PAID,
          actorUserId: actor.userId,
          source: statusSource,
          note: 'Pembayaran tunai/EDC dikonfirmasi kasir',
        },
        tx,
      );

      await this.audit.record(
        {
          outletId,
          actorUserId: actor.userId,
          action: 'ORDER_PAYMENT_CONFIRMED',
          entityType: 'order',
          entityId: current.id,
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
        current.id,
        queueNumber,
        actor.userId,
        tx,
      );

      const saved = await this.orders.findById(outletId, current.id, tx);
      if (!saved) {
        throw new NotFoundException('Order tidak ditemukan');
      }
      return saved;
    });

    void this.receipts.sendForOrder(order.outletId, order.id);

    const kdsOrder = toKdsOrderView(order);
    this.realtime.emitOrderPaid(order.outletId, { order: kdsOrder });
    const queue = toDisplayQueueItem(order);
    if (queue) {
      this.realtime.emitQueueUpdated(order.outletId, { queue });
    }
    return toView(order);
  }

  async cancelOrder(
    outletId: string,
    orderId: string,
    actor: AuthUser,
    dto: CancelOrderDto,
  ): Promise<OrderView> {
    const current = await this.requireOrder(outletId, orderId);
    if (
      current.status !== OrderStatus.PENDING_PAYMENT &&
      current.status !== OrderStatus.AWAITING_CASH
    ) {
      throw new BadRequestException(
        'Order hanya bisa dibatalkan sebelum dibayar',
      );
    }

    const now = new Date();
    const statusSource = resolveStatusSource(actor.role);
    const order = await this.prisma.$transaction(async (tx) => {
      const transitioned = await this.orders.transition(
        outletId,
        current.id,
        [OrderStatus.PENDING_PAYMENT, OrderStatus.AWAITING_CASH],
        {
          status: OrderStatus.CANCELLED,
          cancelledAt: now,
          cancelledByUserId: actor.userId,
          cancelReason: dto.reason,
          queueNumber: null,
          queueAssignedAt: null,
        },
        tx,
      );

      if (!transitioned) {
        throw new ConflictException('Status order sudah berubah');
      }

      await this.orders.expirePendingPayments(
        current.id,
        PaymentStatus.EXPIRED,
        tx,
      );

      await this.orders.createStatusLog(
        {
          orderId: current.id,
          fromStatus: current.status,
          toStatus: OrderStatus.CANCELLED,
          actorUserId: actor.userId,
          source: statusSource,
          note: dto.reason,
        },
        tx,
      );

      await this.audit.record(
        {
          outletId,
          actorUserId: actor.userId,
          action: 'ORDER_CANCELLED',
          entityType: 'order',
          entityId: current.id,
          before: toAuditOrder(current),
          after: {
            ...toAuditOrder(current),
            status: OrderStatus.CANCELLED,
            cancelReason: dto.reason,
          },
        },
        tx,
      );

      const saved = await this.orders.findById(outletId, current.id, tx);
      if (!saved) {
        throw new NotFoundException('Order tidak ditemukan');
      }
      return saved;
    });

    if (order.sessionId) {
      await this.sessions.closeIfIdle(order.outletId, order.sessionId);
    }

    this.realtime.emitOrderCancelled(order.outletId, {
      order: toKdsOrderView(order),
    });
    return toView(order);
  }

  private async requireOrder(
    outletId: string,
    orderId: string,
  ): Promise<OrderRecord> {
    const order = await this.orders.findById(outletId, orderId);
    if (!order) {
      throw new NotFoundException('Order tidak ditemukan');
    }
    return order;
  }
}
