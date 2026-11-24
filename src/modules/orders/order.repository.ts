import { Injectable } from '@nestjs/common';
import {
  type CounterType,
  type OrderStatus,
  Prisma,
} from '../../generated/prisma/client';
import { resolvePagination } from '../../common/pagination/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import type { OrderListQueryDto } from './dto/order.dto';

const ORDER_INCLUDE = {
  table: { select: { id: true, code: true, name: true } },
  items: {
    include: { modifiers: true },
    orderBy: { id: 'asc' as const },
  },
  payments: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.OrderInclude;

const ORDER_MENU_INCLUDE = {
  category: { select: { isActive: true } },
  modifierGroups: {
    include: {
      group: {
        include: { options: true },
      },
    },
  },
} satisfies Prisma.MenuItemInclude;

export type OrderRecord = Prisma.OrderGetPayload<{
  include: typeof ORDER_INCLUDE;
}>;
export type OrderMenuRecord = Prisma.MenuItemGetPayload<{
  include: typeof ORDER_MENU_INCLUDE;
}>;

@Injectable()
export class OrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOutlet(outletId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.outlet.findUnique({
      where: { id: outletId },
      select: { id: true, timezone: true },
    });
  }

  async findFirstOutlet(tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.outlet.findFirst({
      select: { id: true, timezone: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findMenuItemsForOrder(
    outletId: string,
    menuItemIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<OrderMenuRecord[]> {
    const client = tx ?? this.prisma;
    return client.menuItem.findMany({
      where: { outletId, id: { in: menuItemIds } },
      include: ORDER_MENU_INCLUDE,
    });
  }

  async findByIdempotencyKey(
    outletId: string,
    idempotencyKey: string,
    tx?: Prisma.TransactionClient,
  ): Promise<OrderRecord | null> {
    const client = tx ?? this.prisma;
    return client.order.findFirst({
      where: { outletId, idempotencyKey },
      include: ORDER_INCLUDE,
    });
  }

  async findById(
    outletId: string,
    orderId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<OrderRecord | null> {
    const client = tx ?? this.prisma;
    return client.order.findFirst({
      where: { id: orderId, outletId },
      include: ORDER_INCLUDE,
    });
  }

  async createOrder(
    data: Prisma.OrderUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<OrderRecord> {
    const client = tx ?? this.prisma;
    return client.order.create({ data, include: ORDER_INCLUDE });
  }

  async markReceiptEmailSent(outletId: string, orderId: string) {
    await this.prisma.order.updateMany({
      where: { id: orderId, outletId, receiptEmailSentAt: null },
      data: { receiptEmailSentAt: new Date() },
    });
  }

  async createPayment(
    data: Prisma.PaymentUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.payment.create({ data });
  }

  async expirePendingPayments(
    orderId: string,
    status: 'FAILED' | 'EXPIRED',
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.payment.updateMany({
      where: {
        orderId,
        status: 'PENDING',
        method: 'QRIS',
      },
      data: { status },
    });
  }

  async createStatusLog(
    data: Prisma.OrderStatusLogUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.orderStatusLog.create({ data });
  }

  async transition(
    outletId: string,
    orderId: string,
    fromStatuses: OrderStatus[],
    data: Prisma.OrderUncheckedUpdateManyInput,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = tx ?? this.prisma;
    const result = await client.order.updateMany({
      where: {
        id: orderId,
        outletId,
        status: { in: fromStatuses },
      },
      data,
    });
    return result.count === 1;
  }

  async listKdsOrders(outletId: string): Promise<OrderRecord[]> {
    return this.prisma.order.findMany({
      where: {
        outletId,
        paymentStatus: 'PAID',
        status: { in: ['PAID', 'PREPARING', 'READY'] },
      },
      include: ORDER_INCLUDE,
      orderBy: [{ queueNumber: 'asc' }, { createdAt: 'asc' }],
      take: 100,
    });
  }

  async listDisplayOrders(
    outletId: string,
    businessDate: Date,
  ): Promise<OrderRecord[]> {
    return this.prisma.order.findMany({
      where: {
        outletId,
        businessDate,
        paymentStatus: 'PAID',
        queueNumber: { not: null },
        status: { in: ['PAID', 'PREPARING', 'READY'] },
      },
      include: ORDER_INCLUDE,
      orderBy: [{ queueNumber: 'asc' }],
      take: 200,
    });
  }

  async listCashierOrders(outletId: string, query: OrderListQueryDto) {
    const page = resolvePagination(query);
    const where = {
      outletId,
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.orderType === undefined ? {} : { orderType: query.orderType }),
      ...(query.source === undefined ? {} : { source: query.source }),
      ...(query.tableId === undefined ? {} : { tableId: query.tableId }),
      ...(query.date === undefined
        ? {}
        : { businessDate: new Date(`${query.date}T00:00:00.000Z`) }),
      ...(query.orderNumber === undefined
        ? {}
        : {
            orderNumber: {
              contains: query.orderNumber,
              mode: 'insensitive' as const,
            },
          }),
    };
    const orderBy = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];

    if (page.all) {
      const items = await this.prisma.order.findMany({
        where,
        include: ORDER_INCLUDE,
        orderBy,
      });
      return { items, total: items.length };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: ORDER_INCLUDE,
        orderBy,
        skip: page.skip,
        take: page.pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);

    return { items, total };
  }

  async nextCounter(
    outletId: string,
    counterDate: Date,
    counterType: CounterType,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    const counter = await client.dailyCounter.upsert({
      where: {
        outletId_counterDate_counterType: {
          outletId,
          counterDate,
          counterType,
        },
      },
      create: {
        outletId,
        counterDate,
        counterType,
        lastNumber: 1,
      },
      update: {
        lastNumber: { increment: 1 },
      },
    });
    return counter.lastNumber;
  }

  async sumRevenue(outletId: string, businessDate: Date): Promise<number> {
    const result = await this.prisma.order.aggregate({
      where: {
        outletId,
        businessDate,
        paymentStatus: 'PAID',
      },
      _sum: { total: true },
    });
    return result._sum.total ?? 0;
  }

  async countOpenTables(outletId: string): Promise<number> {
    return this.prisma.tableSession.count({
      where: {
        status: 'OPEN',
        table: { outletId },
      },
    });
  }

  async countPendingPayments(
    outletId: string,
    businessDate: Date,
  ): Promise<number> {
    return this.prisma.order.count({
      where: {
        outletId,
        businessDate,
        status: { in: ['PENDING_PAYMENT', 'AWAITING_CASH'] },
      },
    });
  }

  async countKdsQueue(outletId: string, businessDate: Date): Promise<number> {
    return this.prisma.order.count({
      where: {
        outletId,
        businessDate,
        status: { in: ['PAID', 'PREPARING', 'READY'] },
      },
    });
  }

  async findStaleOrders(now: Date, take = 100) {
    return this.prisma.order.findMany({
      where: {
        status: { in: ['PENDING_PAYMENT', 'AWAITING_CASH'] },
        expiresAt: { lte: now },
      },
      select: { id: true, outletId: true, status: true, sessionId: true },
      orderBy: { expiresAt: 'asc' },
      take,
    });
  }
}
