import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderStatus,
  OrderStatusSource,
  UserRole,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RealtimeService } from '../realtime/realtime.service';
import { TableSessionService } from '../tables/table-session.service';
import type { AuthUser } from '../security/types/auth-user';
import { toAuditOrder } from './order.mapper';
import { OrderRepository, type OrderRecord } from './order.repository';
import { toDisplayQueueItem, toKdsOrderView } from './order.presenter';
import type { KdsOrderView } from './order.types';

@Injectable()
export class OrderFulfillmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrderRepository,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly sessions: TableSessionService,
  ) {}

  async updateKdsStatus(
    outletId: string,
    orderId: string,
    actor: AuthUser,
    targetStatus: OrderStatus,
  ): Promise<KdsOrderView> {
    const allowedFrom: Record<string, OrderStatus> = {
      [OrderStatus.PREPARING]: OrderStatus.PAID,
      [OrderStatus.READY]: OrderStatus.PREPARING,
      [OrderStatus.SERVED]: OrderStatus.READY,
    };
    const fromStatus = allowedFrom[targetStatus];
    if (!fromStatus) {
      throw new BadRequestException('Status KDS tidak valid');
    }

    const current = await this.requireOrder(outletId, orderId);
    if (current.status !== fromStatus) {
      throw new BadRequestException(
        `Status ${targetStatus} membutuhkan order ${fromStatus}`,
      );
    }

    const now = new Date();
    const source =
      actor.role === UserRole.ADMIN
        ? OrderStatusSource.ADMIN
        : OrderStatusSource.KITCHEN;
    const order = await this.prisma.$transaction(async (tx) => {
      const transitioned = await this.orders.transition(
        outletId,
        orderId,
        [fromStatus],
        {
          status: targetStatus,
          ...(targetStatus === OrderStatus.PREPARING
            ? { preparingAt: now }
            : {}),
          ...(targetStatus === OrderStatus.READY ? { readyAt: now } : {}),
          ...(targetStatus === OrderStatus.SERVED ? { servedAt: now } : {}),
        },
        tx,
      );

      if (!transitioned) {
        throw new ConflictException('Status order sudah berubah');
      }

      await this.orders.createStatusLog(
        {
          orderId,
          fromStatus,
          toStatus: targetStatus,
          actorUserId: actor.userId,
          source,
          note: `KDS: ${targetStatus}`,
        },
        tx,
      );

      await this.audit.record(
        {
          outletId,
          actorUserId: actor.userId,
          action: 'ORDER_STATUS_UPDATED',
          entityType: 'order',
          entityId: orderId,
          before: toAuditOrder(current),
          after: {
            ...toAuditOrder(current),
            status: targetStatus,
          },
        },
        tx,
      );

      const saved = await this.orders.findById(outletId, orderId, tx);
      if (!saved) {
        throw new NotFoundException('Order tidak ditemukan');
      }
      return saved;
    });

    if (targetStatus === OrderStatus.SERVED && order.sessionId) {
      await this.sessions.closeIfIdle(outletId, order.sessionId);
    }

    const kdsOrder = toKdsOrderView(order);
    this.realtime.emitOrderStatusChanged(outletId, {
      order: kdsOrder,
      fromStatus,
      toStatus: targetStatus,
    });
    const queue = toDisplayQueueItem(order);
    if (queue) {
      this.realtime.emitQueueUpdated(outletId, { queue });
    }
    return kdsOrder;
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
