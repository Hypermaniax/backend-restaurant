import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  createPageResult,
  resolvePagination,
  type PageResult,
} from '../../common/pagination/pagination.dto';
import {
  CounterType,
  OrderSource,
  OrderStatus,
  OrderStatusSource,
  OrderType,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  UserRole,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { TablesService } from '../tables/tables.service';
import { RealtimeService } from '../realtime/realtime.service';
import type { AuthUser } from '../security/types/auth-user';
import type {
  CancelOrderDto,
  CashierOrderQuoteDto,
  ConfirmOrderPaymentDto,
  CreateCashierOrderDto,
  CreatePublicOrderDto,
  OrderListQueryDto,
  PublicOrderQuoteDto,
} from './dto/order.dto';
import { OrderRepository, type OrderRecord } from './order.repository';
import { toDisplayQueueItem, toKdsOrderView } from './order.presenter';
import type {
  DisplayQueueView,
  KdsOrderView,
  OrderDashboardView,
  OrderView,
  PaymentOrderView,
  PricingResult,
  PricingTotals,
} from './order.types';
import { PricingService } from './pricing.service';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrderRepository,
    private readonly pricing: PricingService,
    private readonly settings: SettingsService,
    private readonly tables: TablesService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  async quotePublic(dto: PublicOrderQuoteDto): Promise<PricingTotals> {
    const table = await this.tables.resolvePublicTable(dto.tableCode);
    return this.pricing.quote(table.outlet.id, OrderType.DINE_IN, dto.items);
  }

  async quoteCashier(
    outletId: string,
    dto: CashierOrderQuoteDto,
  ): Promise<PricingTotals> {
    return this.pricing.quote(outletId, dto.orderType, dto.items);
  }

  async createPublicOrder(
    dto: CreatePublicOrderDto,
    idempotencyKey?: string,
  ): Promise<OrderView> {
    const table = await this.tables.resolvePublicTable(dto.tableCode);
    const outletId = table.outlet.id;
    const key = this.normalizeIdempotencyKey(idempotencyKey);

    if (key) {
      const existing = await this.orders.findByIdempotencyKey(outletId, key);
      if (existing) {
        return this.toView(existing);
      }
    }

    const pricing = await this.pricing.price(
      outletId,
      OrderType.DINE_IN,
      dto.items,
    );
    const outlet = await this.orders.findOutlet(outletId);
    if (!outlet) {
      throw new NotFoundException('Outlet tidak ditemukan');
    }
    const settings = await this.settings.getSettings(outletId);
    const now = new Date();
    const businessDate = this.businessDate(now, outlet.timezone);

    try {
      const order = await this.prisma.$transaction(async (tx) => {
        const session = await this.tables.ensureSessionForOrder(
          outletId,
          table.id,
          tx,
        );
        const sequence = await this.orders.nextCounter(
          outletId,
          businessDate,
          CounterType.ORDER,
          tx,
        );

        return this.orders.createOrder(
          {
            ...this.toOrderPricing(pricing),
            outletId,
            orderType: OrderType.DINE_IN,
            source: OrderSource.CUSTOMER_QR,
            createdByUserId: null,
            tableId: table.id,
            sessionId: session.id,
            orderNumber: this.formatOrderNumber(businessDate, sequence),
            idempotencyKey: key,
            businessDate,
            queueNumber: null,
            queueAssignedAt: null,
            status: OrderStatus.AWAITING_CASH,
            paymentStatus: PaymentStatus.PENDING,
            currency: 'IDR',
            customerName: dto.customerName ?? null,
            notes: dto.notes ?? null,
            expiresAt: new Date(
              now.getTime() + settings.cashExpiryMinutes * 60_000,
            ),
            paidAt: null,
            items: {
              create: this.toOrderItems(pricing),
            },
            statusLogs: {
              create: {
                fromStatus: null,
                toStatus: OrderStatus.AWAITING_CASH,
                source: OrderStatusSource.CUSTOMER,
                note: 'Order customer QR',
              },
            },
          },
          tx,
        );
      });

      const view = this.toView(order);
      this.realtime.emitOrderCreated(order.outletId, {
        order: toKdsOrderView(order),
      });
      return view;
    } catch (error) {
      if (key && this.isUniqueError(error)) {
        const existing = await this.orders.findByIdempotencyKey(outletId, key);
        if (existing) {
          return this.toView(existing);
        }
      }
      throw error;
    }
  }

  async createCashierOrder(
    outletId: string,
    actor: AuthUser,
    dto: CreateCashierOrderDto,
    idempotencyKey?: string,
  ): Promise<OrderView> {
    const key = this.normalizeIdempotencyKey(idempotencyKey);

    if (key) {
      const existing = await this.orders.findByIdempotencyKey(outletId, key);
      if (existing) {
        return this.toView(existing);
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
    const businessDate = this.businessDate(now, outlet.timezone);
    const statusSource = this.statusSource(actor.role);
    const awaitingQris = dto.paymentMethod === PaymentMethod.QRIS;

    try {
      const order = await this.prisma.$transaction(async (tx) => {
        const session =
          dto.orderType === OrderType.DINE_IN
            ? await this.tables.requireSessionForOrder(
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
            ...this.toOrderPricing(pricing),
            outletId,
            orderType: dto.orderType,
            source:
              actor.role === UserRole.ADMIN
                ? OrderSource.ADMIN
                : OrderSource.CASHIER,
            createdByUserId: actor.userId,
            tableId: dto.orderType === OrderType.DINE_IN ? dto.tableId! : null,
            sessionId: session?.id ?? null,
            orderNumber: this.formatOrderNumber(businessDate, orderSequence),
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
            notes: dto.notes ?? null,
            expiresAt: new Date(
              now.getTime() + settings.orderExpiryMinutes * 60_000,
            ),
            paidAt: awaitingQris ? null : now,
            items: {
              create: this.toOrderItems(pricing),
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
              ...this.toAuditOrder(created),
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
              referenceId: this.paymentReference(),
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
              after: this.toAuditOrder(created),
            },
            tx,
          );
        }

        if (!awaitingQris) {
          await this.auditQueueAssigned(
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

      const kdsOrder = toKdsOrderView(order);
      this.realtime.emitOrderCreated(order.outletId, { order: kdsOrder });
      if (order.status === OrderStatus.PAID) {
        this.realtime.emitOrderPaid(order.outletId, { order: kdsOrder });
        const queue = toDisplayQueueItem(order);
        if (queue) {
          this.realtime.emitQueueUpdated(order.outletId, { queue });
        }
      }
      return this.toView(order);
    } catch (error) {
      if (key && this.isUniqueError(error)) {
        const existing = await this.orders.findByIdempotencyKey(outletId, key);
        if (existing) {
          return this.toView(existing);
        }
      }
      throw error;
    }
  }

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
    const statusSource = this.statusSource(actor.role);
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
          referenceId: this.paymentReference(),
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
          before: this.toAuditOrder(current),
          after: {
            ...this.toAuditOrder(current),
            status: OrderStatus.PAID,
            paymentStatus: PaymentStatus.PAID,
            queueNumber,
          },
        },
        tx,
      );

      await this.auditQueueAssigned(
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

    const kdsOrder = toKdsOrderView(order);
    this.realtime.emitOrderPaid(order.outletId, { order: kdsOrder });
    const queue = toDisplayQueueItem(order);
    if (queue) {
      this.realtime.emitQueueUpdated(order.outletId, { queue });
    }
    return this.toView(order);
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
    const statusSource = this.statusSource(actor.role);
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
          before: this.toAuditOrder(current),
          after: {
            ...this.toAuditOrder(current),
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

    this.realtime.emitOrderCancelled(order.outletId, {
      order: toKdsOrderView(order),
    });
    return this.toView(order);
  }

  async getCashierOrder(outletId: string, orderId: string): Promise<OrderView> {
    return this.toView(await this.requireOrder(outletId, orderId));
  }

  async listCashier(
    outletId: string,
    query: OrderListQueryDto,
  ): Promise<PageResult<OrderView>> {
    const pagination = resolvePagination(query);
    const { items, total } = await this.orders.listCashierOrders(
      outletId,
      query,
    );
    return createPageResult(
      items.map((order) => this.toView(order)),
      total,
      pagination,
    );
  }

  async dashboard(outletId: string): Promise<OrderDashboardView> {
    const outlet = await this.orders.findOutlet(outletId);
    if (!outlet) {
      throw new NotFoundException('Outlet tidak ditemukan');
    }

    const businessDate = this.businessDate(new Date(), outlet.timezone);
    const [revenueToday, openTables, pendingPayments, kdsQueue] =
      await Promise.all([
        this.orders.sumRevenue(outletId, businessDate),
        this.orders.countOpenTables(outletId),
        this.orders.countPendingPayments(outletId, businessDate),
        this.orders.countKdsQueue(outletId, businessDate),
      ]);

    return {
      businessDate,
      revenueToday,
      openTables,
      pendingPayments,
      kdsQueue,
    };
  }

  async listKds(outletId: string): Promise<KdsOrderView[]> {
    const orders = await this.orders.listKdsOrders(outletId);
    return orders.map((order) => toKdsOrderView(order));
  }

  async getKdsOrder(outletId: string, orderId: string): Promise<KdsOrderView> {
    return toKdsOrderView(await this.requireOrder(outletId, orderId));
  }

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
          before: this.toAuditOrder(current),
          after: {
            ...this.toAuditOrder(current),
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

  async getDisplayQueue(outletId?: string): Promise<DisplayQueueView> {
    const outlet = outletId
      ? await this.orders.findOutlet(outletId)
      : await this.orders.findFirstOutlet();
    if (!outlet) {
      throw new NotFoundException('Outlet tidak ditemukan');
    }

    const businessDate = this.businessDate(new Date(), outlet.timezone);
    const orders = await this.orders.listDisplayOrders(outlet.id, businessDate);
    const preparing: DisplayQueueView['preparing'] = [];
    const ready: DisplayQueueView['ready'] = [];

    for (const order of orders) {
      const queue = toDisplayQueueItem(order);
      if (!queue) {
        continue;
      }
      if (queue.status === OrderStatus.READY) {
        ready.push(queue);
      } else {
        preparing.push(queue);
      }
    }

    return { preparing, ready };
  }

  async getPublicPaymentOrder(
    tableCode: string,
    orderId: string,
  ): Promise<PaymentOrderView> {
    const table = await this.tables.resolvePublicTable(tableCode);
    const order = await this.orders.findById(table.outlet.id, orderId);
    if (!order || order.tableId !== table.id) {
      throw new NotFoundException('Order tidak ditemukan');
    }
    return this.toPaymentOrder(order);
  }

  async getCashierPaymentOrder(
    outletId: string,
    orderId: string,
  ): Promise<PaymentOrderView> {
    return this.toPaymentOrder(await this.requireOrder(outletId, orderId));
  }

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
              ? this.statusSource(actor.role)
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
        before: this.toAuditOrder(current),
        after: {
          ...this.toAuditOrder(current),
          status: OrderStatus.PAID,
          paymentStatus: PaymentStatus.PAID,
          queueNumber,
        },
      },
      tx,
    );

    await this.auditQueueAssigned(
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

  private normalizeIdempotencyKey(key: string | undefined): string | null {
    if (key === undefined) {
      return null;
    }
    const normalized = key.trim();
    if (!normalized) {
      return null;
    }
    if (normalized.length > 64) {
      throw new BadRequestException('Idempotency key maksimal 64 karakter');
    }
    return normalized;
  }

  private toOrderPricing(pricing: PricingResult) {
    return {
      subtotal: pricing.subtotal,
      discountAmount: pricing.discountAmount,
      serviceAmount: pricing.serviceAmount,
      taxAmount: pricing.taxAmount,
      total: pricing.total,
      taxRateBp: pricing.taxRateBp,
      taxInclusive: pricing.taxInclusive,
      taxBaseIncludesService: pricing.taxBaseIncludesService,
      serviceRateBp: pricing.serviceRateBp,
    };
  }

  private toOrderItems(pricing: PricingResult) {
    return pricing.items.map((item) => ({
      menuItemId: item.menuItemId,
      nameSnapshot: item.nameSnapshot,
      unitPrice: item.unitPrice,
      qty: item.qty,
      notes: item.notes,
      lineTotal: item.lineTotal,
      modifiers: {
        create: item.modifiers.map((modifier) => ({
          modifierOptionId: modifier.modifierOptionId,
          nameSnapshot: modifier.nameSnapshot,
          priceDelta: modifier.priceDelta,
          qty: modifier.qty,
        })),
      },
    }));
  }

  private businessDate(now: Date, timezone: string): Date {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const part = (type: string) =>
      Number(parts.find((item) => item.type === type)?.value);

    return new Date(Date.UTC(part('year'), part('month') - 1, part('day')));
  }

  private formatOrderNumber(businessDate: Date, sequence: number): string {
    const date = businessDate.toISOString().slice(0, 10).replaceAll('-', '');
    return `${date}-${String(sequence).padStart(4, '0')}`;
  }

  private paymentReference(): string {
    return `PAY-${randomUUID()}`;
  }

  private async auditQueueAssigned(
    outletId: string,
    orderId: string,
    queueNumber: number | null,
    actorUserId: string | undefined,
    tx: Prisma.TransactionClient,
  ) {
    if (queueNumber === null) {
      return;
    }
    await this.audit.record(
      {
        outletId,
        actorUserId,
        action: 'QUEUE_ASSIGNED',
        entityType: 'order',
        entityId: orderId,
        after: {
          queueNumber,
          queueDisplay: `A-${String(queueNumber).padStart(3, '0')}`,
        },
      },
      tx,
    );
  }

  private statusSource(role: UserRole): OrderStatusSource {
    return role === UserRole.ADMIN
      ? OrderStatusSource.ADMIN
      : OrderStatusSource.CASHIER;
  }

  private toPaymentOrder(order: OrderRecord): PaymentOrderView {
    return {
      id: order.id,
      outletId: order.outletId,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      queueNumber: order.queueNumber,
      total: order.total,
      businessDate: order.businessDate,
      expiresAt: order.expiresAt,
      tableId: order.tableId,
      tableCode: order.table?.code ?? null,
    };
  }

  private toAuditOrder(order: OrderRecord) {
    return {
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      total: order.total,
      queueNumber: order.queueNumber,
    };
  }

  private toView(order: OrderRecord): OrderView {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      orderType: order.orderType,
      source: order.source,
      status: order.status,
      paymentStatus: order.paymentStatus,
      table: order.table,
      sessionId: order.sessionId,
      queueNumber: order.queueNumber,
      queueDisplay:
        order.queueNumber === null
          ? null
          : `A-${String(order.queueNumber).padStart(3, '0')}`,
      customerName: order.customerName,
      notes: order.notes,
      currency: order.currency,
      subtotal: order.subtotal,
      discountAmount: order.discountAmount,
      serviceAmount: order.serviceAmount,
      taxAmount: order.taxAmount,
      total: order.total,
      taxInclusive: order.taxInclusive,
      taxBaseIncludesService: order.taxBaseIncludesService,
      taxRateBp: order.taxRateBp,
      serviceRateBp: order.serviceRateBp,
      expiresAt: order.expiresAt,
      paidAt: order.paidAt,
      preparingAt: order.preparingAt,
      readyAt: order.readyAt,
      servedAt: order.servedAt,
      cancelledAt: order.cancelledAt,
      cancelReason: order.cancelReason,
      createdAt: order.createdAt,
      items: order.items.map((item) => ({
        id: item.id,
        menuItemId: item.menuItemId,
        nameSnapshot: item.nameSnapshot,
        unitPrice: item.unitPrice,
        qty: item.qty,
        notes: item.notes,
        lineTotal: item.lineTotal,
        modifiers: item.modifiers.map((modifier) => ({
          id: modifier.id,
          modifierOptionId: modifier.modifierOptionId,
          nameSnapshot: modifier.nameSnapshot,
          priceDelta: modifier.priceDelta,
          qty: modifier.qty,
        })),
      })),
      payments: order.payments.map((payment) => ({
        id: payment.id,
        provider: payment.provider,
        method: payment.method,
        status: payment.status,
        amount: payment.amount,
        paidAt: payment.paidAt,
      })),
    };
  }

  private isUniqueError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
