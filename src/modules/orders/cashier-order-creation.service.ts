import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CounterType,
  OrderSource,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  UserRole,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { TableSessionService } from '../tables/table-session.service';
import { RealtimeService } from '../realtime/realtime.service';
import { OrderReceiptService } from './order-receipt.service';
import type { AuthUser } from '../security/types/auth-user';
import type { CreateCashierOrderDto } from './dto/order.dto';
import { recordQueueAssigned } from './order.audit';
import {
  toAuditOrder,
  toOrderItems,
  toOrderPricing,
  toView,
} from './order.mapper';
import { OrderRepository } from './order.repository';
import { toDisplayQueueItem, toKdsOrderView } from './order.presenter';
import type { OrderView } from './order.types';
import {
  createPaymentReference,
  formatOrderNumber,
  isUniqueConstraintError,
  normalizeIdempotencyKey,
  resolveBusinessDate,
  resolveStatusSource,
} from './order.utils';
import { PricingService } from './pricing.service';

@Injectable()
export class CashierOrderCreationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrderRepository,
    private readonly pricing: PricingService,
    private readonly settings: SettingsService,
    private readonly sessions: TableSessionService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly receipts: OrderReceiptService,
  ) {}

  async createCashierOrder(
    outletId: string,
    actor: AuthUser,
    dto: CreateCashierOrderDto,
    idempotencyKey?: string,
  ): Promise<OrderView> {
    const key = normalizeIdempotencyKey(idempotencyKey);

    if (key) {
      const existing = await this.orders.findByIdempotencyKey(outletId, key);
      if (existing) {
        return toView(existing);
      }
    }

    if (dto.orderType === OrderType.DINE_IN && !dto.tableId) {
      throw new BadRequestException('Dine-in wajib memilih meja');
    }
    if (dto.orderType === OrderType.TAKEAWAY && dto.tableId) {
      throw new BadRequestException('Takeaway tidak boleh memakai meja');
    }

    const pricing = await this.pricing.price(
      outletId,
      dto.orderType,
      dto.items,
    );
    const outlet = await this.orders.findOutlet(outletId);
    if (!outlet) {
      throw new NotFoundException('Outlet tidak ditemukan');
    }
    const settings = await this.settings.getSettings(outletId);
    const now = new Date();
    const businessDate = resolveBusinessDate(now, outlet.timezone);
    const statusSource = resolveStatusSource(actor.role);
    const awaitingQris = dto.paymentMethod === PaymentMethod.QRIS;

    try {
      const order = await this.prisma.$transaction(async (tx) => {
        const session =
          dto.orderType === OrderType.DINE_IN
            ? await this.sessions.ensureSessionForOrder(
                outletId,
                dto.tableId!,
                tx,
              )
            : null;
        const orderSequence = await this.orders.nextCounter(
          outletId,
          businessDate,
          CounterType.ORDER,
          tx,
        );
        const queueNumber = awaitingQris
          ? null
          : await this.orders.nextCounter(
              outletId,
              businessDate,
              CounterType.QUEUE,
              tx,
            );

        const created = await this.orders.createOrder(
          {
            ...toOrderPricing(pricing),
            outletId,
            orderType: dto.orderType,
            source:
              actor.role === UserRole.ADMIN
                ? OrderSource.ADMIN
                : OrderSource.CASHIER,
            createdByUserId: actor.userId,
            tableId: dto.orderType === OrderType.DINE_IN ? dto.tableId! : null,
            sessionId: session?.id ?? null,
            orderNumber: formatOrderNumber(businessDate, orderSequence),
            idempotencyKey: key,
            businessDate,
            queueNumber,
            queueAssignedAt: awaitingQris ? null : now,
            status: awaitingQris
              ? OrderStatus.PENDING_PAYMENT
              : OrderStatus.PAID,
            paymentStatus: awaitingQris
              ? PaymentStatus.PENDING
              : PaymentStatus.PAID,
            currency: 'IDR',
            customerName: dto.customerName ?? null,
            customerEmail: dto.customerEmail ?? null,
            notes: dto.notes ?? null,
            expiresAt: new Date(
              now.getTime() + settings.orderExpiryMinutes * 60_000,
            ),
            paidAt: awaitingQris ? null : now,
            items: {
              create: toOrderItems(pricing),
            },
            statusLogs: {
              create: {
                fromStatus: null,
                toStatus: awaitingQris
                  ? OrderStatus.PENDING_PAYMENT
                  : OrderStatus.PAID,
                actorUserId: actor.userId,
                source: statusSource,
                note: awaitingQris
                  ? 'Order kasir menunggu QRIS'
                  : 'Order kasir tunai/EDC',
              },
            },
          },
          tx,
        );

        await this.audit.record(
          {
            outletId,
            actorUserId: actor.userId,
            action: 'ORDER_CREATED',
            entityType: 'order',
            entityId: created.id,
            after: {
              ...toAuditOrder(created),
              orderType: created.orderType,
              source: created.source,
            },
          },
          tx,
        );

        if (!awaitingQris) {
          await this.orders.createPayment(
            {
              orderId: created.id,
              provider: PaymentProvider.CASHIER,
              method: dto.paymentMethod,
              status: PaymentStatus.PAID,
              amount: pricing.total,
              referenceId: createPaymentReference(),
              paidAt: now,
            },
            tx,
          );

          await this.audit.record(
            {
              outletId,
              actorUserId: actor.userId,
              action: 'ORDER_PAID',
              entityType: 'order',
              entityId: created.id,
              after: toAuditOrder(created),
            },
            tx,
          );
        }

        if (!awaitingQris) {
          await recordQueueAssigned(
            this.audit,
            outletId,
            created.id,
            queueNumber,
            actor.userId,
            tx,
          );
        }

        const saved = await this.orders.findById(outletId, created.id, tx);
        if (!saved) {
          throw new NotFoundException('Order tidak ditemukan');
        }
        return saved;
      });

      if (!awaitingQris) {
        void this.receipts.sendForOrder(outletId, order.id);
      }

      const kdsOrder = toKdsOrderView(order);
      this.realtime.emitOrderCreated(order.outletId, { order: kdsOrder });
      if (order.status === OrderStatus.PAID) {
        this.realtime.emitOrderPaid(order.outletId, { order: kdsOrder });
        const queue = toDisplayQueueItem(order);
        if (queue) {
          this.realtime.emitQueueUpdated(order.outletId, { queue });
        }
      }
      return toView(order);
    } catch (error) {
      if (key && isUniqueConstraintError(error)) {
        const existing = await this.orders.findByIdempotencyKey(outletId, key);
        if (existing) {
          return toView(existing);
        }
      }
      throw error;
    }
  }
}
