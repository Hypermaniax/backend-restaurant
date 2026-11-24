import { Injectable, NotFoundException } from '@nestjs/common';
import {
  createPageResult,
  resolvePagination,
  type PageResult,
} from '../../common/pagination/pagination.dto';
import { OrderStatus } from '../../generated/prisma/client';
import { TablesService } from '../tables/tables.service';
import type { OrderListQueryDto } from './dto/order.dto';
import { toPaymentOrder, toView } from './order.mapper';
import { OrderRepository, type OrderRecord } from './order.repository';
import { toDisplayQueueItem, toKdsOrderView } from './order.presenter';
import type {
  DisplayQueueView,
  KdsOrderView,
  OrderDashboardView,
  OrderView,
  PaymentOrderView,
} from './order.types';
import { resolveBusinessDate } from './order.utils';

@Injectable()
export class OrderQueryService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly tables: TablesService,
  ) {}

  async getCashierOrder(outletId: string, orderId: string): Promise<OrderView> {
    return toView(await this.requireOrder(outletId, orderId));
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
      items.map((order) => toView(order)),
      total,
      pagination,
    );
  }

  async dashboard(outletId: string): Promise<OrderDashboardView> {
    const outlet = await this.orders.findOutlet(outletId);
    if (!outlet) {
      throw new NotFoundException('Outlet tidak ditemukan');
    }

    const businessDate = resolveBusinessDate(new Date(), outlet.timezone);
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

  async getDisplayQueue(outletId?: string): Promise<DisplayQueueView> {
    const outlet = outletId
      ? await this.orders.findOutlet(outletId)
      : await this.orders.findFirstOutlet();
    if (!outlet) {
      throw new NotFoundException('Outlet tidak ditemukan');
    }

    const businessDate = resolveBusinessDate(new Date(), outlet.timezone);
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
    return toPaymentOrder(order);
  }

  async getCashierPaymentOrder(
    outletId: string,
    orderId: string,
  ): Promise<PaymentOrderView> {
    return toPaymentOrder(await this.requireOrder(outletId, orderId));
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
