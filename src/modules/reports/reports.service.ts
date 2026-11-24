import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderType, PaymentMethod } from '../../generated/prisma/client';
import { ReportRepository } from './report.repository';
import type {
  CancellationReport,
  DailyReport,
  ItemReport,
  ItemReportRow,
  PaymentReport,
  PaymentReportRow,
  ReportOrderTypeRow,
  TaxReport,
} from './report.types';

const ORDER_TYPES = [OrderType.DINE_IN, OrderType.TAKEAWAY];
const PAYMENT_METHODS = [
  PaymentMethod.QRIS,
  PaymentMethod.CASH,
  PaymentMethod.EDC,
];

@Injectable()
export class ReportsService {
  constructor(private readonly reports: ReportRepository) {}

  async daily(outletId: string, date?: string): Promise<DailyReport> {
    const { businessDate } = await this.resolveDate(outletId, date);
    const orders = await this.reports.findPaidOrders(outletId, businessDate);

    const byType = new Map<OrderType, ReportOrderTypeRow>(
      ORDER_TYPES.map((orderType) => [
        orderType,
        {
          orderType,
          orderCount: 0,
          subtotal: 0,
          tax: 0,
          service: 0,
          discount: 0,
          revenue: 0,
        },
      ]),
    );

    const totals = {
      orderCount: 0,
      subtotal: 0,
      tax: 0,
      service: 0,
      discount: 0,
      revenue: 0,
    };

    for (const order of orders) {
      const row = byType.get(order.orderType);
      if (!row) {
        continue;
      }
      row.orderCount += 1;
      row.subtotal += order.subtotal;
      row.tax += order.taxAmount;
      row.service += order.serviceAmount;
      row.discount += order.discountAmount;
      row.revenue += order.total;

      totals.orderCount += 1;
      totals.subtotal += order.subtotal;
      totals.tax += order.taxAmount;
      totals.service += order.serviceAmount;
      totals.discount += order.discountAmount;
      totals.revenue += order.total;
    }

    return {
      date: this.dateLabel(businessDate),
      ...totals,
      orderTypes: [...byType.values()],
    };
  }

  async payments(outletId: string, date?: string): Promise<PaymentReport> {
    const { businessDate } = await this.resolveDate(outletId, date);
    const orders = await this.reports.findPaidOrders(outletId, businessDate);
    const rows = new Map<string, PaymentReportRow>();

    for (const order of orders) {
      for (const payment of order.payments) {
        const key = `${order.orderType}:${payment.method}`;
        const row = rows.get(key) ?? {
          orderType: order.orderType,
          paymentMethod: payment.method,
          orderCount: 0,
          amount: 0,
        };
        row.orderCount += 1;
        row.amount += payment.amount;
        rows.set(key, row);
      }
    }

    const sorted = [...rows.values()].sort(
      (a, b) =>
        ORDER_TYPES.indexOf(a.orderType) - ORDER_TYPES.indexOf(b.orderType) ||
        PAYMENT_METHODS.indexOf(a.paymentMethod) -
          PAYMENT_METHODS.indexOf(b.paymentMethod),
    );

    return {
      date: this.dateLabel(businessDate),
      totalAmount: sorted.reduce((sum, row) => sum + row.amount, 0),
      rows: sorted,
    };
  }

  async items(
    outletId: string,
    limit = 50,
    date?: string,
  ): Promise<ItemReport> {
    const { businessDate } = await this.resolveDate(outletId, date);
    const orders = await this.reports.findPaidOrders(outletId, businessDate);
    const rows = new Map<string, ItemReportRow>();
    let totalQty = 0;
    let totalRevenue = 0;

    for (const order of orders) {
      for (const item of order.items) {
        const key = item.menuItemId ?? `name:${item.nameSnapshot}`;
        const row = rows.get(key) ?? {
          menuItemId: item.menuItemId,
          name: item.nameSnapshot,
          qty: 0,
          revenue: 0,
        };
        row.qty += item.qty;
        row.revenue += item.lineTotal;
        rows.set(key, row);
        totalQty += item.qty;
        totalRevenue += item.lineTotal;
      }
    }

    return {
      date: this.dateLabel(businessDate),
      totalQty,
      totalRevenue,
      rows: [...rows.values()]
        .sort(
          (a, b) =>
            b.qty - a.qty ||
            b.revenue - a.revenue ||
            a.name.localeCompare(b.name),
        )
        .slice(0, limit),
    };
  }

  async tax(outletId: string, date?: string): Promise<TaxReport> {
    const { businessDate } = await this.resolveDate(outletId, date);
    const orders = await this.reports.findPaidOrders(outletId, businessDate);
    const byType = new Map(
      ORDER_TYPES.map((orderType) => [
        orderType,
        { orderType, orderCount: 0, taxAmount: 0 },
      ]),
    );

    for (const order of orders) {
      const row = byType.get(order.orderType);
      if (!row) {
        continue;
      }
      row.orderCount += 1;
      row.taxAmount += order.taxAmount;
    }

    const rows = [...byType.values()];
    return {
      date: this.dateLabel(businessDate),
      totalTax: rows.reduce((sum, row) => sum + row.taxAmount, 0),
      rows,
    };
  }

  async cancellations(
    outletId: string,
    date?: string,
  ): Promise<CancellationReport> {
    const { businessDate } = await this.resolveDate(outletId, date);
    const orders = await this.reports.findCancelledOrders(
      outletId,
      businessDate,
    );
    const rows = orders.map((order) => ({
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderType: order.orderType,
      total: order.total,
      reason: order.cancelReason,
      cancelledAt: order.cancelledAt,
      cancelledByUserId: order.cancelledByUserId,
    }));

    return {
      date: this.dateLabel(businessDate),
      count: rows.length,
      totalAmount: rows.reduce((sum, row) => sum + row.total, 0),
      rows,
    };
  }

  private async resolveDate(outletId: string, date?: string) {
    const outlet = await this.reports.findOutlet(outletId);
    if (!outlet) {
      throw new NotFoundException('Outlet tidak ditemukan');
    }

    return {
      businessDate:
        date === undefined
          ? this.businessDate(new Date(), outlet.timezone)
          : this.parseBusinessDate(date),
    };
  }

  private parseBusinessDate(date: string): Date {
    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date
    ) {
      throw new BadRequestException('Tanggal tidak valid');
    }
    return parsed;
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

  private dateLabel(businessDate: Date): string {
    return businessDate.toISOString().slice(0, 10);
  }
}
